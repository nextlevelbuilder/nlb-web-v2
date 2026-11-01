# Access P3: permission-aware member APIs and operator services (issue #36)

Status: in progress · Parent: #34 · ADR: [docs/live-and-access-adr.md](../../docs/live-and-access-adr.md) · MCP: nlb-directory-toolkits#19 (not here)

## Outcome
Members read Courses, their owned assets, their directory products, leaderboards and Builder League
missions/evidence/rewards through `/api/v1` routes whose access is decided by `authorize()`. Operators
manage Courses, assets, directory/moderation, users/orgs, membership/entitlements, Polar commerce,
Builder League, onboarding/community and system/jobs/audit through `/api/v1/operator/<domain>/…`,
every call gated by `requireOperator()` (exact `<domain>:manage`, two-person approval for sensitive
actions, append-only audit).

## Constraints
- `/api/v1` and OpenAPI change additively only. Existing routes keep their contracts.
- Operator writes call domain services; no raw SQL in routes. Polar stays the payment source of
  truth: a manual entitlement grant never creates an `orders`/`purchases` row and is recorded in its
  own `entitlement_grants` table.
- Existing session-only Builder League admin routes and `users.role` checks stay as they are.
- Do not touch `lib/referrals/` (parallel #65 session). Number migrations after the newest on `origin/dev`.
- Every new route returning member/operator data is dynamic and answers `Cache-Control: private, no-store`.

## Non-goals
MCP tool exposure (toolkits#19), a general task manager, new UI.

## PRs (each self-green, merged into `dev` with `gh pr merge --merge`)
| # | Branch | Scope | Status |
|---|---|---|---|
| 1 | `feat/36-operator-core` | generic operator route + errors, sensitive-target registry, `/api/v1/operator/{approvals,audit}`, new resource kinds (`asset`, `org`, `builder_league`, `leaderboard`) and the `asset:<id>` policy, ADR | merged (#88) |
| 2 | `feat/36-member-apis` | Courses catalogue/library, owned assets, my directory products, leaderboards, Builder League gate through `authorize()`; OpenAPI | merged (#90) |
| 3 | `feat/36-operator-content` | operator Courses, assets, directory/moderation; OpenAPI | merged (#91) |
| 4 | `feat/36-operator-accounts` | operator users/orgs, membership/entitlements (migration `entitlement_grants`), Polar commerce; OpenAPI | merged (#92) |
| 5 | `feat/36-operator-league-system` | operator Builder League, onboarding/community, system (operators, jobs, audit); OpenAPI; docs | merged (#93) |
| 6 | `feat/36-operator-commerce-reads` | operator subscriptions (read, cancel/resume through Polar), customers, purchased entitlements list, one directory product; refund approval binds Polar order id and currency; OpenAPI | in review |

## Sensitive actions added (approval required)
`courses.video.archive`, `users.user.ban`, `membership.entitlement.grant`, `membership.entitlement.revoke`,
`commerce.order.refund`, `builder_league.ledger.reverse`, `builder_league.privacy.delete`
(plus existing `operator.grant`/`operator.revoke`, now reachable over REST).

## Acceptance
- Deny tests for each domain: anonymous 401, member `not_operator`, wrong domain `missing_capability`,
  API key `credential_not_allowed`, delegation without `mcp:operator` 401.
- Approval tests: missing, self-approved, mismatched args and replayed approvals are refused (409) and audited.
- `asset:<id>` policy tests (public approved asset, owner org member, stranger, missing asset, banned).
- `npm run type-check`, `npm run lint`, `npm test` green; CI green per PR; staging deploy succeeds.
