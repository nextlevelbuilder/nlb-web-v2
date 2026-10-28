/**
 * Contract of the shared policy resolver `authorize()` (lib/access/authorize.ts). REST routes, domain
 * services and the MCP companion all ask the same question and get the same answer. Rules are in
 * docs/live-and-access-adr.md.
 */

/** How the caller proved who they are. `oauth` is reserved for direct OAuth access tokens. */
export type SubjectAuthType = "anonymous" | "session" | "api_key" | "delegation" | "oauth";

export interface AccessSubject {
  userId: string | null;
  authType: SubjectAuthType;
  /** OAuth client behind a delegation or OAuth token, when known. */
  clientId?: string | null;
  /**
   * Scopes the credential carries. Sessions carry every member scope implicitly (pass undefined);
   * API keys and delegations carry only what they were granted.
   */
  scopes?: readonly string[];
}

/**
 * Typed resources. String form (used in audit rows and entitlement keys):
 * `video:<id>`, `live:event:<id>`, `live:ticket:<eventId>`, `live:replay:<eventId>`, `live:poll:<roundId>`,
 * `asset:<id>`, `operator:<domain>`.
 */
export type AccessResource =
  | { kind: "video"; id: string; polarProductId: string | null }
  | { kind: "live_event"; id: string }
  | { kind: "live_ticket"; eventId: string }
  | { kind: "live_replay"; eventId: string }
  | { kind: "live_poll"; roundId: string }
  | { kind: "asset"; id: string }
  | { kind: "operator"; domain: OperatorDomain };

export type AccessAction =
  | "read"
  | "watch"
  | "vote"
  | "purchase"
  | "join"
  | "download"
  | "manage";

export type OperatorDomain = "live" | "courses" | "assets" | "directory" | "users" | "membership" | "commerce" | "builder_league" | "community" | "system";

/** Runtime list of every operator domain, used to validate capability strings from storage or input. */
export const OPERATOR_DOMAINS = [
  "live",
  "courses",
  "assets",
  "directory",
  "users",
  "membership",
  "commerce",
  "builder_league",
  "community",
  "system",
] as const satisfies readonly OperatorDomain[];

// Compile-time guard: fails if OPERATOR_DOMAINS ever misses a member of OperatorDomain.
const operatorDomainsAreExhaustive: Exclude<OperatorDomain, (typeof OPERATOR_DOMAINS)[number]> extends never ? true : never = true;
void operatorDomainsAreExhaustive;

/** Exact capability strings. There is deliberately no `operator:*` wildcard. */
export type OperatorCapability = `${OperatorDomain}:manage`;

export type OperatorApprovalStatus = "pending" | "approved" | "rejected" | "consumed" | "expired";

/** Actions that need an independent approval from a second operator before they run. */
export const SENSITIVE_OPERATOR_ACTIONS = [
  "live.ticket.refund",
  "live.event.cancel",
  "live.poll.override",
  "operator.grant",
  "operator.revoke",
] as const;
export type SensitiveOperatorAction = (typeof SENSITIVE_OPERATOR_ACTIONS)[number];

export interface AuthorizeInput {
  subject: AccessSubject;
  action: AccessAction;
  resource: AccessResource;
  context?: {
    now?: Date;
  };
}

/** Why access was allowed; more than one basis can apply. */
export type AccessBasis =
  | "public"
  | "video_entitlement"
  | "video_paid_order"
  | "course_plan_subscription"
  /**
   * `canWatchVideo` allowed the video. It answers yes/no without saying which of its three paths
   * (entitlement, paid order, plan) matched, so `authorize()` reports this combined basis.
   */
  | "course_video_access"
  | "live_ticket"
  | "live_replay_entitlement"
  | "verified_account"
  | "operator_capability";

export type DenyReason =
  | "unauthenticated"
  | "banned"
  | "email_unverified"
  | "insufficient_scope"
  | "credential_not_allowed"
  | "no_entitlement"
  | "not_operator"
  | "missing_capability"
  | "not_available";

export type AccessDecision =
  | { allow: true; basis: AccessBasis[] }
  | { allow: false; reason: DenyReason };

/** Formats a resource as its canonical string (see AccessResource). */
export function resourceKey(resource: AccessResource): string {
  switch (resource.kind) {
    case "video":
      return `video:${resource.id}`;
    case "live_event":
      return `live:event:${resource.id}`;
    case "live_ticket":
      return `live:ticket:${resource.eventId}`;
    case "live_replay":
      return `live:replay:${resource.eventId}`;
    case "live_poll":
      return `live:poll:${resource.roundId}`;
    case "asset":
      return `asset:${resource.id}`;
    case "operator":
      return `operator:${resource.domain}`;
  }
}
