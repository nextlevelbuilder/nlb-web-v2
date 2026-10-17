import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/auth-api-key";
import { MCP_ASSERTION_HEADER } from "@/lib/auth-mcp-delegation";
import { getAuth } from "@/lib/auth";
import { createCheckoutSession, isMembershipProduct, PRODUCT_IDS, type CheckoutSessionOptions, type ProductId } from "@/lib/polar";
import { env } from "@/lib/env";
import { isOnboardingV2Enabled, onboardingPath } from "@/lib/onboarding/flags";
import { defaultLocale, isLocale, locales, type Locale } from "@/i18n/routing";
import { z } from "zod";

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

/** The signed-in NLB user id from the Better Auth session cookie, if any. Never trusted from the body. */
async function sessionUserId(request: Request): Promise<string | undefined> {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    return session?.user?.id ?? undefined;
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
    const { productId, customerEmail, productSlug, locale } = checkoutSchema.parse(requestBody);

    if (caller && customerEmail && customerEmail.toLowerCase() !== caller.user.email.toLowerCase()) {
      return NextResponse.json({ error: "Customer email must match the authenticated user" }, { status: 403 });
    }

    // Onboarding v2: memberships land on the first-party onboarding page, and a signed-in buyer is
    // bound to the Polar customer server-side. Directory and toolkit checkouts are unchanged.
    const options: CheckoutSessionOptions = {};
    if (isOnboardingV2Enabled() && isMembershipProduct(productId)) {
      const checkoutLocale = resolveCheckoutLocale(request, locale);
      options.successUrl = `${env.NEXT_PUBLIC_APP_URL}${onboardingPath(checkoutLocale)}?checkout_id={CHECKOUT_ID}`;
      options.locale = checkoutLocale;
      options.nlbUserId = caller ? caller.user.id : await sessionUserId(request);
    }

    const checkoutArgs = [productId as ProductId, caller ? caller.user.email : customerEmail, productSlug as string | undefined] as const;
    const checkout = Object.keys(options).length > 0
      ? await createCheckoutSession(...checkoutArgs, options)
      : await createCheckoutSession(...checkoutArgs);

    if (!checkout.url) {
      console.error("Checkout created but no URL returned:", checkout);
      return NextResponse.json(
        { error: "Failed to create checkout session: No checkout URL returned" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
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
        error: errorBody,
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
    console.error("Unexpected checkout error:", error);
    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        message: "An unexpected error occurred. Please try again or contact support.",
      },
      { status: 500 }
    );
  }
}
