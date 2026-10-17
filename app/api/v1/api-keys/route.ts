import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { MCP_ASSERTION_HEADER } from "@/lib/auth-mcp-delegation";
import { getDb } from "@/lib/db";
import { apiKeys, members } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { createApiKeyForUser, resolveCaller } from "@/lib/auth-api-key";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(64),
  organizationId: z.string().optional(),
  expiresDays: z.number().int().min(1).max(365).optional(),
});

// GET /api/v1/api-keys - List current user's API keys
export async function GET(request: Request) {
  try {
    const session = request.headers.has(MCP_ASSERTION_HEADER)
      ? await resolveCaller(request.headers, undefined, {
          scope: "mcp:keys", method: request.method, path: new URL(request.url).pathname,
        })
      : await getAuth().api.getSession({ headers: request.headers });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized: Please sign in to manage API keys" }, { status: 401 });
    }

    const db = getDb();
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        start: apiKeys.start,
        enabled: apiKeys.enabled,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        organizationId: apiKeys.organizationId,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.user.id))
      .orderBy(desc(apiKeys.createdAt));

    return NextResponse.json({
      success: true,
      data: keys,
    });
  } catch (err: any) {
    console.error("List API keys error:", err);
    return NextResponse.json({ error: err.message || "Failed to list API keys" }, { status: 500 });
  }
}

// POST /api/v1/api-keys - Create a new API key
export async function POST(request: Request) {
  try {
    const session = request.headers.has(MCP_ASSERTION_HEADER)
      ? await resolveCaller(request.headers, undefined, {
          scope: "mcp:keys", method: request.method, path: new URL(request.url).pathname,
        })
      : await getAuth().api.getSession({ headers: request.headers });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized: Please sign in to create an API key" }, { status: 401 });
    }

    const body = await request.json();
    const validated = CreateApiKeySchema.parse(body);
    if (validated.organizationId) {
      const db = getDb();
      const [membership] = await db
        .select()
        .from(members)
        .where(
          and(
            eq(members.organizationId, validated.organizationId),
            eq(members.userId, session.user.id)
          )
        )
        .limit(1);

      if (!membership && (session.user as any).role !== "admin") {
        return NextResponse.json(
          { error: "Forbidden: You are not a member of this organization" },
          { status: 403 }
        );
      }
    }
    const created = await createApiKeyForUser({
      userId: session.user.id,
      name: validated.name.trim(),
      organizationId: validated.organizationId,
      expiresDays: validated.expiresDays,
    });

    return NextResponse.json({
      success: true,
      message: "API key created successfully. Save your key now, it will not be displayed again.",
      data: {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        key: created.rawKey, // Returned ONLY on creation
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
      },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid API key parameters", details: err.errors }, { status: 400 });
    }
    console.error("Create API key error:", err);
    return NextResponse.json({ error: err.message || "Failed to create API key" }, { status: 500 });
  }
}
