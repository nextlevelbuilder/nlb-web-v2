import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/auth-api-key";
import { MCP_ASSERTION_HEADER } from "@/lib/auth-mcp-delegation";
import { getAuth } from "@/lib/auth";
import { createCheckoutSession, isMembershipProduct, PRODUCT_IDS, type CheckoutSessionOptions, type ProductId } from "@/lib/polar";
import { env } from "@/lib/env";
import { isOnboardingV2Enabled, onboardingPath } from "@/lib/onboarding/flags";
import { defaultLocale, isLocale, locales, type Locale } from "@/i18n/routing";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { polar } from "@/lib/polar";
import { ReferralError } from "@/lib/referrals/referral-errors";
import { AFFILIATE_COOKIE, attachCheckoutId, attributeCheckout, type AttributionAttempt } from "@/lib/referrals/affiliate-checkout";
import { isAffiliatesEnabled } from "@/lib/referrals/referral-env";

/** Reads one cookie from the request header. */
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const checkoutSchema = z.object({
  productId: z.enum([
    // Premium Package
    PRODUCT_IDS.PREMIUM_QUARTERLY,
    PRODUCT_IDS.PREMIUM_ANNUAL,
    // VIP Package
    PRODUCT_IDS.VIP_QUARTERLY,
    PRODUCT_IDS.VIP_ANNUAL,
    // Publishing Studio Toolkit
    PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD,
    PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD,
  ]),
  customerEmail: z.string().email().optional(),
  productSlug: z.string().optional(),
  locale: z.enum(locales).optional(),
  /** Referral code the buyer brought (`?ref=` or typed). Applies to signed-in buyers only. */
  referralCode: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{4,32}$/).optional(),
});

/** Buyer locale: explicit body field, else the `/vi` prefix of the page that started checkout, else the default. */
function resolveCheckoutLocale(request: Request, bodyLocale: Locale | undefined): Locale {
  if (bodyLocale) return bodyLocale;
  try {
    const referer = request.headers.get("referer");
    const first = referer ? new URL(referer).pathname.split("/")[1] : undefined;
    if (isLocale(first)) return first;
  } catch {
    // Malformed referer: fall through to the default.
  }
  return defaultLocale;
}

/** The signed-in NLB user from the Better Auth session cookie, if any. Never trusted from the body. */
async function sessionUser(request: Request): Promise<{ id: string; email: string | null } | undefined> {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const user = session?.user;
    if (!user?.id) return undefined;
    return { id: user.id, email: typeof user.email === "string" && user.email ? user.email : null };
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  let requestBody: any;

  try {
    const delegated = request.headers.has(MCP_ASSERTION_HEADER);
    const caller = delegated ? await resolveCaller(request.headers, undefined, {
      scope: "mcp:write", method: request.method, path: new URL(request.url).pathname,
    }) : null;
    if (delegated && !caller) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requestBody = await request.json();
    const { productId, customerEmail, productSlug, locale, referralCode } = checkoutSchema.parse(requestBody);

    if (caller && customerEmail && customerEmail.toLowerCase() !== caller.user.email.toLowerCase()) {
      return NextResponse.json({ error: "Customer email must match the authenticated user" }, { status: 403 });
    }

    // Onboarding v2: memberships land on the first-party onboarding page, and a signed-in buyer is
    // bound to the Polar customer server-side. The checkout email of a signed-in buyer is prefilled
    // with their account email, never one from the body. Polar lets the buyer edit it, so ownership
    // is enforced when the customer is linked (`canLinkFromMetadata`), not here. Directory and
    // toolkit checkouts are unchanged.
    const options: CheckoutSessionOptions = {};
    let checkoutEmail = caller ? caller.user.email : customerEmail;
    if (isOnboardingV2Enabled() && isMembershipProduct(productId)) {
      const checkoutLocale = resolveCheckoutLocale(request, locale);
      options.successUrl = `${env.NEXT_PUBLIC_APP_URL}${onboardingPath(checkoutLocale)}?checkout_id={CHECKOUT_ID}`;
      options.locale = checkoutLocale;
      const buyer = caller ? { id: caller.user.id, email: caller.user.email } : await sessionUser(request);
      if (buyer) {
        options.nlbUserId = buyer.id;
        checkoutEmail = buyer.email ?? undefined;
      }
    }

    // Referral: decided server-side from the signed-in buyer, the code or click cookie and the
    // affiliate's current terms; the binding id travels in Polar metadata for the webhook. Off (no
    // session lookup, no cookie read) while the program is disabled.
    const affiliatesOn = isAffiliatesEnabled();
    let referral: AttributionAttempt | null = null;
    if (affiliatesOn && isMembershipProduct(productId)) {
      const buyer = caller ? { id: caller.user.id, email: caller.user.email } : await sessionUser(request);
      const cookieValue = readCookie(request, AFFILIATE_COOKIE);
      if (buyer && (referralCode || cookieValue)) {
        referral = await attributeCheckout(getDb(), polar, {
          buyerUserId: buyer.id,
          polarProductId: productId,
          explicitCode: referralCode ?? null,
          cookieValue,
        });
        if (referral.applied) {
          options.nlbUserId = buyer.id;
          options.referral = { attributionId: referral.attributionId, discountId: referral.polarDiscountId };
          checkoutEmail = checkoutEmail ?? buyer.email ?? undefined;
        }
      }
    }

    const checkoutArgs = [productId as ProductId, checkoutEmail, productSlug as string | undefined] as const;
    const checkout = Object.keys(options).length > 0
      ? await createCheckoutSession(...checkoutArgs, options)
      : await createCheckoutSession(...checkoutArgs);

    if (!checkout.url) {
      console.error("Checkout created but no URL returned", { checkoutId: checkout.id, reason: "missing_url" });
      return NextResponse.json(
        { error: "Failed to create checkout session: No checkout URL returned" },
        { status: 500 }
      );
    }

    if (referral?.applied) {
      // Bookkeeping only: the attribution id already travels in the checkout metadata, so a failure
      // here is logged and never fails the purchase.
      await attachCheckoutId(getDb(), referral.attributionId, checkout.id).catch((error: unknown) => {
        console.error("referral checkout id was not recorded", { error: error instanceof Error ? error.message : "unknown" });
      });
    }
    const referralResult = referral
      ? referral.applied
        ? { applied: true, code: referral.code, discountBps: referral.discountBps }
        : referralCode
          ? { applied: false, reason: referral.reason }
          : undefined
      : referralCode && affiliatesOn
        ? { applied: false, reason: "sign_in_required" }
        : undefined;
    return NextResponse.json({ url: checkout.url, ...(referralResult ? { referral: referralResult } : {}) });
  } catch (error) {
    if (error instanceof ReferralError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    // Handle validation errors
    if (error instanceof z.ZodError) {
      console.error("Validation error:", error.errors);
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    // Handle Polar API errors
    if (error && typeof error === "object" && "statusCode" in error) {
      const statusCode = (error as any).statusCode;
      const errorBody = (error as any).body;

      // Log detailed error for debugging
      console.error("Polar API error:", {
        statusCode,
        // Polar echoes the submitted input (customer email) in validation details, so keep only type and message.
        error: summarizePolarError(errorBody),
        productId: requestBody?.productId,
        timestamp: new Date().toISOString(),
      });

      // Handle 422 Unprocessable Entity (validation errors)
      if (statusCode === 422) {
        return NextResponse.json(
          {
            error: "Invalid product configuration",
            message: "The product ID is invalid or not properly configured. Please contact support.",
            details: errorBody?.detail || "Product validation failed",
          },
          { status: 422 }
        );
      }

      // Handle 401 Unauthorized
      if (statusCode === 401) {
        return NextResponse.json(
          {
            error: "Authentication failed",
            message: "Unable to authenticate with payment provider. Please contact support.",
          },
          { status: 500 } // Don't expose auth issues to client
        );
      }

      // Handle other API errors
      return NextResponse.json(
        {
          error: "Payment service error",
          message: "Unable to create checkout session. Please try again or contact support.",
        },
        { status: 502 }
      );
    }

    // Handle unknown errors
    console.error("Unexpected checkout error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        message: "An unexpected error occurred. Please try again or contact support.",
      },
      { status: 500 }
    );
  }
}

function summarizePolarError(body: unknown) {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return undefined;
  return detail.map((item) => ({
    loc: (item as { loc?: unknown })?.loc,
    type: (item as { type?: unknown })?.type,
    msg: (item as { msg?: unknown })?.msg,
  }));
}
