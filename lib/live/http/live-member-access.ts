/**
 * Member-side policy checks. Every member route asks `authorize()` and fails closed: a deny is thrown
 * as 401 (`unauthenticated`) or 403 (any other reason) before any domain call runs.
 */
import type { AppDb } from "@/lib/db";
import { authorize } from "@/lib/access/authorize";
import type { AccessAction, AccessDecision, AccessResource, AccessSubject } from "@/lib/access/types";
import { accessDenied } from "./live-http-errors";

export function checkAccess(db: AppDb, subject: AccessSubject, action: AccessAction, resource: AccessResource, now: Date): Promise<AccessDecision> {
  return authorize({ subject, action, resource, context: { now } }, { db });
}

/** Throws the deny as 401/403; returns the allowed user id (null only for public reads by anonymous callers). */
export async function requireAllowed(
  db: AppDb,
  subject: AccessSubject,
  action: AccessAction,
  resource: AccessResource,
  now: Date
): Promise<string | null> {
  const decision = await checkAccess(db, subject, action, resource, now);
  if (!decision.allow) throw accessDenied(decision.reason);
  return subject.userId;
}

/** Like `requireAllowed`, for actions that always need a signed-in user. */
export async function requireAllowedUser(
  db: AppDb,
  subject: AccessSubject,
  action: AccessAction,
  resource: AccessResource,
  now: Date
): Promise<string> {
  const userId = await requireAllowed(db, subject, action, resource, now);
  if (!userId) throw accessDenied("unauthenticated");
  return userId;
}
