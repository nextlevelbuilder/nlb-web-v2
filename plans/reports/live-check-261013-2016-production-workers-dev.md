# Live check — production workers.dev (2026-10-13 20:16)

URL: https://nextlevelbuilder-web.hi-7ac.workers.dev. Checked by hand in the in-app browser (desktop 1280 and mobile 375, EN and VI). These are inputs for the UX/AX pass.

## What works
- All key public routes return 200, and route parity matches the old site. `/products` and `/policies/terms-of-service` return 404 on both old and new, because the old site never had them.
- The Constellation design renders. VI auto-detection and `lang="vi"` work. There is no horizontal scroll at 375 px.
- The founders, partners, AgentKit, dewee and ReelCrew sections show the content from the harvest.
- The migrated data is correct. Neon really has 0 subscriptions, 2 orders, 16 users and 62 customers, so "30 of 30 seats left" is the true value.

## Problems to fix
1. **Theme script crashes before paint.** The page logs `ReferenceError: __name is not defined`. It comes from the next-themes inline script: wrangler's esbuild `keep_names` injects `__name(...)` into the function that next-themes serialises with `toString()`. As a result the stored theme is not applied before paint, which defeats the no-flash requirement. Fix: set `"keep_names": false` in `wrangler.jsonc`, or define `__name` in a tiny inline shim placed before the script. Then check that the console is clean.
2. **`POST /api/traffic/posthog` returns 503 on every page view.** This happens when PostHog is not configured. Return 204 (no-op) when the PostHog key is missing, or don't call the endpoint at all, so the console stays clean.
3. **The hero CTA is disabled until a Terms checkbox is ticked.** The primary CTA renders greyed out with "Tick the box to enable checkout", which hurts conversion on every breakpoint. The old site asked for terms in a pre-checkout popup instead. Fix:
   - Keep the CTA always enabled.
   - On click, open a small accessible dialog that shows the chosen plan, the price and the Terms checkbox, followed by a "Continue to Polar checkout" button. This keeps explicit consent and restores parity.
   - Apply the same pattern to the pricing cards.
4. **The seat meter shows "0 of 30 seats taken".** That is true, but it works against FOMO. Rule: show the "N of M seats left" meter only when at least 50% of a plan's seats are taken. Otherwise show the cap as exclusivity, for example "Limited to 30 members" / "Giới hạn 30 thành viên". Keep the values real.
5. **The EGANY partner card has no visible name heading.** DIGITOP.AI and 200LAB.IO show one. Add the EGANY.COM wordmark heading.
6. **The hero plan line defaults to VIP.** It reads "VIP · $297/quarter". Make sure this default is intentional (the higher anchor). The pricing section highlights VIP as "Brightest", so this is acceptable, but Premium is the cheaper entry point. Decision: keep VIP as the default.
