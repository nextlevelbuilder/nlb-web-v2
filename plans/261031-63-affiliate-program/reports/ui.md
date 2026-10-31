# Affiliate program UI: implementation report

Status: done, with concerns (listed at the end). The work is uncommitted; the controller commits it.

## What was built

- **Public landing `/[locale]/affiliates`** (EN/VI). It covers:
  - how it works
  - the level table
  - a budget split explainer with a worked example (entry member budget, half as the buyer discount, on the Premium quarterly price)
  - rules and eligibility, payout terms, an FAQ in native `<details>`, and a final CTA

  When `AFFILIATES_ENABLED` is not `"true"` the page calls `notFound()` and its metadata is noindex. Otherwise it carries the canonical and hreflang (via `pageMetadata`), breadcrumb and FAQPage JSON-LD, and its own `opengraph-image.tsx`.
- **Dashboard `/[locale]/account/referrals`**. It is noindex, returns 404 while the flag is off, and shows a sign-in panel when signed out.
  - **Not enrolled:** the agreement checkbox posts `POST /api/v1/affiliates/me {termsVersion}`, and the level table is shown.
  - **Enrolled:** it shows, in order:
    - a suspended alert, and a "payouts not live" note while `AFFILIATE_PAYOUTS_ENABLED` is off
    - level, customers and budget, with a progress bar to the next level
    - five balance buckets
    - links with copy-URL, clicks and conversions, plus create/edit with a discount slider and a live commission preview, and pause/resume
    - the FTC-style disclosure
    - conversions (no buyer identity), the ledger and payouts
    - the payout method form (`PUT /api/v1/affiliates/payout-method`; PayPal, or VN bank with a verification note; sealed details are never prefilled)
    - the level table, with the current level highlighted
- **Account entry point:** a flag-gated card on `/account` linking to `/account/referrals`.
- **Policies.**
  - New `content/policies/affiliate-agreement.ts` (EN/VI, `lastUpdated` 2026-10-31), registered in `content/policies/index.ts`. Its first section is a visible "Status: pending legal review" notice.
  - Additive edits, each with `lastUpdated` set to 2026-10-31:
    - terms: the Affiliate Agreement applies to participants
    - privacy: affiliate data (a salted click hash, sealed payout details, the verification provider reference only, no copies of identity documents, buyers never identified) and retention
    - refund: refunds reverse the commission
    - cookies: a new section 6, "Referral cookies", for `nlb_aff` and `nlb_wv` (30 days, httpOnly, not set under DNT/GPC); later sections renumbered
- **Checkout.** `?ref=<code>` is read after hydration (`referralCodeFromSearch`, `^[a-z0-9-]{4,32}$`) and sent as `referralCode` to `POST /api/checkout`. The confirm panel shows a referral note, and switches to the "applied" note when the response has `referral.applied`.
- **Discovery** (flag-gated, following the Live pattern):
  - sitemap entry for `/affiliates` in both locales
  - an `llms.txt` line pointing to `/affiliates.md`
  - optional `/affiliates` pages in `llms-full.txt`
  - a markdown twin via `lib/markdown/page-paths.ts`

  `/account/referrals` stays out of every discovery surface. The agreement is listed with the other policies.

## Files

New:
- `app/[locale]/affiliates/page.tsx`, `opengraph-image.tsx`
- `app/[locale]/account/referrals/page.tsx`
- `components/affiliates/*`:
  - api, copy-button, destinations, enroll-form, format, history-tables
  - level-name, level-table, link-form, links-panel, payout-method-form
  - plate, types, use-affiliate-error
- `content/policies/affiliate-agreement.ts`
- `tests/affiliates-ui/affiliate-format.test.ts`, `tests/affiliates-ui/affiliate-discovery.test.ts`

Modified:
- `app/[locale]/account/page.tsx`
- `components/home/checkout-context.tsx`, `components/checkout/checkout-confirm-panel.tsx`
- `content/policies/{index,terms,privacy,refund,cookies}.ts`
- `messages/en.json`, `messages/vi.json` (namespaces `affiliates`, `affiliateAccount`, `affiliateCheckout`)
- `app/sitemap.ts`, `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts`, `lib/markdown/page-paths.ts`
- tests: `tests/policies-content.test.ts`, `tests/policies-route.test.ts`, `tests/discovery-surfaces.test.ts`

## Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on all touched files | clean |
| vitest: discovery-surfaces, discovery-routes, compliance-copy, policies-content, policies-route, home-render-smoke, seo-structured-data-and-discovery, live-ui, home-faq, onboarding-ui, home-locale-routing and the other suites that import changed modules (16 files) | 160/160 pass |
| New `tests/affiliates-ui` | 19 tests pass: format helpers, the budget example (2000 bps budget with a 1000 bps discount gives 1111 bps; a $147 price gives 13230 paid and 1469 commission), destinations, `referralCodeFromSearch`, error mapping, discovery with the flag on and off, and EN/VI key and placeholder parity |
| `npm run build` | passes; `/[locale]/affiliates`, `/[locale]/affiliates/opengraph-image` and `/[locale]/account/referrals` are emitted |
| Request bodies against the committed strict member schemas (`lib/referrals/http/affiliate-member-schemas.ts`) and the checkout `referralCode` field | match |

## Visual verification

**Environment**
- One dev server on port 3100 (PID 19284 and its children). It was stopped at the end, and port 3100 is free.
- Flags: `AFFILIATES_ENABLED=true` and `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`. The second is needed because the `wrangler.jsonc` vars pin the flag to `"false"`, and the Cloudflare context takes precedence over `process.env`.
- Local D1 had `wrangler d1 migrations apply DB --local` applied, plus one seeded test user and session (`ui-shot@example.test`). This lives only in the gitignored `.wrangler/` state.

**Signed-in flow, run through the real UI:**
1. Accept the agreement and join.
2. Open "New link", fill in the label, the code `ui-shot-demo` and a 10% discount.
3. Click "Create link"; "Link created." is shown.

The REST calls succeeded and there were no console errors.

**Screenshots** are in `reports/screens/` at 1440, 768, 375 and 320. All are JPEG under 300 KB; long pages use a lower JPEG quality.
- `affiliates-en-*`, `affiliates-vi-*`
- `agreement-en-*`
- `account-referrals-signed-out-*`, `account-referrals-join-*` (signed in, not enrolled)
- `account-referrals-enrolled-*`, `account-referrals-create-form-1440`
- `account-entry-*` (the `/account` entry card)

**Horizontal scroll at 320.**
- The first pass found the nowrap pill CTA on `/affiliates` overflowing by 14 px (EN) and 58 px (VI).
- Fixed: the two landing CTAs now wrap (`h-auto min-h-[52px] whitespace-normal`).
- After the fix, every page measures 0 px overflow at all four widths. The level and history tables scroll inside their own focusable region.

**Console errors:** none on any screenshot page, `/`, `/vi` or `/?ref=ui-shot-demo`.

## Concerns

1. **The Affiliate Agreement is public while the flag is off.** It is a normal policy slug, so it is listed in the policy sidebar and the sitemap. Hiding it would need changes to `app/[locale]/policies/**`, which is outside this phase's ownership.
2. **Test exemption for the review notice.** The "never renders a draft banner phrase" test now exempts `affiliate-agreement`, because the visible pending-legal-review notice was explicitly required. A new test asserts that the notice is there.
3. **The "applied" note is brief.** Checkout redirects straight to Polar, so the applied note shows only during the redirect. The pre-submit note ("Referral code X will be applied if eligible") is the one users actually read.
4. **`?ref` is only read on the home page.** Only the home `CheckoutProvider` reads it. Other landing pages rely on the `nlb_aff` cookie, which is not set under DNT/GPC. `membership-upgrade-button.tsx` was left unchanged.
5. **`nlb_wv` is shared with Builder Wrapped.** It is also set by `app/api/v1/builder-wrapped/visit/route.ts`, together with `nlb_share_ref`. The cookie policy did not document either cookie before this change, and it now documents `nlb_wv` only in its referral role. A follow-up should cover the share-link cookies.
