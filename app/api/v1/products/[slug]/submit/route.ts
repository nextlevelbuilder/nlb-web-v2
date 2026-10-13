import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { products, productRevisions, members, orders, customers, entitlements } from "@/lib/db/schema";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { submitRevisionForReview, executeAutomatedChecks } from "@/lib/domain/moderation";
import { claimEarlyBirdSlot } from "@/lib/domain/catalog";
import { createCheckoutSession, PRODUCT_IDS } from "@/lib/polar";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const SubmitBodySchema = z.object({
  revisionId: z.string().uuid().optional(),
  submissionNotes: z.string().max(500).optional(),
  isFastTrack: z.boolean().optional(),
  payOnly: z.boolean().optional(),
});

export async function POST(request: Request, { params }: RouteParams) {
  // 1. Authenticate user session or API Key
  const caller = await resolveCaller(request.headers, undefined, {
    scope: "mcp:write", method: request.method, path: new URL(request.url).pathname,
  });
  if (!caller || !caller.user) {
    return NextResponse.json({ error: "Unauthorized: Sign in or valid API key required to submit products" }, { status: 401 });
  }

  const user = caller.user;

  const { slug } = await params;
  const db = getDb();

  try {
    const [product] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
    if (!product) {
      return NextResponse.json({ error: `Product '${slug}' not found` }, { status: 404 });
    }

    // 2. Verify caller belongs to product's organization (anti-IDOR)
    const [membership] = await db
      .select()
      .from(members)
      .where(and(eq(members.organizationId, product.orgId), eq(members.userId, user.id)))
      .limit(1);

    if (!membership && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: You are not a member of this organization" }, { status: 403 });
    }

    const body = await request.json();
    const validated = SubmitBodySchema.parse(body);

    // 3. Atomically evaluate Early Bird 100-slot qualification
    const earlyBird = await claimEarlyBirdSlot(product.id, db);
    const targetPolarProductId = earlyBird.isEarlyBird
      ? PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD
      : PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD;

    // 4. Payment Verification Gate
    // Require completed Polar checkout unless caller is an admin
    const isAdmin = user.role === "admin";
    let isPaid = isAdmin;

    if (!isPaid) {
      const [paidOrder] = await db
        .select({ id: orders.id, polarProductId: orders.polarProductId })
        .from(orders)
        .innerJoin(customers, eq(orders.customerId, customers.id))
        .where(
          and(
            eq(customers.email, user.email),
            inArray(orders.polarProductId, [
              PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD,
              PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD,
            ]),
            eq(orders.status, "paid"),
            eq(orders.productSlug, slug) // Strict 1:1 product slug binding
          )
        )
        .limit(1);
      if (paidOrder) {
        isPaid = true;
      } else {
        // Check for unassigned slot from user's paid orders
        const [unassignedOrder] = await db
          .select({ id: orders.id, polarProductId: orders.polarProductId })
          .from(orders)
          .innerJoin(customers, eq(orders.customerId, customers.id))
          .where(
            and(
              eq(customers.email, user.email),
              inArray(orders.polarProductId, [
                PRODUCT_IDS.PUBLISHING_TOOLKIT_EARLY_BIRD,
                PRODUCT_IDS.PUBLISHING_TOOLKIT_STANDARD,
              ]),
              eq(orders.status, "paid"),
              isNull(orders.productSlug) // Unassigned slot purchased in advance
            )
          )
          .orderBy(desc(orders.createdAt))
          .limit(1);

        if (unassignedOrder) {
          isPaid = true;
          // Bind this unassigned slot to this product
          await db
            .update(orders)
            .set({ productSlug: slug })
            .where(eq(orders.id, unassignedOrder.id));

        } else {
          // Check for active submission slot entitlement
          const [entitlement] = await db
            .select()
            .from(entitlements)
            .where(
              and(
                eq(entitlements.userId, user.id),
                eq(entitlements.featureKey, "submission_slot"),
                eq(entitlements.isActive, true)
              )
            )
            .limit(1);

          if (entitlement) {
            isPaid = true;
          }
        }
      }
    }
    // 5. If not paid or payOnly requested, return Polar checkout session (HTTP 402)
    if (!isPaid || validated.payOnly) {
      const checkout = await createCheckoutSession(
        targetPolarProductId,
        user.email,
        slug
      );
      return NextResponse.json(
        {
          error: "Payment required: Please complete Polar checkout to activate your Studio publishing workspace / submission.",
          requiresPayment: true,
          checkoutUrl: checkout.url,
          amount: earlyBird.isEarlyBird ? "$24.50" : "$49.00",
          isEarlyBird: earlyBird.isEarlyBird,
          slotNumber: earlyBird.slotNumber,
        },
        { status: 402 }
      );
    }

    let revisionId = validated.revisionId;
    if (!revisionId) {
      const [latest] = await db
        .select()
        .from(productRevisions)
        .where(eq(productRevisions.productId, product.id))
        .orderBy(desc(productRevisions.revisionNumber))
        .limit(1);

      if (!latest) {
        return NextResponse.json({ error: "No revision found for product" }, { status: 400 });
      }
      revisionId = latest.id;
    }

    const [revision] = await db
      .select()
      .from(productRevisions)
      .where(and(eq(productRevisions.id, revisionId), eq(productRevisions.productId, product.id)))
      .limit(1);

    if (!revision) {
      return NextResponse.json({ error: "Revision not found" }, { status: 404 });
    }

    // Submit for review using authenticated user ID
    const { submission, modCase } = await submitRevisionForReview({
      productId: product.id,
      revisionId: revision.id,
      submitterId: user.id,
      submissionNotes: validated.submissionNotes,
      isFastTrack: validated.isFastTrack,
    });

    // Trigger automated pre-screening checks
    await executeAutomatedChecks({
      caseId: modCase.id,
      websiteUrl: product.websiteUrl,
      title: revision.title,
      tagline: revision.tagline,
      description: revision.description,
    });

    return NextResponse.json({
      data: {
        submissionId: submission.id,
        caseId: modCase.id,
        status: "awaiting_human",
        isEarlyBird: earlyBird.isEarlyBird,
      },
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Submission failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
