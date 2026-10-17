import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { resolveCaller } from "@/lib/auth-api-key";
import { MCP_ASSERTION_HEADER } from "@/lib/auth-mcp-delegation";
import { castVote } from "@/lib/domain/analytics";
import { z } from "zod";

const CastVoteBodySchema = z.object({
  productId: z.string().uuid(),
  turnstileToken: z.string().optional(),
});

// Simple sliding window rate limiter (max 15 vote attempts per minute per user/IP)
const voteRateLimitCache = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit = 15, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = voteRateLimitCache.get(key);

  if (!entry || now > entry.resetAt) {
    voteRateLimitCache.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  // 1. Authenticate user session (prevent unauthenticated bot voting)
  const session = request.headers.has(MCP_ASSERTION_HEADER)
    ? await resolveCaller(request.headers, undefined, {
        scope: "mcp:write", method: request.method, path: new URL(request.url).pathname,
      })
    : await getAuth().api.getSession({ headers: request.headers });
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized: Sign in required to vote" }, { status: 401 });
  }

  // 2. Rate limit check
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || session.user.id;
  if (!checkRateLimit(`vote_${session.user.id}_${ip}`)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a minute before voting again." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const validated = CastVoteBodySchema.parse(body);

    const vote = await castVote({
      productId: validated.productId,
      userId: session.user.id,
      turnstileToken: validated.turnstileToken,
    });

    return NextResponse.json({ data: vote }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Failed to cast vote";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
