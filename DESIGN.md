# DESIGN.md

**Brand essence:** Next Level Builders is a star atlas for builders: every product starts as one point of light, and the community connects them into constellations.

This file is the entry point for UI work. Token values, themes, i18n and content rules are owned by [docs/design-guidelines.md](docs/design-guidelines.md) and the code it links (`app/globals.css`, `tailwind.config.ts`). Do not copy values here; change them there.

## Art direction

- Editorial star atlas on paper (light) and a deep-space observatory (dark), one vermillion accent (`--primary`).
- Display serif (Cormorant Garamond, italic for the emphasised phrase), Be Vietnam Pro for UI and body, JetBrains Mono for eyebrows, plate captions and meta. The mono micro-label with a roman numeral (`I THE DARK`) is the repeated chapter motif.
- The home page reads as numbered chapters: hero, the dark (problem), constellation (insight), courses, directory, proof, partners, pricing, terminal, FAQ, finale.
- Honest proof only: real seat counts, real partners, real builders. No invented numbers or stock testimonials.

## Layout and breakpoints

- Content column: `.wrap` (`min(var(--wrap), 100% - 2 * var(--gutter))`). Never combine `.wrap` with a `w-*` utility: utilities win and remove the side gutters.
- Tailwind default breakpoints (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Recompose per viewport rather than shrinking.
- Review every changed page at 1440×900, 768×1024 and 375×812, plus a 320 px reflow check with no horizontal scroll.

## Motion

- Tokens: `--d-1` 140 ms and `--d-2` 260 ms for UI feedback, `--d-3` 600 ms for section-level reveals; `--ease-quart` / `--ease-expo` for entering. Animate `transform` and `opacity` only.
- Section reveals use `<Reveal>` (`components/home/reveal.tsx`): content is visible in the server HTML, and only an element still below the fold after hydration is hidden until it intersects. Never ship `opacity: 0` as an initial server state, and avoid scroll-driven `animation-timeline` with a backwards fill: tall-viewport renderers such as Googlebot see the hidden state.
- Framer Motion is for interactive state changes only and runs under `MotionConfig reducedMotion="user"`.

## Components

- Primitives in `components/ui/` (shadcn on Radix). Dialogs take a localized `closeLabel`.
- Checkout: hero and pricing CTAs are always enabled and open `CheckoutConfirmDialog` (plan, price, Terms checkbox, "Continue to Polar checkout").
- Seat meter: "N of M left" only when at least half the seats are taken, otherwise "Limited to M members" (`lib/home/seat-meter.ts`).

## Voice and tone

- Knowledgeable and plain. Headlines state an outcome in about ten words; subheads are one sentence; CTAs are a verb plus an object.
- Ship EN and VI together. Vietnamese copy is written, not machine-translated word for word.

| Do | Don't |
|---|---|
| "Launch from your terminal." | "Reimagine the future of building." |
| "Limited to 100 members" when few seats are taken | "Only 97 left!" when 3 of 100 are taken |
| One primary CTA per view | Several equal-weight buttons in the hero |
