import { z } from "zod";
import { getDb } from "@/lib/db";
import { ok } from "@/lib/builder-league/http";
import { castVote } from "@/lib/live/polls";
import { withLiveErrors } from "@/lib/live/http/live-http-errors";
import {
  assertLiveEnabled,
  memberDelegationScope,
  readJsonObject,
  requirePathParam,
  resolveLiveSubject,
  withLiveIdempotency,
} from "@/lib/live/http/live-request-context";
import { requireAllowedUser } from "@/lib/live/http/live-member-access";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ roundId: string }> };

const bodySchema = z.object({ topicId: z.string().trim().min(1).max(200) }).strict();

/**
 * Cast or change the caller's vote in an open round. `authorize()` vote on `live:poll:<roundId>`:
 * signed in, email verified, not banned, write scope (free accounts included). One current vote per
 * account per round; re-voting the same topic keeps the original time (`changed: false`).
 */
export async function POST(request: Request, { params }: Params) {
  return withLiveErrors(async () => {
    assertLiveEnabled();
    const roundId = requirePathParam((await params).roundId, "roundId");
    const db = getDb();
    const now = new Date();
    const { subject } = await resolveLiveSubject(request, db, memberDelegationScope(request));
    const userId = await requireAllowedUser(db, subject, "vote", { kind: "live_poll", roundId }, now);
    const { text, body } = await readJsonObject(request);
    const { topicId } = bodySchema.parse(body);

    return withLiveIdempotency(request, db, userId, text, async () => {
      const result = await castVote({ roundId, userId, topicId, now }, db);
      return ok({ roundId: result.roundId, topicId: result.topicId, votedAt: result.votedAt, changed: result.changed });
    });
  });
}
