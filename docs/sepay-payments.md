# SePay bank-transfer payments

Buyers in Vietnam can pay in VND by bank transfer (VietQR) through SePay, next to the Polar checkout. It sells prepaid Premium and VIP memberships (quarterly or annual), course videos and, once its price is set, the Publishing Studio Toolkit. The whole flow is off unless `SEPAY_ENABLED` is `"true"`.

## Flow

1. A signed-in buyer opens `/checkout/bank-transfer?sku=<plan>_<billing>` (from the membership checkout dialog) or `?course=<slug>` (from a locked course video). `POST /api/checkout/sepay` creates a `sepay_orders` row with a unique code (`NLB` + 10 characters) and the server-side VND price, and returns bank details and a VietQR image (`qr.sepay.vn`) with the amount and code pre-filled.
2. The page polls `GET /api/checkout/sepay/{code}` (the owner only) every 5 s until the order is paid.
3. SePay calls `POST /api/webhooks/sepay` for each transaction on the receiving account ([route](../app/api/webhooks/sepay/route.ts), [logic](../lib/payments/sepay-orders.ts)):
   - The `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>` header is checked in constant time; anything else gets 401.
   - Each SePay transaction id is claimed once through the shared webhook lease (`webhook_events`, event id `sepay:<id>`), so retries are acknowledged as duplicates.
   - The order code is read from SePay's detected `code`, else from the transfer content (spaces, dots and dashes that banks insert are ignored).
   - Only the exact amount pays the order. Any other amount sets the order to `amount_mismatch` and grants nothing; a later exact transfer still pays it. Outgoing transfers and transfers without a known code are acknowledged and ignored.
   - Both payload shapes are accepted: the account webhook (`id`, `transferType` in/out, `transferAmount`) and the Bank Hub IPN (`transaction_id`, `transfer_type` credit/debit, `amount`).
4. A paid order is marked `paid` first, then access is granted. Every grant is idempotent, so a retried delivery re-runs them safely:
   - A row in the shared `orders` table (`polar_order_id = sepay_<code>`, currency `vnd`), so account pages see the purchase.
   - Course video: the `video:<id>` entitlement.
   - Membership (with `ONBOARDING_V2_ENABLED`): `reconcile_access` for Discord and Telegram, the welcome email and the admin notification, the same jobs as a Polar subscription ([membership-onboarding.md](./membership-onboarding.md)).
   - One Discord message per paid order to `SEPAY_ORDERS_DISCORD_WEBHOOK_URL` (product, VND amount, masked email, order code), guarded by a `discord_sepay_orders` delivery intent and sent through `waitUntil`.

## Prepaid memberships

A paid membership order is valid for 3 or 12 calendar months from `valid_from` and never renews. [`getMemberTier`](../lib/membership/member-access.ts) reads unexpired paid orders next to the linked Polar subscriptions (as `cancel_at_period_end` grants), so VIP still wins over Premium. Buying the same tier again stacks the new period onto the end of the current one. When a period ends, the hourly tier-drift job queues a reconcile that removes community access. Upgrading a prepaid Premium in place is not supported; the onboarding page falls back to a new checkout.

## Prices

VND prices are the USD list prices × `SEPAY_USD_VND_RATE`, rounded to the nearest 1,000 VND ([`sepay-catalog.ts`](../lib/payments/sepay-catalog.ts)). Membership USD prices come from `MEMBERSHIP_PRICES` in [`lib/constants/launch.ts`](../lib/constants/launch.ts), course videos from their `price_cents`. The toolkit is sold only when `SEPAY_PUBLISHING_TOOLKIT_USD` is set.

## Configuration

Vars in `wrangler.jsonc` per environment: `SEPAY_ENABLED`, `SEPAY_BANK_CODE` (VietQR bank short name, for example `MBBank`), `SEPAY_BANK_ACCOUNT` (the receiving account linked in SePay), `SEPAY_USD_VND_RATE` and optionally `SEPAY_PUBLISHING_TOOLKIT_USD`. Staging uses the SePay sandbox demo account, so its QR is not payable.

Worker secrets, set without echoing (`wr secret put <NAME> --env <env>` reading from a file or stdin, see [deployment-guide.md](./deployment-guide.md#wrangler-access)):

| Secret | Purpose |
|---|---|
| `SEPAY_WEBHOOK_API_KEY` | Random key entered as the webhook's API key in SePay; SePay sends it as `Authorization: Apikey <key>`. One per environment. |
| `SEPAY_ORDERS_DISCORD_WEBHOOK_URL` | Discord incoming webhook for paid SePay orders. Unset skips the message. |

In SePay (my.sepay.vn → Tích hợp Webhooks), add a webhook for the receiving account: event "Có tiền vào", authentication "API Key", URL `https://<host>/api/webhooks/sepay`, and the payment-code prefix `NLB` under company settings so SePay fills `code`.

SePay retries a webhook only on network failures, not on a 5xx answer. A delivery that failed in our code (recorded with its error in `webhook_events`) is recovered by resending it from SePay's webhook history ("Lịch sử gửi"), which the event lease then processes once.

## Why not Bank Hub

A Bank Hub sandbox ("NLB Staging", notify URL pointing at the staging webhook) exists in the SePay account and is kept, but production uses the regular account webhook. Bank Hub is meant for platforms whose merchants link their own bank accounts (link tokens, hosted link, per-company accounts). NLB receives payments into its own account, which is exactly what the regular webhook covers, with less to operate. The webhook route still accepts the Bank Hub IPN shape, so switching later needs configuration, not code.

## Rollout and rollback

1. Staging: `SEPAY_ENABLED` is `"true"` with the sandbox demo account. Verify end to end by creating an order on `/checkout/bank-transfer` and posting a signed sample transaction to the staging webhook.
2. Production: approve the VND prices (listed in the PR), set the receiving account vars and `SEPAY_WEBHOOK_API_KEY`, add the SePay webhook, then set `SEPAY_ENABLED` to `"true"` and deploy.

Rollback: set `SEPAY_ENABLED` to `"false"` and deploy. The checkout page and buttons disappear. The webhook keeps answering, so transfers already in flight still grant access. The additive `sepay_orders` migration can stay.
