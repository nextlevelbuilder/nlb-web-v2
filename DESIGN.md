# DESIGN.md

**Brand essence:** Next Level Builders is a star atlas for builders: every product starts as one point of light, and the community connects them into constellations.

This file is the entry point for UI work. Token values, themes, i18n and content rules are owned by [docs/design-guidelines.md](docs/design-guidelines.md) and the code it links (`app/constellation-shell.css`, `app/globals.css`, `tailwind.config.ts`). The home page is a faithful port of `plans/reports/mockups/06-constellation.html`: when in doubt, match the mockup. Do not copy values here; change them there.

## Art direction

- Editorial antique star atlas on paper (light) and a deep-space observatory with a nebula sky (dark), one accent per theme (`--accent`: vermillion on paper, starlight gold in the dark).
- Display serif (Cormorant Garamond, italic for the emphasised phrase), Be Vietnam Pro for UI and body, JetBrains Mono for eyebrows, plate captions and meta. The mono micro-label with a roman numeral (`I THE DARK`) is the repeated chapter motif.
- The home page reads as numbered chapters over one WebGL sky: a single point (0 · hook) splits, the dark (I), the NLB constellation forms (II), observatory/courses (III), magnitude/directory (IV), brightest/proof (V, with founders V·ii and partners V·iii), ignition/pricing (VI), transmission/terminal (VII, with member launches, the team's products and the FAQ VII·ii), and every star gathers into yours (VIII · finale).
- Content the mockup lacks is drawn in its language: plates with roman numerals and coordinates, surfaces with hairlines, Greek-letter catalogues, orbit illustrations.
- Honest proof only: real seat counts, real partners, real builders. No invented numbers or stock testimonials.

## Layout and breakpoints

- Content column: `.wrap` (`min(var(--wrap), 100% - 2 * var(--gutter))`). Never combine `.wrap` with a `w-*` utility: utilities win and remove the side gutters.
- Tailwind default breakpoints (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Recompose per viewport rather than shrinking.
- Review every changed page at 1440×900, 768×1024 and 375×812, plus a 320 px reflow check with no horizontal scroll.

## Motion

- One engine per page load, booted from `components/constellation/home-engine-client.tsx` (`lib/constellation/home-engine.ts`): the raw-WebGL sky (`sky-renderer.ts`), Lenis smooth scroll and GSAP ScrollTrigger chapters (`chapter-motion.ts`). Inner pages get the static sky only (`components/site/static-sky.tsx`).
- Headlines are server-rendered and visible; split-text words are wrapped on the server (`components/constellation/split-text.tsx`) and only lifted by GSAP after hydration. Never ship `opacity: 0` in server HTML for content below the hero, and avoid scroll-driven `animation-timeline` with a backwards fill.
- Pinned chapters re-parent their `<section>` into a pin-spacer, so every top-level chapter in `<main>` renders unconditionally.
- Reduced motion: no Lenis, no tweens, no cursor; the sky jumps to one static state per chapter. Touch: fewer particles and no cursor effects; the split/constellation/finale moments stay. The rAF loop pauses while the tab is hidden; DPR is capped. No WebGL: an SVG chart (`lib/constellation/sky-fallback.ts`).
- Durations `--d-1`…`--d-4` and `--ease-expo` live in `app/constellation-shell.css`. Animate `transform` and `opacity` only.

## Components

- Primitives in `components/ui/` (shadcn on Radix). Dialogs take a localized `closeLabel`.
- Site shell on every page (`components/site/`): header with language and theme segments, full-screen menu, custom cursor with magnetic `.magnetic` CTAs (fine pointers only), footer.
- Checkout: hero, sticky, header and finale CTAs scroll to `#pricing`; each plan card's Join button opens `CheckoutConfirmDialog` (plan, price, Terms checkbox, "Continue to Polar checkout").
- Seat meter: "N of M left" only when at least half the seats are taken, otherwise "Limited to M members" (`lib/home/seat-meter.ts`).

## Voice and tone

- Knowledgeable and plain. Headlines state an outcome in about ten words; subheads are one sentence; CTAs are a verb plus an object.
- Ship EN and VI together. Vietnamese copy is written, not machine-translated word for word.

| Do | Don't |
|---|---|
| "Launch from your terminal." | "Reimagine the future of building." |
| "Limited to 100 members" when few seats are taken | "Only 97 left!" when 3 of 100 are taken |
| One primary CTA per view | Several equal-weight buttons in the hero |
