import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { products, members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createProductRevision } from "@/lib/domain/catalog";
import { ProductDocumentSchema } from "@/packages/contracts/src";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const CreateRevisionBodySchema = z.object({
  document: ProductDocumentSchema,
});

export async function POST(request: Request, { params }: RouteParams) {
  // 1. Authenticate user session or API Key
  const caller = await resolveCaller(request.headers, undefined, {
    scope: "mcp:write", method: request.method, path: new URL(request.url).pathname,
  });
  if (!caller || !caller.user) {
    return NextResponse.json({ error: "Unauthorized: Sign in or valid API key required to create revisions" }, { status: 401 });
  }

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
      .where(and(eq(members.organizationId, product.orgId), eq(members.userId, caller.user.id)))
      .limit(1);

    if (!membership && caller.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: You are not a member of this organization" }, { status: 403 });
    }

    const body = await request.json();
    const validated = CreateRevisionBodySchema.parse(body);

    const revision = await createProductRevision({
      productId: product.id,
      createdBy: caller.user.id,
      document: validated.document,
    });

    return NextResponse.json({ data: revision }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to create revision";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
