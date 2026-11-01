/**
 * Plumbing for permission-aware member routes outside Live (`/api/v1/courses`, `/assets`, `/directory`,
 * `/leaderboards`). The caller may be anonymous, a session, an API key or an MCP delegation signed for
 * `mcp:read` (reads) or `mcp:write` (writes). Every resource is checked with `authorize()` before any
 * domain read, and a deny becomes 401 (`unauthenticated`) or 403 with the deny reason.
 */
import { getDb, type AppDb } from "@/lib/db";
import type { ResolvedCaller } from "@/lib/auth-api-key";
import { authorize } from "@/lib/access/authorize";
import type { AccessAction, AccessResource, AccessSubject } from "@/lib/access/types";
import { accessDenied } from "@/lib/live/http/live-http-errors";
import { memberDelegationScope, resolveLiveSubject } from "@/lib/live/http/live-request-context";
import { withOperatorErrors } from "@/lib/operators/http/operator-http-errors";

export { requirePathParam } from "@/lib/live/http/live-request-context";

export interface MemberContext {
  db: AppDb;
  now: Date;
  caller: ResolvedCaller | null;
  subject: AccessSubject;
}

/** Runs a member handler with a resolved subject and the shared `/api/v1` error envelope. */
export function runMemberRoute(request: Request, run: (context: MemberContext) => Promise<Response>): Promise<Response> {
  return withOperatorErrors(async () => {
    const db = getDb();
    const { caller, subject } = await resolveLiveSubject(request, db, memberDelegationScope(request));
    return run({ db, now: new Date(), caller, subject });
  });
}

/** True when the subject may act on the resource now. */
export async function isAllowed(context: MemberContext, action: AccessAction, resource: AccessResource): Promise<boolean> {
  return (await authorize({ subject: context.subject, action, resource, context: { now: context.now } }, { db: context.db })).allow;
}

/** Throws the deny as 401/403 unless the subject may act on the resource now. */
export async function requireAllowed(context: MemberContext, action: AccessAction, resource: AccessResource): Promise<void> {
  const decision = await authorize({ subject: context.subject, action, resource, context: { now: context.now } }, { db: context.db });
  if (!decision.allow) throw accessDenied(decision.reason);
}

/** The signed-in user id, or a 401. */
export function requireUserId(context: MemberContext): string {
  if (!context.subject.userId) throw accessDenied("unauthenticated");
  return context.subject.userId;
}
