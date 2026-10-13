# Content spec v2 — award-level homepage concepts (round 2)

Round 1 (01–05) was rejected as not distinctive enough. Round 2 = 3 concepts that must create a strong first impression: creative, refined, polished, professional, unique, a little mysterious; storytelling with progressive reveal; tasteful motion (scroll- and cursor-reactive, surprising yet calm and smooth). Benchmark: Awwwards / FWA Site of the Day quality (think Lusion, Active Theory, Locomotive, Igloo Inc, Linear, Vercel Ship pages).

Facts, prices and section inventory still come from `content-spec.md` (round 1). This file adds the narrative, EN copy, and the new system requirements. Items marked (sample) are illustrative, not real records.

## 1. Narrative arc (all 3 concepts follow this order; visual metaphor differs per concept)

| Ch | Purpose | EN | VI |
|----|---------|----|----|
| 0 · Hook | First impression, 3–5 s, mystery | "Every product starts as a single point of light." / sub: "Going from 0 to 1 is the hardest part. You don't have to do it alone." | "Mọi sản phẩm đều bắt đầu từ một đốm sáng." / "Từ 0 lên 1 luôn là phần khó nhất. Bạn không phải đi một mình." |
| 1 · The dark | Empathy: building alone | "Most builders ship in the dark — no feedback, no audience, no momentum." | "Phần lớn builder làm trong bóng tối — không phản hồi, không khán giả, không đà." |
| 2 · Community | Pillar 1 | "Find your constellation." 500+ builders in a private Discord: feedback, accountability, founder network. | "Tìm chòm sao của bạn." 500+ builder trong Discord riêng tư: phản hồi, trách nhiệm, mạng lưới nhà sáng lập. |
| 3 · Courses | Pillar 2 | "Learn from what's actually shipping. One new video every week." Buy any single video, keep it forever. VIP watches everything. | "Học từ những gì đang thực sự được ra mắt. Mỗi tuần một video mới." Mua lẻ từng video, xem trọn đời. VIP xem toàn bộ. |
| 4 · Directory | Pillar 3 | "Launch where trust is earned, not bought." Hand-reviewed products, Trust Passport, organic 24h UTC leaderboard. | "Ra mắt nơi niềm tin được xây, không phải mua." Kiểm duyệt thủ công, Trust Passport, bảng xếp hạng tự nhiên 24h UTC. |
| 5 · Proof | Social proof | 500+ builders · 14+ profitable SaaS by the team · $100K+ ARR · 52 weeks of videos + 3 testimonials (sample) | same numbers, VI testimonials |
| 6 · Join | Conversion + FOMO | "Your seat is waiting. Not for long." Pricing Premium / VIP, Quarterly / Annual toggle | "Chỗ của bạn đang chờ. Không lâu nữa đâu." |
| 7 · Toolkits | Developer CTA | "Launch from your terminal." CLI + MCP snippet (real commands, see round-1 spec) | "Ra mắt từ terminal." |
| 8 · Finale | Final CTA | "Light your first star." button "Join the membership" | "Thắp đốm sáng đầu tiên." nút "Tham gia membership" |

Concepts may rename chapters/metaphors to fit their world, but keep the 9 beats and all facts.

## 2. EN copy for fixed elements
- Nav: Courses · Directory · Leaderboard · Pricing · Build with us · Sign in · Join
- Primary CTA: "Join the membership" · Secondary: "Watch this week's video"
- Trust row: "30-day 100% money-back · Secure checkout by Polar.sh · 500+ active builders"
- Course cards (sample): "Build a sales-automation agent with Claude Code" 48 min $19 Week 41 · "SEO for micro-SaaS: 0 to 10K visits/month" 36 min $15 Week 40 · "Launching on Product Hunt & Build with Us: the field checklist" 29 min $12 Week 39 · badge "Free for VIP" · button "Buy $19" · link "See all videos →"
- Directory: same 5 products as round 1, EN taglines: ClaudeKit "Premium skills & workflows for Claude Code" · GoClaw "Secure AI-agent platform for enterprises" · UI UX Pro Max "AI-powered UI/UX design system" · TOSE "Click. Deploy. Done — production in under 2 minutes" · Agentic Working "Frameworks for working with AI agents". Footer line "Hand-reviewed • No pay-to-rank • Cloudflare Edge" · CTA "Submit your product"
- Pricing: Premium "Self-paced builder" 30 seats $147/quarter (≈$49/mo) or $39/mo billed annually ($468/yr). VIP "Guided builder" 10 seats $297/quarter (≈$99/mo) or $79/mo billed annually ($948/yr); VIP adds priority channel, early access, 1 promo article, VIP template & AI-prompt vault, **all Courses free**. Note "30-day money-back guarantee · Payments by Polar.sh"
- Footer: "Building the future, one product at a time." · © 2026 Next Level Builders

## 3. Conversion & FOMO (tasteful, never sleazy)
Include at least 4 of these, clearly marked as sample data in an HTML comment:
- Seats remaining per plan ("Premium: 7 of 30 seats left", "VIP: 2 of 10") with a thin progress meter.
- Early-bird / price-increase countdown (days:hours:min:sec, computed to a fixed date e.g. 2026-10-31 23:59 GMT+7).
- Live activity toasts, low frequency (every 12–20 s, max 1 visible, dismissible, pause on hover, hidden when reduced-motion): "Minh from Hanoi joined VIP · 3 min ago", "Lan bought Week 41 video".
- "This week's video unlocks for VIP in X days" / "New video drops Monday".
- Sticky smart CTA that appears after the hook and hides at pricing/finale.
- Risk reversal near every CTA (money-back).
Primary CTA must be visible above the fold on every breakpoint, and reachable within 1 tap on mobile.

## 4. System requirements (all 3 concepts)
- **i18n EN/VI**: default EN; auto-detect `navigator.languages` → VI if any starts with `vi`; manual toggle persisted in `localStorage` (wrap in try/catch); update `<html lang>`; all visible strings from one JS dictionary (`data-i18n` keys). Vietnamese must have full diacritics; fonts must include the `vietnamese` subset.
- **Theme system / light / dark**: tri-state toggle (System · Light · Dark), default System via `prefers-color-scheme`; persisted; inline `<head>` script sets `data-theme` before paint (no flash). Both themes must be designed intentionally (not just inverted) and the WebGL/canvas visuals must adapt their palette.
- **Motion**: scroll-driven reveals (pinned chapters, masked text reveals, split-line/word animations), cursor-reactive effects (custom cursor or magnetic buttons, parallax, shader/particle response), smooth scroll. Motion must be calm: ease-out/expo curves, 400–1200 ms, no jank (60 fps target, `transform`/`opacity` only for DOM, rAF loops paused when offscreen/tab hidden, DPR capped at 2). Full `prefers-reduced-motion` fallback: content fully visible and usable with zero animation.
- **Allowed libraries (CDN, pinned exact versions)**: GSAP 3.12.5 + ScrollTrigger (cdnjs), Lenis 1.1.x (jsdelivr), three.js r160+ (jsdelivr ESM) or raw WebGL/Canvas2D, Google Fonts. No React/Vue. If WebGL is unavailable, show a designed static fallback.
- **Performance budget**: HTML file ≤ 300 KB (excluding CDN libs); LCP element is text, not canvas; canvas initialised after first paint; images lazy-loaded; total CDN JS ≤ 250 KB gz.
- **UX / AX**: semantic landmarks, skip link, visible focus, keyboard-operable toggles, AA contrast in both themes, touch targets ≥ 44 px, custom cursor disabled on touch devices. AX (agent experience): descriptive `<title>`/meta description, Open Graph tags, JSON-LD (`Organization` + `Product`/`Offer` for Premium & VIP), headings that read as a coherent outline, CTAs with explicit accessible names.
- **Responsive**: ≥1280 desktop, 768–1024 tablet, ≤430 mobile (and no horizontal scroll from 320 up). On mobile, simplify heavy effects (fewer particles, no cursor effects) but keep the signature moment.
- Single standalone HTML file, opens directly from disk (file://) — so no ES module imports that need a server unless they are absolute CDN URLs.
