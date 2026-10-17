import { NextResponse } from "next/server";
import { getLatestRankingSnapshot, computeRankingSnapshot } from "@/lib/domain/rankings";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowType = (searchParams.get("window") as "daily" | "weekly" | "monthly") || "daily";

  try {
    let snapshot = await getLatestRankingSnapshot(windowType);
    if (!snapshot) {
      // If no snapshot exists yet, compute fresh snapshot
      snapshot = await computeRankingSnapshot({ windowType });
    }

    return NextResponse.json({ data: snapshot });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load rankings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
