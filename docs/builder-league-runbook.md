# Builder League runbook

How to operate the Builder League day to day. The scoring design and its reasons are in [builder-league-adr.md](./builder-league-adr.md); this page covers what an admin does and in what order. Code wins when the two disagree: each section names the file that owns the behaviour.

All admin routes live under `/api/v1/builder-admin/` and need a signed-in admin **session**. API keys and MCP agents are refused, except on the renderer and Discord ingest routes, which accept an admin's API key ([`lib/builder-league/admin-key-auth.ts`](../lib/builder-league/admin-key-auth.ts)). While `BUILDER_LEAGUE_ENABLED` is `"false"`, non-admins get 404 everywhere. The contract is in `/api/openapi.json`.

Admin pages, in each locale (`/vi/...` for Vietnamese):

| Page | Use |
|---|---|
| `/studio/builder-league` | Hub |
| `/studio/builder-league/moderation` | Evidence queue, appeals, reversals, pilot allowlist |
| `/studio/builder-league/rewards` | Reward items and claims |
| `/studio/builder-league/metrics` | Tracking dashboard (below) |

Remote commands use the account-pinned `wr` helper from [deployment-guide.md](./deployment-guide.md#wrangler-access). Never use the project `.env` token for them.

## Tracking dashboard

`/studio/builder-league/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD` shows the league's health for a window. The window uses local dates (Asia/Ho_Chi_Minh), includes both ends, defaults to the last 90 days and is capped at 731 days. Non-admins get a 404.

Every figure is a SQL aggregate shown with its numerator, denominator and window. Small counts are not suppressed, because only admins see this page. The definitions live in [`lib/builder-league/metrics.ts`](../lib/builder-league/metrics.ts):

- **Active member**: on the pilot allowlist or in a season, with at least one submission.
- **Verified event**: peer, moderator or system verified, and not reversed.
- **League-time metrics** count only `activity` events by verification time. An imported record never reads as progress.
- **Pilot before/after comparison** uses `occurred_at` and includes imported records, because the weeks before enrollment have no other history. The page reports the imported share next to it. Members enroll on different dates and there is no control group, so read it as a trend, not as an effect.

## Score replay

The ledger (`score_ledger`) and the event log (`builder_events`) are append-only. Every board is a deterministic function of them ([`lib/builder-league/leaderboards.ts`](../lib/builder-league/leaderboards.ts)).

**Replaying** a period recomputes its boards from the ledger:

```http
POST /api/v1/builder-admin/snapshots/finalize
{ "periodType": "week", "periodKey": "2026-W45" }
```

`periodType` is `week`, `month`, `season` or `year`. The response lists one snapshot per board, each with a `write` value:

| `write` | Meaning |
|---|---|
| `unchanged` | The stored snapshot matches the ledger (same `eventHash` and ruleset). Nothing was written. |
| `finalized` | First final snapshot of the period. |
| `revised` | Late changes arrived after finalization. A new final revision was appended (`supersedes_id` points to the old one). Final rows are never edited. |

If the period is still inside its grace, the route answers `409 period_not_due`. Grace is `FINALIZE_GRACE_MS` (72 h for v1 and v2) in [`lib/builder-league/snapshots.ts`](../lib/builder-league/snapshots.ts).

Re-sending an event or award is safe:
- `recordBuilderEvent` dedupes on `sha256(source|externalEventId|subject|eventType)`.
- `awardForEvent` dedupes the ledger row, in [`lib/builder-league/ledger.ts`](../lib/builder-league/ledger.ts).

**Fixing a wrong award:** never edit a row. Reverse it, then replay the affected periods:

```http
POST /api/v1/builder-admin/ledger/{entryId}/reverse
{ "reason": "Duplicate of an earlier launch" }
```

The reversal does three things:
- appends a negative entry and a `reversal` event;
- releases the entry's cap slots;
- writes an audit row.

It is idempotent per entry (`reverseLedgerEntry` in [`lib/builder-league/moderation.ts`](../lib/builder-league/moderation.ts)). To revoke a badge, use `POST /api/v1/builder-admin/rewards/badges/{awardId}/revoke`.

A reversal is final. The reversed entry keeps its dedupe key, so re-approving the same evidence or replaying an import finds the original entry and awards nothing. For project-scoped awards such as a launch, the key is the project, so a later launch of the same project earns nothing either. Reverse only when the RP should never come back.

## Disputes and appeals

1. **A decision is disputed before it is final.** Re-decide the evidence:

   ```http
   POST /api/v1/builder-admin/evidence/{id}/decision
   { "decision": "approve" | "reject" | "needs_info", "reasonCodes": [...], "note": "..." }
   ```

   Reason codes are listed per decision in `DECISION_REASON_CODES`:
   - approve: `meets_requirements`, `verified_link`, `verified_file`, `verified_counterparty`
   - reject: `insufficient_evidence`, `duplicate`, `not_eligible`, `wrong_event_type`, `outside_window`, `unverifiable`, `spam`, `other`
   - needs_info: `missing_link`, `summary_too_short`, `unclear_outcome`, `redact_private_data`, `wrong_project`, `other`

   `other` needs a note. Repeating an identical decision is a no-op.
2. **A member appeals a rejection.** The member calls `POST /api/v1/builder-evidence/{id}/appeal` with a reason of at least 20 characters. Open appeals appear in `GET /api/v1/builder-admin/queue?view=appeals` and on the moderation page.
3. **Resolve the appeal.** Use a different admin from the one who rejected, where possible:

   ```http
   POST /api/v1/builder-admin/evidence/{id}/appeal
   { "outcome": "uphold" | "overturn", "resolution": "...", "appealId": "<optional>" }
   ```

   `overturn` approves the evidence and awards RP through the normal path (`resolveAppeal` in [`lib/builder-league/appeals.ts`](../lib/builder-league/appeals.ts)).
4. **The disputed period has already been finalized.** Replay it (above). The correction lands as a new revision, never as an edit.

Every decision, reversal and resolution writes a row to `builder_moderation_actions`. The trail is the record for any later dispute.

## Moderator checklist

The requirements for each event type (links, files, counterparty, caps) are defined in the ruleset ([`lib/builder-league/ruleset/v2.ts`](../lib/builder-league/ruleset/v2.ts)). The submission form and the queue show them, so check the evidence against what is shown rather than from memory. The bar by stage:

| Stage | Approve when | Typical `needs_info` |
|---|---|---|
| Validate | A dated, specific outcome: named interview counts, a problem signal with a source, a pre-sale with proof. | Outcome described without a link or file (`missing_link`, `unclear_outcome`). |
| Build | A working artifact anyone can open: repo, demo, deployed URL, first real user evidence (screenshot with personal data redacted). | Private data visible (`redact_private_data`); wrong project (`wrong_project`). |
| Ship | A public launch, post or listing, or payment proof with amounts redacted if the member asked (`redact_financials`). | Launch link missing or behind login. |
| Contribute | Peer help confirmed by the person helped (counterparty confirmation), or a public contribution link. | Counterparty has not confirmed yet: leave it open, do not approve on the helper's word. |

### Anti-gaming red flags

Reject with `not_eligible`, `duplicate` or `unverifiable`, or reverse after the fact, when you see any of these:

| Red flag | What to check |
|---|---|
| Circular help | Two members confirming help for each other week after week. The dashboard's "reciprocal pairs" counts these, and caps per counterparty limit the RP. Look for help with no artifact or an identical summary. |
| Self-transactions | A "first payment" or "first real user" that traces back to the member, a teammate or a family account. Ask for the payment platform record; a same-name payer is a reason to reject. |
| Refunds | Payment proof followed by a refund. Reverse the award (`/ledger/{entryId}/reverse`) once confirmed. Do not wait for the next period. |
| Multiple accounts | Counterparties that only ever interact with one member, share email patterns, or were created just before confirming. Reject the help evidence and tell an admin to review the accounts. |
| Bot spam | Bursts of near-identical submissions, generated summaries without specifics, or links that 404. Reject as `spam`. Rate limits and caps already bound the RP, so the goal is keeping the queue clean. |

Watch the dashboard's integrity section. A climbing rejection rate, one dominant reason code or a cluster of reversals for one cohort usually points to a confusing requirement, not to a bad cohort.

## Period finalization

The hourly cron `17 * * * *` runs `runBuilderLeagueCron` ([`lib/builder-league/cron.ts`](../lib/builder-league/cron.ts)). On each run it:

- calls `finalizeDuePeriods` for the most recent ended periods: 4 weeks, 2 months, 2 seasons and 1 year;
- finalizes each period once its grace (72 h) has passed;
- appends revisions when late approvals change a final board;
- then evaluates ranks for everyone who scored in a changed week.

Each step is idempotent, and a failing step does not block the others. Errors are logged as `builder league cron: <step> failed`.

Week and month boundaries are local (UTC+7). Weeks are ISO weeks.

To force a period that the cron skipped (for example, after an outage longer than the lookback), call the finalize route with its key, as in [Score replay](#score-replay). An empty body (`{}`) finalizes everything that is due.

## Annual archive and Community Wrapped

The year cutoffs are defined in `yearWindow` ([`lib/builder-league/year-review.ts`](../lib/builder-league/year-review.ts)):

| When (local) | What the cron does |
|---|---|
| After Dec 30 23:59:59.999 | Builds **provisional** Year in Review snapshots for every member with verified milestones that year (`ensureYearSnapshot`, 100 members per run). |
| After Dec 31 + `FINAL_GRACE_DAYS` (7 days) | Freezes the **final** snapshots. Late moderation inside the grace still lands; after it, the year is closed. The cron keeps catching up for 60 days. |

Community Wrapped is refreshed by the hourly cron for the current and the previous year (`ensureCommunityWrapped`): a new version is stored only when the aggregate changed, and a final version is never replaced. The page and `GET /api/v1/builder-wrapped/{year}` only read the stored snapshot, so the public figures can lag new verified events by up to an hour.

Community Wrapped publishes aggregates only. Cohorts smaller than `MIN_COHORT` (5) are suppressed, and no member is named.

Members choose what their shared year shows. They can hide scenes with `PATCH /api/v1/builder-year/{year}` (`hiddenScenes`) and create or revoke share links under `/api/v1/builder-year/{year}/share`.

In the first week of January, check the logs for `year_snapshots` or `community_wrapped` failures, and compare the dashboard's Wrapped funnel against the share links created.

## Render worker

Year in Review videos are rendered outside the Worker by [`.github/workflows/builder-league-render.yml`](../.github/workflows/builder-league-render.yml), which runs [`scripts/builder-league/render-year-video.ts`](../scripts/builder-league/render-year-video.ts). It uses headless Chrome and ffmpeg.

| Setting | Value |
|---|---|
| Schedule | Every 30 minutes, plus a manual `workflow_dispatch` with `max` (jobs per run) and `locale` |
| Timeout | 30 minutes per run |
| Concurrency | One run at a time |
| Secrets (by name) | `NLB_API_BASE` (site origin) and `NLB_RENDER_API_KEY` (an API key of an **admin** account). With either missing, the run exits without doing anything. |

The flow, owned by [`lib/builder-league/render-jobs.ts`](../lib/builder-league/render-jobs.ts):

1. The member requests a render.
2. The job is queued.
3. The renderer claims it with `POST /builder-admin/render-jobs/claim`, which gives a 15-minute lease.
4. The renderer uploads the output with `.../{id}/complete`, or reports a failure with `.../{id}/fail`.

Failures retry with backoff, up to 5 attempts. Queued jobs expire after 14 days. Outputs are kept for 30 days and then deleted by the cron.

Operating it:
- **Stuck jobs:** `GET /api/v1/builder-admin/render-jobs?status=claimed`. An expired lease returns the job to the queue by itself.
- **Failed jobs:** `?status=failed` shows the error. Fix the cause, then the member requests again.
- **Pausing rendering:** disable the workflow in GitHub Actions. Queued jobs wait and expire after 14 days.
- **Rotating the key:** create a new admin API key, update `NLB_RENDER_API_KEY` with `gh secret set NLB_RENDER_API_KEY -R nextlevelbuilder/nlb-web-v2` (paste at the prompt, never on the command line), then revoke the old key.

## Privacy requests

Members control their own visibility:

| What | How |
|---|---|
| Public surfaces (leaderboard, passport, Wrapped), peer mentions, backfill opt-in, redacted financials | The privacy settings page, or `PATCH /api/v1/builder-me` |
| Hide scenes from a shared year | `PATCH /api/v1/builder-year/{year}` with `hiddenScenes` |
| Revoke a share link | `DELETE /api/v1/builder-year/{year}/share/{id}`. The link stops resolving immediately. There is no admin route for one link; for a full removal, use delete below. |

Admin requests, in [`lib/builder-league/privacy-requests.ts`](../lib/builder-league/privacy-requests.ts):

### Export

```http
GET /api/v1/builder-admin/privacy/{userId}/export
```

This returns one JSON attachment with everything the league stores about the member: privacy switches, pilot entry, projects, evidence, appeals, confirmations they gave, events, ledger, badges, ranks, seasons, reward claims, Time Capsule, yearly snapshots, share links (never tokens) with funnel counts, render jobs, and the decision history. Moderator ids are left out.

Evidence files are listed by key. Send them separately through `GET /api/v1/builder-evidence/{id}/files/{name}` while the evidence still exists. Every export writes an audit row (`privacy_request` / `export`).

### Delete

```http
POST /api/v1/builder-admin/privacy/{userId}/delete
Content-Type: application/json

{ "confirm": "<userId>" }
```

The request is refused unless the body repeats the id, it is JSON, and the admin is not deleting their own data.

The deletion runs in this order:

1. **Private R2 files are deleted first** from `BUILDER_EVIDENCE`: every key referenced by the member's evidence and render jobs, plus anything left under `evidence/{userId}/` and `renders/{userId}/`. If any delete fails, the request returns `502 storage_delete_failed` and nothing in D1 changes. Retry it.
2. **One atomic D1 batch** then:
   - deletes evidence, appeals, privacy switches, the pilot entry, projects, badges, ranks, mentor nominations (as nominee or mentor), season entries, reward claims, Time Capsule notes, yearly snapshots, render jobs, share links and their attribution rows;
   - returns the unit of every open claim (requested or approved) to its reward's inventory before deleting the claim.
3. **History is pseudonymised, not deleted.** A fresh tombstone id (`deleted-<uuid>`) replaces the member's id in:
   - `builder_events` (subject, actor, and the counterparty in the payload);
   - `score_ledger` (user, and the `awarded_by:` reason);
   - `score_cap_slots` (user and slot keys);
   - `builder_moderation_actions` (actor and target);
   - the stored entries of `league_snapshots`;
   - other members' rows that name them: counterparty, decided by, resolved by and awarded by.

   Ledger entry ids, RP and dates do not change, so the `eventHash` of finalized boards stays the same and boards still reproduce. No mapping from the old id to the tombstone is stored, including in the audit row (`privacy_request` / `delete`, target = tombstone). The member is removed from the peer mentions in other members' Year in Review snapshots. Visits they made through share links lose their user id.

The `users` account row is **not** deleted. Account deletion is a separate process and should run after this one.

Repeating the request is safe: it reports `nothingToDo: true`.

What remains:
- **Event and ledger dedupe keys.** These are sha256 hashes kept to stop double imports. They can only be matched by someone who already knows the old id and the source record.
- **Final boards.** The tombstone still holds its position on final boards, hidden because it has no public privacy switch.

Take a D1 export first if you are deleting more than a handful of members ([D1 backups](#d1-backup-before-migrations-and-bulk-changes)).

## Pilot management

While the flag is off, only admins and paid members on the allowlist can use the league ([`lib/builder-league/access.ts`](../lib/builder-league/access.ts)). Tier only gates access; it never changes scores.

```http
GET  /api/v1/builder-admin/pilot
POST /api/v1/builder-admin/pilot
{ "action": "add" | "remove", "userId": "..." }   // or "email": "...", optional "note"
```

Both calls are idempotent and audited (`pilot_member` / `add` or `remove`). Removing a member hides the league from them while the flag is off, but keeps their history. To erase that history, use a privacy delete.

The dashboard's pilot section compares each member's 8 weeks before and after enrollment. Enrollment is the earlier of the pilot add and a season join.

## Flag rollout and rollback

`BUILDER_LEAGUE_ENABLED` is a `vars` entry in [`wrangler.jsonc`](../wrangler.jsonc): `"true"` on staging and `"false"` on production.

Rollout:
1. Run the pilot on production with the flag off and members on the allowlist.
2. Watch the dashboard for at least two finalized weeks: the moderation queue age, the rejection rate, reversals and the cost figures below.
3. Change production `BUILDER_LEAGUE_ENABLED` to `"true"` in `wrangler.jsonc` through a PR to `main`. CI deploys it.

Rollback:
- **Hide the feature:** set the var back to `"false"` and deploy. Nothing is deleted. Non-pilot members get 404 again, and their data waits.
- **Bad deploy:** `wr deployments list --env=""`, then `wr rollback <version-id> --env=""`.
- **Bad data:** restore D1, as in the next section. Prefer reversals and replays for scoring mistakes: they keep the audit trail.

## D1 backup before migrations and bulk changes

Builder League migrations are additive, and CI applies them before the build. Take an export before any migration, backfill, bulk privacy delete or manual fix:

```bash
wr d1 export DB --remote --env staging --output <outside-the-repo>/nlb-staging-$(date +%Y%m%d-%H%M).sql
wr d1 export DB --remote --env="" --output <outside-the-repo>/nlb-production-$(date +%Y%m%d-%H%M).sql
```

Keep exports outside the repository: they contain personal data. To restore within 30 days without an export, use Time Travel:

```bash
wr d1 time-travel restore DB --env=<env> --timestamp=<RFC3339>
```

Directory backfill (`POST /api/v1/builder-admin/backfill`, or `scripts/builder-league/backfill-directory.ts`) is a dry run unless you ask otherwise. Export first, run the dry run, read the report, then apply.

A directory approval records a launch live only when the submitter has league access at that moment. Anyone else gets nothing until they join and opt in to the backfill. Each product launches once across both paths and all of its owners. A product that is already claimed shows up in the backfill report as `skipped` with `recorded_from_directory` or `launch_already_recorded`.

## Cost ceilings

These are the limits the code enforces, so you can check them before costs grow:

| Resource | Ceiling | Where to check |
|---|---|---|
| D1 rows | Events, ledger rows and cap slots grow with verified activity. Caps per event type bound the RP, and dedupe stops duplicate rows. Snapshots write only when a board changes. Provisional boards are recomputed at most every 10 minutes per period read (`PROVISIONAL_MAX_AGE_MS`). Year snapshots are built 100 members per cron run. | Cloudflare dashboard → D1 → rows read/written. The dashboard's activity and integrity sections explain growth. |
| R2 storage (`nlb-builder-evidence`, `nlb-builder-evidence-staging`) | Evidence: at most 5 files of 10 MB per submission (`EVIDENCE_MAX_FILES`, `EVIDENCE_MAX_FILE_BYTES`), kept until the evidence or the member is deleted. Renders: video at most 80 MB plus a 5 MB poster per job, deleted after 30 days (`OUTPUT_RETENTION_DAYS`). | Cloudflare dashboard → R2 → bucket size. A climb that render expiry does not explain means evidence uploads; check the queue for spam. |
| Actions render minutes | One run every 30 minutes, at most 30 minutes each and one at a time, with `max` jobs per run (default 5). Worst case is about 48 runs a day. The run exits immediately when nothing is queued or secrets are missing. | GitHub → Actions → Builder League render → usage. To cut cost, lower the schedule or `max`, or disable the workflow during quiet months. |
