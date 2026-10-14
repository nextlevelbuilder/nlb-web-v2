# Design guidelines: Constellation

Constellation is the visual system for every page. It is an editorial "star atlas" on paper in light mode and a "deep space observatory" in dark mode, with one vermillion accent.

Design intent, which is a dated record and not a live spec:
- `plans/reports/mockups/06-constellation.html`: the chosen mockup.
- `plans/reports/mockups/content-spec-v2.md`: prices, FOMO rules, i18n, theme, motion and accessibility rules.

The code below is the source of truth for the current values.

## Tokens

| What | Owner |
|---|---|
| Mockup tokens (`--bg`, `--ink`, `--ink-2`, `--accent`, `--line`, `--t-*`, `--s-*`, `--d-*`) per theme on `html[data-theme]`, plus the shell components (header, menu, cursor, buttons, plates, footer, static sky) | [`app/constellation-shell.css`](../app/constellation-shell.css) |
| Home chapter styles (ported 1:1 from the mockup, plus founders, partners, catalogues, FAQ and logbook in the same language) | [`app/[locale]/constellation-home.css`](../app/[locale]/constellation-home.css) |
| HSL triplets used by Tailwind and shadcn on inner pages, light (`:root`) and dark (`[data-theme="dark"]`) | [`app/globals.css`](../app/globals.css) `@layer base` |
| Tailwind names mapped onto those variables, fluid type scale (`text-step-*`), font families | [`tailwind.config.ts`](../tailwind.config.ts) |
| Generic primitives shared with inner pages (`.wrap`, `.eyebrow`, `.lede`, `.plate`, `.seg`, `.link-arrow`, `.btn`, `.skip`) | [`app/constellation-shell.css`](../app/constellation-shell.css) (`:where()` so page utilities win) |
| Fonts: Cormorant Garamond (display), Be Vietnam Pro (sans), JetBrains Mono, all with the Vietnamese subset | [`app/layout.tsx`](../app/layout.tsx) |
| UI primitives (button, card, dialog, accordion, tooltip, badge, scroll area) | `components/ui/` (shadcn on Radix, configured in [`components.json`](../components.json)) |

Rules:
- Tailwind colours are HSL triplets, so opacity modifiers work (`bg-primary/10`). The triplets formerly named `--ink-2` and `--accent` are `--ink-soft` and `--accent-surface`, so they never collide with the mockup's full-colour `--ink-2` and `--accent`. Use semantic names (`ink`, `line`, `surface`, `canvas`, `cta`, `star`) or the shadcn names (`foreground`, `border`, `card`, `primary`). Never hard-code hex values in components.
- `--primary` (vermillion) is the signature accent for highlights, links and focus rings. The main CTA is the `cta` token: an ink button on paper.
- Contrast targets are written next to each token in `globals.css` (body ink about 11.7:1, muted text at least 4.5:1, form outlines at least 3:1). Keep them when you change a value, and check both themes.
- A new font size in `tailwind.config.ts` must also be added to the `font-size` class group in [`lib/utils.ts`](../lib/utils.ts). Otherwise `cn()` treats `text-step-*` as a colour and silently drops classes such as `text-cta-foreground`. That bug once made the CTA text unreadable.

## Themes

- System, Light and Dark come from `next-themes` in [`components/theme-provider.tsx`](../components/theme-provider.tsx). It sets `data-theme` on `<html>` (Tailwind `darkMode` uses the same selector), localStorage key `nlb-theme`, `system` as the default. A switch adds `.theme-anim` for 700 ms so colours cross-fade as in the mockup.
- An inline script sets `data-theme` before first paint, so there is no flash. Check the browser console on the deployed Worker: a script error there means the stored theme is not applied before paint. `keep_names: false` in [`wrangler.jsonc`](../wrangler.jsonc) stops esbuild injecting `__name` into that inline script.
- The theme control is the segmented `components/site/theme-seg.tsx` (header and menu).

## Motion

- The home experience lives in typed modules under [`lib/constellation/`](../lib/constellation) and boots from one client component with a full cleanup (pins, tweens, Lenis, GL context). See DESIGN.md › Motion for the rules.
- Reduced motion is handled in three places: the engine (no Lenis/GSAP, static sky per chapter), CSS (the `prefers-reduced-motion` kill switch in `app/constellation-shell.css`, which also covers the home stylesheet; SVG orbit loops are paused by the engine), and `MotionConfig reducedMotion="user"` for the Framer Motion still used on inner pages.
- Content must stay fully visible and usable with zero animation.

## i18n

- English is the default and is unprefixed. Vietnamese lives under `/vi`. Routing is in [`i18n/routing.ts`](../i18n/routing.ts).
- The language segment (`components/site/lang-seg.tsx`) switches through next-intl routing, which updates the `NEXT_LOCALE` cookie, so an explicit choice beats `Accept-Language` from then on.
- `<html lang>` follows the locale. Vietnamese display type gets extra line height through `html[lang="vi"] .font-display`, because diacritics stack above cap height. Test headings in VI.
- Strings live in `messages/en.json` and `messages/vi.json`, plus the long-form copy modules. Always ship both locales. Canonicals, `hreflang`, the sitemap and markdown twins follow the same EN-default scheme.

## Content rules

- **FOMO**: seats come from real active subscriptions against plan caps ([`lib/home/`](../lib/home)), the countdown date comes from config, and activity toasts use real events or are not shown. No invented numbers.
- **Analytics**: GA4 loads only when the browser sends neither DNT nor GPC ([`components/analytics/google-analytics-consent-aware.tsx`](../components/analytics/google-analytics-consent-aware.tsx)).
- **Legal and policy copy** lives in [`content/policies/`](../content/policies) in both locales. Changes need legal review.

## Accessibility bar

- Lighthouse accessibility ≥ 95 on key routes.
- No horizontal scroll at 320 px.
- Visible focus (`:focus-visible` rings in `app/constellation-shell.css`; `.focus-ring` on inner pages).
- A skip link.
- Accessible names that contain the visible label.
- Touch targets sized for mobile.
