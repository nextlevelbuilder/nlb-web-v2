// Admin list of website chat leads, newest first. Session, API key or MCP delegation (admin only).
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { resolveCaller } from "@/lib/auth-api-key";
import { getDb } from "@/lib/db";
import { chatLeads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const db = getDb();
  const caller = await resolveCaller(request.headers, db);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.user.role !== "admin") return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });

  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : 100;
  const rows = await db
    .select({
      id: chatLeads.id,
      name: chatLeads.name,
      email: chatLeads.email,
      need: chatLeads.need,
      interest: chatLeads.interest,
      wantsHuman: chatLeads.wantsHuman,
      locale: chatLeads.locale,
      pagePath: chatLeads.pagePath,
      userId: chatLeads.userId,
      status: chatLeads.status,
      consentedAt: chatLeads.consentedAt,
      createdAt: chatLeads.createdAt,
    })
    .from(chatLeads)
    .orderBy(desc(chatLeads.createdAt))
    .limit(limit);
  return NextResponse.json({ leads: rows });
}
