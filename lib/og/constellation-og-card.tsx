/**
 * Constellation social card (1200x630) shared by every `opengraph-image` route.
 *
 * It reproduces the night "observatory" theme of the site: deep-space ground, a scatter of stars,
 * the orbit-and-star brand mark, a mono chapter kicker in gold, a Cormorant title and a mono meta
 * line. Satori renders a subset of CSS, so every element with several children is `display: flex`.
 */
import { ImageResponse } from "next/og";
import { loadOgFonts, type OgFontRequest } from "./og-google-fonts";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

/** Dark-theme tokens from app/constellation-shell.css. */
const INK = "#ece6d6";
const INK_2 = "#bdb7aa";
const INK_3 = "#8d8a9f";
const ACCENT = "#e9c47e";
const STAR = "#fff6e4";
const BG = "#06070d";
const LINE = "rgba(236, 230, 214, .14)";

const STAR_PATH = "M16 2.5l1.9 11.6L29.5 16l-11.6 1.9L16 29.5l-1.9-11.6L2.5 16l11.6-1.9z";

const FONTS: OgFontRequest[] = [
  { name: "Cormorant", family: "Cormorant Garamond", weight: 500, style: "normal" },
  { name: "Cormorant", family: "Cormorant Garamond", weight: 400, style: "italic" },
  { name: "BeVietnam", family: "Be Vietnam Pro", weight: 400, style: "normal" },
  { name: "Mono", family: "JetBrains Mono", weight: 500, style: "normal" },
];

export interface ConstellationOgCardInput {
  /** Chapter numeral, e.g. "III". */
  numeral: string;
  /** Section kicker shown in mono caps after the numeral, e.g. "Courses". */
  kicker: string;
  title: string;
  subtitle?: string | null;
  /** Mono footer facts, e.g. ["Duy Nguyen", "6 min read"]. */
  meta?: string[];
}

/** Trims to a whole word within `max` characters and adds an ellipsis. Exported for tests. */
export function clampText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** Display size that keeps long titles to about three lines. Exported for tests. */
export function titleFontSize(title: string): number {
  if (title.length > 90) return 54;
  if (title.length > 60) return 64;
  if (title.length > 32) return 76;
  return 92;
}

/** Deterministic star field seeded by the title, so each card has its own sky but renders identically. */
export function starField(seed: string, count = 46): Array<{ x: number; y: number; r: number; o: number }> {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: Math.round(next() * OG_SIZE.width),
    y: Math.round(next() * OG_SIZE.height),
    r: next() < 0.12 ? 2 : 1,
    o: Math.round((0.25 + next() * 0.6) * 100) / 100,
  }));
}

export async function renderConstellationOgCard(input: ConstellationOgCardInput): Promise<ImageResponse> {
  const title = clampText(input.title, 120);
  const subtitle = input.subtitle ? clampText(input.subtitle, 150) : null;
  const meta = (input.meta ?? []).filter(Boolean).map((item) => clampText(item, 40)).slice(0, 4);
  const kicker = `${input.numeral} · ${input.kicker}`.toUpperCase();
  const footer = ["NEXTLEVELBUILDER.IO", ...meta.map((item) => item.toUpperCase())].join("  ·  ");
  const fonts = await loadOgFonts(FONTS, `Next Level Builders ${kicker} ${title} ${subtitle ?? ""} ${footer}`);
  const stars = starField(input.title);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          position: "relative", padding: "64px 72px", color: INK, fontFamily: "BeVietnam",
          backgroundColor: BG,
          backgroundImage: "radial-gradient(ellipse at 78% 18%, rgba(70, 48, 120, .34), transparent 58%), radial-gradient(ellipse at 10% 92%, rgba(20, 70, 90, .26), transparent 55%)",
        }}
      >
        {stars.map((star, index) => (
          <div
            key={index}
            style={{ position: "absolute", left: star.x, top: star.y, width: star.r * 2, height: star.r * 2, borderRadius: 9999, backgroundColor: STAR, opacity: star.o }}
          />
        ))}

        {/* Orbit motif: two rings around a gold star on the right, echoing the home sky. */}
        <div style={{ position: "absolute", right: -150, top: 40, width: 560, height: 560, borderRadius: 9999, border: `1px solid ${LINE}`, display: "flex" }} />
        <div style={{ position: "absolute", right: 0, top: 190, width: 260, height: 260, borderRadius: 9999, border: "1px solid rgba(233, 196, 126, .28)", display: "flex" }} />
        <svg width="132" height="132" viewBox="0 0 32 32" style={{ position: "absolute", right: 64, top: 254 }}>
          <path d={STAR_PATH} fill={ACCENT} />
        </svg>
        <div style={{ position: "absolute", right: 252, top: 182, width: 8, height: 8, borderRadius: 9999, backgroundColor: ACCENT, display: "flex" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="14.5" fill="none" stroke={INK} strokeOpacity="0.45" strokeWidth="0.9" />
            <path d={STAR_PATH} fill={ACCENT} />
          </svg>
          <div style={{ display: "flex", fontFamily: "Cormorant", fontSize: 34, fontWeight: 500, letterSpacing: -0.3 }}>
            <span>Next Level&nbsp;</span>
            <span style={{ fontStyle: "italic", fontWeight: 400, color: INK_2 }}>Builders</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 820 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: "Mono", fontSize: 22, letterSpacing: 4, color: ACCENT }}>
            <div style={{ width: 44, height: 1, backgroundColor: ACCENT, display: "flex" }} />
            <span>{kicker}</span>
          </div>
          <div style={{ display: "flex", marginTop: 26, fontFamily: "Cormorant", fontWeight: 500, fontSize: titleFontSize(title), lineHeight: 1.06, letterSpacing: -1 }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ display: "flex", marginTop: 26, fontSize: 26, lineHeight: 1.45, color: INK_2, maxWidth: 760 }}>
              {subtitle}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, paddingTop: 22, borderTop: `1px solid ${LINE}`, fontFamily: "Mono", fontSize: 18, letterSpacing: 3, color: INK_3 }}>
          <span>{footer}</span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
    },
  );
}
