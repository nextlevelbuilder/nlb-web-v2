import { getDb, type AppDb } from "@/lib/db";
import { canWatchVideo, type CanWatchOptions } from "@/lib/courses/course-video-access";
import { liveReplayFeatureKey, liveTicketFeatureKey } from "@/lib/live/types";
import { getOperatorCapabilities } from "@/lib/operators/operator-grants";
import { hasMemberScopeFor, OPERATOR_SCOPE } from "./access-scopes";
import { hasActiveEntitlement, hasActiveLiveTicket, loadUserFacts } from "./access-facts";
import type { AccessDecision, AccessResource, AccessSubject, AuthorizeInput, DenyReason, OperatorDomain } from "./types";

export { subjectFromCaller, type SubjectExtras } from "./subject-from-caller";

/**
 * Single policy resolver (rules: docs/live-and-access-adr.md). Every REST, domain and MCP call asks it
 * "may this subject do this action on this resource now?". It reads current facts on every call and
 * fails closed: a missing user, an active ban, an unknown resource/action pair or any thrown error is
 * a deny.
 */

export interface AuthorizeDeps {
  db?: AppDb;
  /** Passed through to `canWatchVideo` unchanged (`now` defaults to the authorize clock). */
  videoAccess?: CanWatchOptions;
}

const deny = (reason: DenyReason): AccessDecision => ({ allow: false, reason });

/** The one action each resource kind supports; anything else is not available. */
const SUPPORTED_ACTION: Record<AccessResource["kind"], AuthorizeInput["action"]> = {
  video: "watch",
  live_event: "read",
  live_ticket: "join",
  live_replay: "watch",
  live_poll: "vote",
  asset: "download",
  operator: "manage",
};

export async function authorize(input: AuthorizeInput, deps: AuthorizeDeps = {}): Promise<AccessDecision> {
  try {
    return await decide(input, deps);
  } catch (error) {
    console.error("authorize: policy check failed, denying", error instanceof Error ? error.message : error);
    return deny("not_available");
  }
}

async function decide(input: AuthorizeInput, deps: AuthorizeDeps): Promise<AccessDecision> {
  const { subject, action, resource } = input;
  const now = input.context?.now ?? new Date();
  if (!resource || !Object.hasOwn(SUPPORTED_ACTION, resource.kind)) return deny("not_available");

  // `live:event` supports read for everyone and purchase for verified members.
  const supported = resource.kind === "live_event" ? action === "read" || action === "purchase" : SUPPORTED_ACTION[resource.kind] === action;
  if (!supported) return deny("not_available");
  // Reserved until the assets domain is specified.
  if (resource.kind === "asset") return deny("not_available");

  const userId = subject.authType === "anonymous" ? null : subject.userId;
  const isPublicRead = resource.kind === "live_event" && action === "read";
  if (!userId) return isPublicRead ? { allow: true, basis: ["public"] } : deny("unauthenticated");

  const db = deps.db ?? getDb();
  const user = await loadUserFacts(db, userId, now);
  if (!user) return deny("unauthenticated");
  if (user.banned) return deny("banned");

  if (resource.kind === "operator") return decideOperator(db, subject, userId, resource.domain);
  if (!hasMemberScopeFor(subject, action)) return deny("insufficient_scope");

  switch (resource.kind) {
    case "live_event":
      if (isPublicRead) return { allow: true, basis: ["public"] };
      return user.emailVerified ? { allow: true, basis: ["verified_account"] } : deny("email_unverified");
    case "live_poll":
      return user.emailVerified ? { allow: true, basis: ["verified_account"] } : deny("email_unverified");
    case "video": {
      const allowed = await canWatchVideo(userId, { id: resource.id, polarProductId: resource.polarProductId }, db, {
        ...deps.videoAccess,
        now: deps.videoAccess?.now ?? now,
      });
      return allowed ? { allow: true, basis: ["course_video_access"] } : deny("no_entitlement");
    }
    case "live_ticket": {
      // Membership never implies a ticket: both the entitlement and an active ticket row are required.
      const [entitled, ticketed] = await Promise.all([
        hasActiveEntitlement(db, userId, liveTicketFeatureKey(resource.eventId), now),
        hasActiveLiveTicket(db, userId, resource.eventId),
      ]);
      return entitled && ticketed ? { allow: true, basis: ["live_ticket"] } : deny("no_entitlement");
    }
    case "live_replay": {
      const entitled = await hasActiveEntitlement(db, userId, liveReplayFeatureKey(resource.eventId), now);
      return entitled ? { allow: true, basis: ["live_replay_entitlement"] } : deny("no_entitlement");
    }
    default:
      return deny("not_available");
  }
}

/**
 * `operator:<domain>` manage: a session, or an MCP delegation carrying `mcp:operator`; API keys and
 * other credentials never qualify. The user must hold an unrevoked row with the exact capability.
 */
async function decideOperator(db: AppDb, subject: AccessSubject, userId: string, domain: OperatorDomain): Promise<AccessDecision> {
  if (subject.authType === "delegation") {
    if (!subject.scopes?.includes(OPERATOR_SCOPE)) return deny("insufficient_scope");
  } else if (subject.authType !== "session") {
    return deny("credential_not_allowed");
  }
  const capabilities = await getOperatorCapabilities(db, userId);
  if (capabilities.length === 0) return deny("not_operator");
  if (!capabilities.includes(`${domain}:manage`)) return deny("missing_capability");
  return { allow: true, basis: ["operator_capability"] };
}
