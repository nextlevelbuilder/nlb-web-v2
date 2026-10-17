import { NextResponse } from "next/server";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getPublishedProducts, createProductDraft } from "@/lib/domain/catalog";
import { z } from "zod";
import { HttpUrlSchema } from "@/packages/contracts/src/http-url";

const CreateDraftSchema = z.object({
  orgId: z.string().min(1),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(100),
  tagline: z.string().min(1).max(200),
  websiteUrl: HttpUrlSchema,
  logoUrl: HttpUrlSchema.optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 50);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  try {
    const productsList = await getPublishedProducts({ limit, offset });
    return NextResponse.json({
      data: productsList,
      pagination: {
        limit,
        offset,
        count: productsList.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch products";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // 1. Authenticate user session or API Key
  const caller = await resolveCaller(request.headers, undefined, {
    scope: "mcp:write", method: request.method, path: new URL(request.url).pathname,
  });
  if (!caller || !caller.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = CreateDraftSchema.parse(body);

    const db = getDb();
    // 2. Verify caller belongs to the target organization (anti-IDOR)
    const [membership] = await db
      .select()
      .from(members)
      .where(and(eq(members.organizationId, validated.orgId), eq(members.userId, caller.user.id)))
      .limit(1);

    if (!membership && caller.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: You are not a member of this organization" }, { status: 403 });
    }

    const product = await createProductDraft(validated);
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to create product draft";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
