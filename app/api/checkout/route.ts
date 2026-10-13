import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/auth-api-key";
import { MCP_ASSERTION_HEADER } from "@/lib/auth-mcp-delegation";
import { createCheckoutSession, PRODUCT_IDS, type ProductId } from "@/lib/polar";
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
});
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
    const { productId, customerEmail, productSlug } = checkoutSchema.parse(requestBody);

    if (caller && customerEmail && customerEmail.toLowerCase() !== caller.user.email.toLowerCase()) {
      return NextResponse.json({ error: "Customer email must match the authenticated user" }, { status: 403 });
    }

    const checkout = await createCheckoutSession(
      productId as ProductId,
      caller ? caller.user.email : customerEmail,
      productSlug as string | undefined
    );

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
