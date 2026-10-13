import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { resolveCaller } from "@/lib/auth-api-key";
import { MCP_ASSERTION_HEADER } from "@/lib/auth-mcp-delegation";
import { getDb } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// DELETE /api/v1/api-keys/[id] - Revoke/Delete an API key
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = request.headers.has(MCP_ASSERTION_HEADER)
      ? await resolveCaller(request.headers, undefined, {
          scope: "mcp:keys", method: request.method, path: new URL(request.url).pathname,
        })
      : await getAuth().api.getSession({ headers: request.headers });

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();

    // Verify key belongs to user
    const [existing] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, session.user.id)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "API key not found or not owned by you" }, { status: 404 });
    }

    await db.delete(apiKeys).where(eq(apiKeys.id, id));

    return NextResponse.json({
      success: true,
      message: "API key revoked successfully",
    });
  } catch (err: any) {
    console.error("Delete API key error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete API key" }, { status: 500 });
  }
}
