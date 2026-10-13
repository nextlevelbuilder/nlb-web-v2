# Design guidelines: Constellation

Constellation is the visual system for every page. It is an editorial "star atlas" on paper in light mode and a "deep space observatory" in dark mode, with one vermillion accent.

Design intent, which is a dated record and not a live spec:
- `plans/reports/mockups/06-constellation.html`: the chosen mockup.
- `plans/reports/mockups/content-spec-v2.md`: prices, FOMO rules, i18n, theme, motion and accessibility rules.

The code below is the source of truth for the current values.

## Tokens

| What | Owner |
|---|---|
| Colour, layout, radius, easing and duration variables for light (`:root`) and dark (`.dark`) | [`app/globals.css`](../app/globals.css) `@layer base` |
| Tailwind names mapped onto those variables, fluid type scale (`text-step-*`), font families | [`tailwind.config.ts`](../tailwind.config.ts) |
| Reusable component classes (`.wrap`, `.eyebrow`, `.lede`, `.plate`, `.seg`, `.link-arrow`, `.skip-link`, `.sky-backdrop`, …) | [`app/globals.css`](../app/globals.css) `@layer components` |
| Fonts: Cormorant Garamond (display), Be Vietnam Pro (sans), JetBrains Mono, all with the Vietnamese subset | [`app/layout.tsx`](../app/layout.tsx) |
| UI primitives (button, card, dialog, accordion, tooltip, badge, scroll area) | `components/ui/` (shadcn on Radix, configured in [`components.json`](../components.json)) |

Rules:
- Colours are HSL triplets, so opacity modifiers work (`bg-primary/10`). Use semantic names (`ink`, `line`, `surface`, `canvas`, `cta`, `star`) or the shadcn names (`foreground`, `border`, `card`, `primary`). Never hard-code hex values in components.
- `--primary` (vermillion) is the signature accent for highlights, links and focus rings. The main CTA is the `cta` token: an ink button on paper.
- Contrast targets are written next to each token in `globals.css` (body ink about 11.7:1, muted text at least 4.5:1, form outlines at least 3:1). Keep them when you change a value, and check both themes.
- A new font size in `tailwind.config.ts` must also be added to the `font-size` class group in [`lib/utils.ts`](../lib/utils.ts). Otherwise `cn()` treats `text-step-*` as a colour and silently drops classes such as `text-cta-foreground`. That bug once made the CTA text unreadable.

## Themes

- System, Light and Dark come from `next-themes` in [`components/theme-provider.tsx`](../components/theme-provider.tsx). It uses the class strategy, localStorage key `nlb-theme`, `system` as the default, and transitions disabled during a switch.
- An inline script sets the theme class before first paint, so there is no flash. Check the browser console on the deployed Worker: a script error there means the stored theme is not applied before paint. `keep_names: false` in [`wrangler.jsonc`](../wrangler.jsonc) stops esbuild injecting `__name` into that inline script.
- The theme toggle is `components/theme-toggle.tsx`.

## Motion

- Easing and duration variables are in `globals.css` (`--ease-*`, `--d-1`…`--d-4`). Framer Motion presets are in [`lib/animations.ts`](../lib/animations.ts).
- Reduced motion is handled in two places:
  - `MotionConfig reducedMotion="user"` in the theme provider covers Framer Motion.
  - A `prefers-reduced-motion` block in `globals.css` covers CSS animations.
- Content must stay fully visible and usable with zero animation. Never hide content behind an entrance animation that reduced-motion users never see.
- Section reveals (`components/home/reveal.tsx`) are CSS scroll-driven animations behind `@supports (animation-timeline: view())`. The server HTML is fully visible, so crawlers, no-JS visitors and full-page captures never see a blank section.

## i18n

- English is the default and is unprefixed. Vietnamese lives under `/vi`. Routing is in [`i18n/routing.ts`](../i18n/routing.ts).
- The language switcher (`components/language-switcher.tsx`) updates the `NEXT_LOCALE` cookie, so an explicit choice beats `Accept-Language` from then on.
- `<html lang>` follows the locale. Vietnamese display type gets extra line height through `html[lang="vi"] .font-display`, because diacritics stack above cap height. Test headings in VI.
- Strings live in `messages/en.json` and `messages/vi.json`, plus the long-form copy modules. Always ship both locales. Canonicals, `hreflang`, the sitemap and markdown twins follow the same EN-default scheme.

## Content rules

- **FOMO**: seats come from real active subscriptions against plan caps ([`lib/home/`](../lib/home)), the countdown date comes from config, and activity toasts use real events or are not shown. No invented numbers.
- **Analytics**: GA4 loads only when the browser sends neither DNT nor GPC ([`components/analytics/google-analytics-consent-aware.tsx`](../components/analytics/google-analytics-consent-aware.tsx)).
- **Legal and policy copy** lives in [`content/policies/`](../content/policies) in both locales. Changes need legal review.

## Accessibility bar

- Lighthouse accessibility ≥ 95 on key routes.
- No horizontal scroll at 320 px.
- Visible focus (`.focus-ring`).
- A skip link.
- Accessible names that contain the visible label.
- Touch targets sized for mobile.
