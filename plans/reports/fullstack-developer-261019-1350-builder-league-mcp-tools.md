# Builder League MCP tools, CLI and onboarding status: implementation report

Date: 2026-10-19 (Asia/Saigon). Branch `feat/agent-surfaces-monorepo`. Nothing committed.

## Outcome

- Builder League is exposed as 28 MCP tools and an `nlb builder ...` CLI group.
- Membership onboarding is exposed as `onboarding_get_status` and `nlb onboarding status`, backed by a new additive route, `GET /api/v1/onboarding-status`.
- Blog drift is fixed: there is now a revision tool and command, and the list limits match the web route.
- The ledger rule was already enforced on the server, so no server change was needed. A new web regression test now locks it in.
- Every acceptance check passes.

## MCP tools and CLI commands

Every Builder League tool is bound to the caller's identity. Reads need `mcp:read` and are private reads, so OAuth signs a delegation assertion for them. Writes need `mcp:write`. No new OAuth scopes were added.

A Worker caller that has no identity gets a 401 from the handler before any fetch happens.

| MCP tool | CLI | Route |
|---|---|---|
| builder_get_access | `builder access` | GET /api/v1/builder-access |
| builder_get_me | `builder me` | GET /api/v1/builder-me |
| (not exposed) | `builder privacy <file>` (session) | PATCH /api/v1/builder-me |
| builder_list_projects / builder_create_project | `builder projects list` / `create <file>` | GET/POST /api/v1/builder-projects |
| builder_list_evidence / builder_get_evidence | `builder evidence list` / `get <id>` | GET /api/v1/builder-evidence[/{id}] |
| builder_submit_evidence | `builder evidence submit <file> [--client-key]` | POST /api/v1/builder-evidence |
| builder_update_evidence / builder_withdraw_evidence | `builder evidence update` / `withdraw` | PATCH /api/v1/builder-evidence/{id} |
| builder_appeal_evidence | `builder evidence appeal <id> --reason` | POST /api/v1/builder-evidence/{id}/appeal |
| (not exposed) | `builder evidence confirm <id>` (session) | POST /api/v1/builder-evidence/{id}/confirm |
| builder_get_journey | `builder journey` | GET /api/v1/builder-journey |
| builder_list_missions / builder_list_badges | `builder missions` / `badges` | GET /api/v1/builder-missions, /builder-badges |
| builder_get_seasons / builder_join_season | `builder seasons show` / `join` | GET/POST /api/v1/builder-seasons |
| builder_get_rankings | `builder rankings` | GET /api/v1/builder-rankings |
| builder_list_rewards | `builder rewards list` | GET /api/v1/builder-rewards |
| (not exposed) | `builder rewards claim <id>` (session) | POST /api/v1/builder-rewards/{id}/claim |
| builder_get_time_capsule / builder_save_time_capsule | `builder capsule show` / `save` | GET/POST /api/v1/builder-time-capsule |
| builder_get_passport | `builder passport <userId>` | GET /api/v1/builder-passport/{userId} |
| builder_get_year | `builder year get <year>` | GET /api/v1/builder-year/{year} |
| (not exposed) | `builder year hide <year> [scenes...]` (session) | PATCH /api/v1/builder-year/{year} |
| builder_list_share_links / builder_revoke_share_link | `builder year shares` / `unshare` | GET /…/share, DELETE /…/share/{id} |
| (not exposed) | `builder year share <year>` (session) | POST /api/v1/builder-year/{year}/share |
| builder_list_year_videos / builder_request_year_video | `builder year videos` / `render --format` | GET/POST /api/v1/builder-year/{year}/render |
| builder_get_community_wrapped | `builder wrapped <year>` | GET /api/v1/builder-wrapped/{year} |
| builder_admin_list_queue (admin session cookie) | `builder admin queue` | GET /api/v1/builder-admin/queue |
| builder_admin_backfill_preview (dryRun forced) | `builder admin backfill [--apply]` | POST /api/v1/builder-admin/backfill |
| (not exposed) | `builder admin decide` / `resolve-appeal` | POST /api/v1/builder-admin/evidence/{id}/decision, /appeal |
| onboarding_get_status | `onboarding status` | GET /api/v1/onboarding-status (new) |
| blog_get_revision (drift fix) | `blog revision <id> <revisionId>` | GET /api/v1/blog/posts/{id}/revisions/{revisionId} |

### How the CLI chooses credentials

- Commands marked "(session)" and every admin command need `--cookie` or `NLB_SESSION_COOKIE`. Without one, they stop before making any request.
- Session-only routes send only the cookie. Other routes send the API key, and use the cookie only when no key is set, so an API-key run is still recorded with source `api`.
- The cookie is never sent to an origin outside the allowed Next Level Builder hosts.

### Errors and the disabled flag

- When the flag is off, the error says "Builder League is not enabled on this environment".
- MCP keeps the details in the ToolError data as `status`, `notEnabled`, `code` and `details`. CLI `--json` output keeps `status`, `code`, `notEnabled` and `details`, and the exit code is 1.
- A 404 on a single item says "Not found, or Builder League is not enabled…" and sets `notEnabled: false`.
- 403 `membership_required` and `session_required` each get their own explanation.

## Ledger enforcement findings

**Before:** the server already enforced every part of the rule.
- `SubmitEvidenceSchema` is strict, so it accepts no verification, status, source or points field. The PATCH edit schema is strict as well.
- `ledger.ts` `assertMayRecord` allows `api` and `agent` callers to record only `self_reported` activity.
- Awarding requires the awarding roles, and `approveEvidence` requires a moderator role.
- `requireBuilderLeagueAdmin` refuses an API key or a delegated agent with 403 `session_required`, even when the key belongs to an admin.
- Peer confirmation, reward claim, the year PATCH, share creation and the `builder-me` PATCH refuse `api` and `agent` callers.

**After:** no server change was needed. `tests/builder-league/agent-ledger-guard.test.ts` (11 tests) adds route-level regression coverage for both `api_key` and `delegation` callers.
- Submissions forging verification, status, source, eventId or points get 400, and nothing is stored.
- Accepted submissions are stored as `submitted` with source `api` or `agent`, no event, and no builder_events rows.
- Forged edits get 400.
- An admin decision made with an admin's key or agent gets 403 `session_required`, and nothing is awarded.
- A peer confirmation from either caller gets 403.
- The DTOs parse against the shared contract schemas.

On the client side, the strict contract schema rejects any forged field before a request is sent. The tools never offer a verification enum. Approve, award, confirm and claim are not exposed in MCP.

## Onboarding decision

`/api/onboarding/status` accepts only a session, so I added `GET /api/v1/onboarding-status`.
- It uses the same `getOnboardingStatus` domain call, through `resolveCaller` with scope `mcp:read`.
- It returns 404 while `ONBOARDING_V2_ENABLED` is off, 401 when there is no identity, and `{ data }` with `no-store` otherwise.
- It never verifies a Polar checkout.
- It is documented additively in `lib/openapi.ts` as `getOnboardingStatus`.

## Files

- **Contracts:** `packages/contracts/src/builder-league.ts` (input schemas, envelope, `describeBuilderApiFailure`), `src/onboarding.ts` (new), `src/index.ts`, `tests/builder-league.test.ts` (new).
- **MCP:** `src/tools/builder-league.ts` and `src/tools/onboarding.ts` (new); `src/tools/blog.ts`, `src/tools/index.ts` and `src/tool-context.ts` (edited); `tests/builder-league.test.ts` and `tests/onboarding.test.ts` (new).
- **CLI:** `src/api/builder-client.ts`, `src/api/onboarding-client.ts`, `src/commands/builder.ts` and `src/commands/onboarding.ts` (new); `src/api/blog-client.ts`, `src/commands/blog.ts`, `src/cli.ts` and `src/index.ts` (edited); `tests/builder.test.ts` and `tests/onboarding.test.ts` (new); `tests/blog.test.ts` (edited).
- **Web:** `app/api/v1/onboarding-status/route.ts` (new), `lib/openapi.ts` (additive), `tests/builder-league/agent-ledger-guard.test.ts` (new), `tests/onboarding-status-v1.test.ts` (new).

## Test output

- `npm run build -w @nextlevelbuilder/contracts`: OK
- `npm test -w @nextlevelbuilder/contracts`: 8 files, 69 tests passed
- `npm run type-check -w @nextlevelbuilder/cli`: OK
- `npm test -w @nextlevelbuilder/cli`: 8 files, 60 tests passed
- `npm test -w @nextlevelbuilder/mcp -- tests/builder-league.test.ts tests/onboarding.test.ts`: 2 files, 23 tests passed. The full MCP suite (8 files, 91 tests) and the MCP type-check are also clean at the time of writing.
- `npx tsc --noEmit` (web): OK
- `npx vitest run tests/builder-league/agent-ledger-guard.test.ts`: 11 passed
- `npx vitest run tests/onboarding-status-v1.test.ts`: 6 passed
- Regression check: `tests/api-docs.test.ts`, `tests/onboarding-status.test.ts` and `tests/builder-league/evidence.test.ts` gave 36 passed.

## Open items for the controller

1. `packages/mcp/src/server.ts` (not mine to edit) only treats blog and core tools as mutating. The Builder and onboarding handlers refuse anonymous Worker callers themselves. The server owner should adopt `isMutatingTool()` from `tool-context.ts`, which already covers `BUILDER_WRITE_TOOLS`.
2. Session-only and admin decision actions are CLI-only and need a human session cookie, by design. The MCP admin tools take a session cookie argument and never use it under OAuth.
3. `app/api/v1/builder-access/route.ts` calls `resolveCaller(headers, db)` without a delegation context, so an OAuth-delegated agent gets the anonymous answer (`showNav` = flag state). API keys and sessions get their own answer. The fix is a one-line web change, passing `{ scope: "mcp:read", method, path }`, but it is outside the ledger-only scope I was given for `app/api/v1/builder-*`, so I did not make it.
4. `getOnboardingStatus` performs an idempotent `claimCustomerByVerifiedEmail` write, the same as the session route. The v1 route is "read-only" from the caller's point of view.
5. Docs (README and the agent docs) belong to the controller. The new commands and tools are not documented there yet.
