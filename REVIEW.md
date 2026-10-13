# REVIEW.md

Checklist for reviewing UI, content and discovery changes. Attach screenshots for every UI change.

## UX

- [ ] First impression: what it is, for whom and why it is better is clear within five seconds at each viewport.
- [ ] Brand: the change follows [DESIGN.md](DESIGN.md) (tokens, chapter motif, one accent, voice).
- [ ] Content: outcome-first headlines, one idea per section, verb-led CTAs, EN and VI both shipped.
- [ ] Hierarchy: one primary action per view.
- [ ] Trust: numbers and names are real and sourced; policy and contact links work.
- [ ] Motion: transform/opacity only, durations from the tokens, nothing hidden without JS, reduced motion removes movement.
- [ ] Responsive: screenshots at 1440×900, 768×1024, 375×812; no horizontal scroll at 320 px; touch targets at least 24 px (primary 44 px).
- [ ] Accessibility: WCAG 2.2 AA contrast in both themes, visible focus, keyboard path through dialogs and menus, landmarks and one H1; Lighthouse accessibility ≥ 95 on home, blog and courses.
- [ ] Console: no errors on home EN and VI after load.

## AX (agents and search)

- [ ] `node ~/.claude/skills/ak-enhance-ux-ax/scripts/check-discovery-surfaces.mjs <base-url> --site-origin <NEXT_PUBLIC_APP_URL> --sample 40` exits 0.
- [ ] New public routes are in `app/sitemap.ts`, served as `.md` twins (`lib/markdown/page-paths.ts`) and advertised with `alternates.types["text/markdown"]`.
- [ ] Each indexable page has a self-referencing canonical, `og:image` with alt text, `twitter:card=summary_large_image` and fitting JSON-LD that matches visible content.
- [ ] `llms.txt` links new public sections by their `.md` URL.
- [ ] Primary content, headings and links are in the server HTML.
