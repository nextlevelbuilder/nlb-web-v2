# Affiliate MCP tools, CLI and contracts (web #63, toolkits #19)

## Files (nlb-web-v2, uncommitted)
- packages/contracts/src/affiliate.ts (new), src/index.ts (export), tests/affiliate.test.ts (new)
- packages/mcp/src/tools/affiliates.ts (new), src/tools/index.ts, src/tool-context.ts, src/server.ts, tests/affiliates.test.ts (new)
- packages/cli/src/api/affiliate-client.ts (new), src/commands/affiliates.ts (new), src/cli.ts, tests/affiliates.test.ts (new)
- docs/toolkits/mcp.md (section 22 and scope table), cli.md (section 20), contracts.md (Affiliate program), README.md

## Tools (single `/mcp` endpoint, no new server)
- Public read (mcp:read): affiliate_get_program
- Member reads (mcp:read, private): affiliate_get_me, affiliate_preview_incentive, affiliate_list_links, affiliate_list_conversions, affiliate_get_commissions, affiliate_list_payouts
- Member writes (mcp:write, owner-only): affiliate_join (requires termsVersion), affiliate_create_link, affiliate_update_link (expectedVersion; destructiveHint because archiving is permanent)
- Operator (mcp:operator, session cookie or OAuth, never an API key): affiliate_admin_get_rules, _preview_rules, _list_affiliates, _list_conversions, _hold_conversion, _release_conversion, _preview_payouts, _list_batches, _get_batch, _create_batch, _cancel_batch (destructiveHint), _reconciliation, _list_approvals
- Excluded by design, with a test asserting it: payout-method set/read, bank/ID data, payee details, mark paid, publish rules, balance adjustments, batch approval.
- CLI `nlb affiliates`: program, me, join, preview, links list/create/update, conversions, commissions, payouts. No payout-method or operator commands.

Inputs match the REST boundary schemas: hold reason is 3-300 characters, a level key is at most 32 characters, there are at most 10 levels, and release/cancel send no body (the server reads it as `{}`). Query limits are capped at 100, which is within every server bound.

## Alignment with REST commit 41398d6
- Operator responses are now validated against typed contracts:
  - `AffiliateAdminRulesResponseSchema`, `AffiliateRulesPreviewResponseSchema`.
  - Wrapped lists: `{ affiliates }`, `{ conversions }`, `{ batches }`.
  - `AffiliateAdminConversionResponseSchema` for hold and release; `AffiliateAdminBatchResponseSchema` for cancel; `AffiliateAdminBatchDetailResponseSchema` (with `totals` and `items`) for create and get.
  - `AffiliateAdminApprovalsResponseSchema` (array plus `pagination`).
  - Payout preview and reconciliation stay loosely typed because their OpenAPI schema is `object`.
- The preview `example` is optional, and the tool description says it appears only with `priceMinor` and a discount within budget.
- Hold reason is 3-300 characters.
- New approval routes and suspend/reinstate were deliberately not added. Requesting or deciding approvals would initiate or authorize rules publishing, batch approval and balance adjustment, which the task forbids. Suspend/reinstate was not in the requested tool list. The docs list all of these as unavailable.
- Tests: the operator path tests now use contract-shaped responses, and a new test rejects unwrapped lists.

## Verification
- `npm run build:packages`: pass
- `npm run test:packages`: contracts 80, cli 81, mcp 143, all pass
- `npx tsc --noEmit`: clean (after REST commit 41398d6).
- Toolkits: `pnpm build`, `pnpm type-check`, `pnpm test` (113 tests) all pass. Contracts must be built before type-check and test.

## Toolkits sync
Commits 32c2cbf6dbe0db93563ef8b96231db3b07570297 and bb7909132558dc195ffb8c709aa03e3c419e6075 (operator response shapes) on claude/stoic-gates-o01o76, pushed. It is docs-only (README, docs/mcp.md, cli.md, contracts.md), pointing to the single hosted endpoint and the authoritative nlb-web-v2 packages. The toolkits code is a stale fork: the builder, live, blog and courses tools were never mirrored either, so duplicating the affiliate code there was not done.

Status: DONE_WITH_CONCERNS
Summary: Affiliate contracts, 23 MCP tools and the `nlb affiliates` CLI are implemented, tested and documented in nlb-web-v2/packages. The toolkits repo has a docs sync that is committed and pushed.
Concerns/Blockers: The toolkits repo still deploys its own standalone worker on mcp.nextlevelbuilder.io (wrangler.jsonc custom_domain), and release.yml publishes the same npm package names as nlb-web-v2. That worker and its packages lack the affiliate tools, so ownership of that domain and of npm publishing should be settled.
