# ADR: Affiliate program — tiered incentive budget, ledger and audited payouts

Status: accepted (P1) · Date: 2026-10-31 · Issue: nextlevelbuilder/nlb-web-v2#63 · MCP counterpart: nextlevelbuilder/nlb-directory-toolkits#19

## Context

Members asked to earn from referring new members. A referral program moves real money, so it needs
the same guarantees as payments: decisions made from trusted server state, exactly-once money
movement under retried and out-of-order webhooks, an audit trail, and a payout process a finance
operator can reconcile against Polar and the payment provider. Payouts also carry legal duties
(tax withholding in Vietnam, identity checks for bank payees, affiliate disclosure), which are not
yet reviewed.

The runtime is a Cloudflare Worker on D1: one statement or one `db.batch([...])` is the atomic unit,
so correctness comes from unique keys and conditional updates, not transactions.

## Decision

### Levels and incentive budget

- An affiliate's **level** is earned by qualifying customers: distinct referred buyers whose
  conversion is `pending` or `available` (not held or reversed). Levels and budgets are a versioned
  rules document (`affiliate_program_rules`); defaults in
  [`lib/referrals/program-rules.ts`](../lib/referrals/program-rules.ts):

  | Level | From customers | Budget (ordinary) | Budget (Premium/VIP member) |
  |---|---|---|---|
  | starter | 0 | 10% | 20% |
  | builder | 5 | 15% | 25% |
  | partner | 20 | 20% | 35% |
  | ambassador | 50 | 25% | 45% |
  | elite | 100 | 30% | 50% |

- The **basis** comes from the server-side membership tier resolver at checkout time. A lapsed
  membership keeps the level and only lowers the budget for new checkouts.
- The affiliate splits the budget `B` between a buyer discount `d` and their commission `c` on what
  the buyer pays: `d + (1 − d)·c ≤ B`. Checked exactly in integers:
  `d·10000 + (10000 − d)·c ≤ B·10000`.
- A link stores only `d`. The commission is always the largest the rest of the budget allows,
  `c = floor((B − d)·10000 / (10000 − d))`. Creating or editing a link with `d > B` is refused
  (422 `over_budget`), so an over-budget pair can never be stored. If the budget drops later, new
  checkouts clamp `d` to `B` ([`program-math.ts`](../lib/referrals/program-math.ts)).
- Publishing new rules is a sensitive two-person action (`affiliate.rules.publish`). New checkouts
  use the new version; existing snapshots never change.

### Money and rounding

- Rates are integer basis points; money is integer minor units of the program currency (USD).
- The buyer discount is a Polar percentage discount (`duration: once`, limited to eligible
  products, reused per rate). Polar computes it; we read the amounts from the order.
- Commission = `floor(net × c / 10000)`, where net is the order's pre-tax amount after discount.
  Fractions stay with NLB.
- Refund reversal is proportional to the net refunded, rounded **up** and capped at the commission,
  so a full refund always reverses the whole commission and partial refunds never under-reverse.
  The net refunded is `min(net, refunded_amount)`: Polar's `refunded_amount` is already pre-tax
  (refunded tax is reported separately), and an order in status `refunded` counts as a full refund.
- Payout service fee and withholding are each floored on the gross; the payee receives the rest.

### Attribution

- Only the **first** membership purchase (Premium or VIP, any interval; never early-bird) of a
  **signed-in** buyer is referred. A buyer converts once ever (`affiliate_conversions.buyer_user_id`
  is unique) and a buyer with an earlier paid or refunded membership order is skipped.
- Source: an explicit code (`?ref=` carried to checkout, or typed) wins over the `nlb_aff` click
  cookie. The cookie counts within `attributionWindowDays` (30) of the click. An explicit code that
  is unknown or cannot apply (inactive affiliate, self-referral) falls back to a valid cookie; with no
  usable cookie the explicit code's reason is reported. Self-referral, inactive or ineligible
  affiliates and banned or unverified buyers are skipped. A skipped referral never blocks the
  purchase, and neither does a failure while attributing (database or Polar discount error): it is
  logged and the checkout continues without a referral (`reason: "unavailable"`).
- At checkout the server writes an immutable **attribution snapshot** (level, basis, budget,
  discount, commission, rules and link version, Polar discount id) and sends only its id in Polar
  metadata (`nlb_aff_attr`). The webhook reads the snapshot, never the client.
- Renewals and plan changes (`billing_reason` other than `purchase`/`subscription_create`) earn
  nothing. An order that does not match its snapshot (product, buyer, discount, currency, or paid
  after the 7-day binding) is accrued as **held** for review instead of trusted.
- `/r/<code>` redirects (307) to an allowlisted same-site landing path with `ref` and UTM
  parameters. Browsers sending GPC or DNT get the redirect without cookies or click counting.
  Unique clicks are counted per link, UTC day and HMAC visitor hash.

### Ledger

- `commission_ledger` is append-only (D1 triggers abort `UPDATE` and `DELETE`). Each entry moves an
  amount between buckets — `pending`, `held`, `available`, `payout_locked`, `paid` (or from/to
  outside) — and has a unique deterministic idempotency key (`accrual:<order>`,
  `reversal:<conversion>:<target>:<bucket>`, `maturation:<conversion>`, `payout_lock:<batch>:<affiliate>`,
  `payout_paid:<item>`, `payout_unlock:<item>`, adjustments keyed by their approval). A retried,
  duplicated or concurrent event inserts nothing twice. Balances are sums, never stored.
- Lifecycle: accrual → `pending`; after `holdDays` (45, longer than the 30-day refund window) the
  hourly cron matures it to `available`; operators can hold and release. Refunds reverse from
  `pending`, then `held`, then `available`. A refund after payout drives `available` negative; the
  debt is recovered from future earnings (stated in the Affiliate Agreement).
- Amounts that depend on the current ledger are computed **by SQLite inside the write**, never from
  a balance read earlier: each statement is an `INSERT … SELECT … WHERE` over ledger sums. A refund
  writes its reversal steps (owed = target − already reversed, capped per bucket) and the
  conversion's refunded amount in one `db.batch`, so concurrent refund events with different targets
  converge on the largest target. Maturation, hold and release each write the move of what the
  conversion still has in the source bucket and the guarded status change in one `db.batch`, so a
  conversion is never `available` (or `held`) while its money is still in `pending`.
- The hourly cron matures at most 200 conversions per batch of two statements and five batches per
  run (1000 conversions, 10 D1 queries), well inside D1's 1000-queries-per-invocation limit; a larger
  backlog drains over the next runs.

### Payouts

- Monthly batches for closed months only. A period has at most one batch that is not cancelled
  (partial unique index), so cancelling a batch frees its period. Preview is read-only (it never
  matures commissions) and lists every affiliate with an available balance and its blockers:
  `below_threshold` ($25), `payout_method_required`, `withholding_rule_missing`,
  `verification_required` (Vietnamese bank payees), `affiliate_suspended`.
- Create matures due commissions, then locks each payable gross amount (`available →
  payout_locked`). Each payee's item and its lock are written in one `db.batch`: the item is
  inserted only while the affiliate's `available` balance, summed in SQL at write time, still covers
  the gross, and the lock is inserted only if that item exists. So an item never exists without its
  lock, and two batches (for any periods, even created in parallel) cannot lock the same money
  twice. We chose this guard over "one open batch at a time" because it is the invariant itself and
  needs no extra state: a later batch simply pays what became available since. A payee whose balance
  no longer covers the preview is skipped; a batch left with no item is removed (`nothing_to_pay`).
- Approval is a sensitive two-person action (`affiliate.payout.approve`); a batch that is not a
  draft is refused before the approval is consumed. Each transfer is made outside the system and
  recorded once with the provider's unique external reference, payout currency, FX rate and
  provider fee (`payout_locked → paid`): the item update (only while the batch is `approved`), the
  ledger entry and the batch's move to `paid` are one `db.batch`. Cancelling an unpaid batch is one
  `db.batch` too: the batch is cancelled only while no item is paid, and each pending item is
  unlocked and cancelled with it, so cancel and mark-paid cannot interleave.
- Recording a payment is gated by `AFFILIATE_PAYOUTS_ENABLED`, a session-only operator action, and
  never exposed to API keys or MCP.
- Reconciliation reports per-conversion accrual and reversal next to the Polar amounts, and checks
  that `paid` equals recorded items, `payout_locked` equals pending items, no affiliate has a
  negative `pending`, `held` or `payout_locked` bucket (`negativeBuckets`), and no conversion that
  left `pending` still has money there (`strandedPending`).

### Payout methods, tax and privacy

- PayPal (any residency; a 20% NLB service fee covering processing and FX) or a Vietnamese bank
  transfer (VN residents only). Details are sealed with AES-GCM (`ONBOARDING_ENCRYPTION_KEY`) with
  the affiliate id as associated data, so a sealed blob copied to another affiliate's row does not
  open; only a masked hint is readable. Setting a method is session-only. Operators reveal details only
  through an audited session route.
- Withholding rates are part of the rules. Vietnamese rates ship as `null`, which blocks Vietnamese
  payees until a tax adviser approves the rates. Bank payees also need a `verified` identity record;
  eKYC is P2 and we store only the provider reference, never raw documents.
- Member views never show buyer identity: a conversion is a date, plan and amounts. The member
  ledger omits an operator's free-text reason (`reason: null` on entries an operator wrote, such as
  holds and adjustments); system reasons such as `refund` stay.

### Interfaces

- Member REST `/api/v1/affiliates/*` (session, API key or MCP delegation; owner-only) and operator
  REST `/api/v1/affiliate-admin/*` (operator domain `affiliate`, `mcp:operator` for MCP, audited,
  two-person approvals for sensitive actions). OpenAPI paths are complete and tested but published
  at launch, like Live.
- MCP tools on the single NLB endpoint: member reads/writes (`affiliate_*`) and operator reads,
  previews and safe writes (`affiliate_admin_*`). No tool reads or sets payout details, records a
  payment, publishes rules, adjusts balances or approves batches.

### Flags

- `AFFILIATES_ENABLED`: member and public surfaces 404 and checkout attribution is off while false.
  Operator APIs and maturation run regardless. Production `false`, staging `true`.
- `AFFILIATE_PAYOUTS_ENABLED`: recording payments. `false` everywhere until the gates below pass.

## Launch gates

1. Legal review of the Affiliate Agreement (EN/VI, version `2026-10-31`) and the terms, privacy,
   refund and cookie notices. Bump `AFFILIATE_TERMS_VERSION` if the text changes.
2. Finance review of fees, threshold and the reconciliation report on staging data.
3. Tax adviser approval of Vietnamese withholding rates (publish rules with the rates).
4. Then set `AFFILIATES_ENABLED=true` in production, publish the OpenAPI paths, and later
   `AFFILIATE_PAYOUTS_ENABLED=true` before the first payout run.

## Phases

- **P1 (this ADR):** rules, links, attribution, ledger, payouts workflow, REST, MCP/CLI parity, UI,
  policies, flags off in production.
- **P2:** eKYC provider for bank payees, approved withholding, fraud heuristics (velocity, shared
  payment instruments, device clusters), affiliate-facing tax documents.

## Data model

[`lib/db/affiliate-schema.ts`](../lib/db/affiliate-schema.ts), migration
`drizzle/migrations/0005_affiliate_program.sql` (additive).

## Consequences

- Money correctness rests on unique keys and conditional updates; tests in `tests/referrals/` cover
  duplicates, concurrency, out-of-order refunds, payout races and the append-only trigger.
- A buyer who signs in only after paying is not referred; we accept the lost attribution to keep
  the decision on trusted state.
- Polar discounts are created lazily per rate and reused; an extra discount created by a race is
  never applied.
