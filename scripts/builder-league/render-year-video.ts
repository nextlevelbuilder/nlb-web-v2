/**
 * Year in Review video renderer: drains the Builder League render queue.
 *
 *   NLB_API_BASE=https://nextlevelbuilder.io NLB_RENDER_API_KEY=... node scripts/builder-league/render-year-video.ts
 *
 * Options: --max <n> jobs per run (default 5), --locale en|vi (default en), --work-dir <dir>,
 * --render-cmd "<command with {dir} and {out}>" to use another HTML-to-video tool, --dry-run (claim
 * nothing; render a sample composition from --sample <claim.json> into the work dir).
 *
 * Each job: claim (15-minute lease) → build intro, one card per shared scene, outro → screenshot each
 * card with headless Chrome → ffmpeg MP4 with a soft caption track → upload video and poster. Any error
 * reports the job as failed with the same lease so it retries with backoff. The claim endpoint returns
 * only the public, redacted review, so nothing private can reach the video.
 *
 * Node 24+ (runs TypeScript directly) with built-in modules only. Needs ffmpeg and Chrome/Chromium.
 * The API key is read from the environment and never printed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Locale = "en" | "vi";
type Format = "9x16" | "16x9";

interface Labels {
  kicker: string;
  titleTemplate: string;
  unknownName: string;
  outroTitle: string;
  outroBody: string;
  status: { provisional: string; final: string };
  milestones: string;
  projects: string;
  activeWeeks: string;
  scenes: Record<string, { title: string; caption: string }>;
  archetypes: Record<string, string>;
  eventTypes: Record<string, string>;
  stages: Record<string, string>;
  ranks: Record<string, string>;
}

interface Milestone { eventId: string; eventType: string; localDate: string; projectName: string | null; title: string | null }

interface Claim {
  job: { id: string; year: number; format: Format } | null;
  lease?: number;
  displayName?: string;
  review?: {
    year: number;
    status: "provisional" | "final";
    stats: { verifiedMilestones: number; projects: number; activeWeeks: number };
    milestones: Milestone[];
    badges: { badgeKey: string }[];
    ranks: { rank: string }[];
    nextYearNote: string | null;
    scenes: { key: string; eventIds: string[] }[];
    archetype: { key: string } | null;
  };
  labels?: Record<Locale, Labels>;
  site?: string;
}

interface Card { numeral: string; kicker: string; title: string; body: string; facts: string[] }

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(join(HERE, "render-template", "scene.html"), "utf8");
const SIZES: Record<Format, { width: number; height: number }> = { "9x16": { width: 1080, height: 1920 }, "16x9": { width: 1920, height: 1080 } };
const FADE_S = 0.4;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function romanNumeral(n: number): string {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, glyph] of table) while (n >= value) { out += glyph; n -= value; }
  return out;
}

/** Deterministic star field per job, so a retried render produces the same frames. */
function stars(seed: string): string {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const next = () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967296;
  return Array.from({ length: 90 }, () => {
    const opacity = (0.15 + next() * 0.6).toFixed(2);
    return `<circle cx="${(next() * 100).toFixed(2)}" cy="${(next() * 100).toFixed(2)}" r="${(0.06 + next() * 0.14).toFixed(2)}" fill="#ece6d6" opacity="${opacity}"/>`;
  }).join("");
}

/** Intro, one card per shared scene, outro. Only public review fields are used. */
export function buildCards(claim: Claim, locale: Locale): Card[] {
  const review = claim.review!;
  const labels = claim.labels![locale];
  const byId = new Map(review.milestones.map((m) => [m.eventId, m]));
  const milestoneLine = (m: Milestone) => [m.localDate, m.title ?? labels.eventTypes[m.eventType] ?? m.eventType, m.projectName].filter(Boolean).join(" · ");
  const statFacts = [
    `${review.stats.verifiedMilestones} · ${labels.milestones}`,
    `${review.stats.projects} · ${labels.projects}`,
    `${review.stats.activeWeeks} · ${labels.activeWeeks}`,
  ];
  const name = claim.displayName?.trim() || labels.unknownName;
  const intro: Card = {
    numeral: String(review.year),
    kicker: labels.kicker,
    title: labels.titleTemplate.replace("{name}", name).replace("{year}", String(review.year)),
    body: review.archetype ? labels.archetypes[review.archetype.key] ?? "" : "",
    facts: statFacts,
  };
  const scenes = review.scenes.map((scene, index): Card => {
    const copy = labels.scenes[scene.key] ?? { title: scene.key, caption: "" };
    const card: Card = { numeral: romanNumeral(index + 1), kicker: labels.kicker, title: copy.title, body: copy.caption, facts: [] };
    if (scene.key === "year_in_numbers") card.facts = statFacts;
    else if (scene.key === "league_highlights") card.facts = [...review.ranks.map((r) => labels.ranks[r.rank] ?? r.rank), ...review.badges.map((b) => b.badgeKey)];
    else if (scene.key === "next_year" && review.nextYearNote) card.body = `“${review.nextYearNote}”`;
    if (card.facts.length === 0) card.facts = scene.eventIds.map((id) => byId.get(id)).filter((m): m is Milestone => Boolean(m)).map(milestoneLine);
    card.facts = card.facts.slice(0, 4);
    return card;
  });
  const host = claim.site ? new URL(claim.site).host : "";
  const outro: Card = { numeral: "✦", kicker: labels.kicker, title: labels.outroTitle, body: labels.outroBody, facts: host ? [host] : [] };
  return [intro, ...scenes, outro];
}

/** Seconds per card: 30 to 60 seconds in total. */
export function cardDuration(count: number): number {
  return Math.min(10, Math.max(4.5, 45 / count));
}

function fillTemplate(card: Card, size: { width: number; height: number }, locale: Locale, footer: { left: string; right: string }, seed: string): string {
  const values: Record<string, string> = {
    LANG: locale,
    WIDTH: String(size.width),
    HEIGHT: String(size.height),
    NUMERAL: escapeHtml(card.numeral),
    KICKER: escapeHtml(card.kicker),
    TITLE: escapeHtml(card.title),
    BODY: escapeHtml(card.body),
    FACTS: card.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join(""),
    FOOTER_LEFT: escapeHtml(footer.left),
    FOOTER_RIGHT: escapeHtml(footer.right),
    STARS: stars(seed),
  };
  return TEMPLATE.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => values[key] ?? "");
}

const srtTime = (s: number) => {
  const ms = Math.round(s * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

/** Writes scene files, captions and the HyperFrames-style composition into `dir`. */
export function writeComposition(dir: string, claim: Claim, locale: Locale): { scenes: string[]; duration: number; size: { width: number; height: number } } {
  const job = claim.job!;
  const size = SIZES[job.format];
  const cards = buildCards(claim, locale);
  const duration = cardDuration(cards.length);
  const labels = claim.labels![locale];
  const footer = { left: `${labels.status[claim.review!.status]} · ${job.year}`, right: claim.site ? new URL(claim.site).host : "" };
  const scenes = cards.map((card, index) => {
    const file = join(dir, `scene-${String(index).padStart(2, "0")}.html`);
    writeFileSync(file, fillTemplate(card, size, locale, footer, job.id));
    return file;
  });
  writeFileSync(
    join(dir, "captions.srt"),
    cards.map((card, i) => `${i + 1}\n${srtTime(i * duration)} --> ${srtTime((i + 1) * duration)}\n${[card.title, card.body].filter(Boolean).join(" — ")}\n`).join("\n")
  );
  const clips = scenes
    .map((file, i) => `<section class="clip" data-start="${(i * duration).toFixed(2)}" data-duration="${duration.toFixed(2)}"><iframe src="${file.split(/[\\/]/).pop()}" width="${size.width}" height="${size.height}"></iframe></section>`)
    .join("\n");
  writeFileSync(
    join(dir, "composition.html"),
    `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>Year in Review ${job.year}</title><style>body{margin:0;background:#070b16}.clip{position:absolute;inset:0}iframe{border:0}</style></head><body data-width="${size.width}" data-height="${size.height}" data-duration="${(duration * cards.length).toFixed(2)}">\n${clips}\n</body></html>\n`
  );
  return { scenes, duration, size };
}

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("Chrome or Chromium not found; set CHROME_PATH.");
}

function run(command: string, args: string[], options: { shell?: boolean } = {}): void {
  const result = spawnSync(command, args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", shell: options.shell ?? false });
  if (result.status !== 0) throw new Error(`${command.split(/[\\/ ]/).pop()} failed: ${(result.stderr || String(result.error ?? "")).slice(-600)}`);
}

function screenshot(chrome: string, html: string, png: string, size: { width: number; height: number }): void {
  run(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-sandbox", "--force-device-scale-factor=1",
    `--window-size=${size.width},${size.height}`, `--screenshot=${png}`, pathToFileURL(html).href,
  ]);
}

/** Renders the MP4 and poster; returns their paths. */
export function renderVideo(dir: string, claim: Claim, locale: Locale, renderCmd?: string): { video: string; poster: string } {
  const { scenes, duration, size } = writeComposition(dir, claim, locale);
  const chrome = findChrome();
  const pngs = scenes.map((html) => {
    const png = html.replace(/\.html$/, ".png");
    screenshot(chrome, html, png, size);
    return png;
  });
  const poster = join(dir, "poster.png");
  writeFileSync(poster, readFileSync(pngs[0]));
  const video = join(dir, "year-review.mp4");
  if (renderCmd) {
    run(renderCmd.replaceAll("{dir}", dir).replaceAll("{out}", video), [], { shell: true });
  } else {
    const inputs = pngs.flatMap((png) => ["-loop", "1", "-t", duration.toFixed(2), "-i", png]);
    const fadeOut = (duration - FADE_S).toFixed(2);
    const chains = pngs.map((_, i) => `[${i}:v]scale=${size.width}:${size.height},format=yuv420p,fade=t=in:st=0:d=${FADE_S},fade=t=out:st=${fadeOut}:d=${FADE_S}[v${i}]`);
    const filter = `${chains.join(";")};${pngs.map((_, i) => `[v${i}]`).join("")}concat=n=${pngs.length}:v=1:a=0[v]`;
    run("ffmpeg", [
      "-y", "-loglevel", "error", ...inputs, "-i", join(dir, "captions.srt"),
      "-filter_complex", filter, "-map", "[v]", "-map", `${pngs.length}:s`,
      "-c:v", "libx264", "-r", "30", "-pix_fmt", "yuv420p", "-c:s", "mov_text", "-metadata:s:s:0", `language=${locale === "vi" ? "vie" : "eng"}`,
      "-movflags", "+faststart", video,
    ]);
  }
  if (!existsSync(video)) throw new Error("renderer produced no video");
  return { video, poster };
}

async function api<T>(base: string, key: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(new URL(path, base), { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${key}` } });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { code: string; message: string } } | null;
  if (!response.ok || !body?.data) throw new Error(`${path} → ${response.status} ${body?.error?.code ?? ""}`.trim());
  return body.data;
}

async function processOne(base: string, key: string, locale: Locale, workRoot: string, renderCmd?: string): Promise<boolean> {
  const claim = await api<Claim>(base, key, "/api/v1/builder-admin/render-jobs/claim", { method: "POST" });
  if (!claim.job || claim.lease === undefined) return false;
  const { job, lease } = claim;
  const dir = mkdtempSync(join(workRoot, `job-${job.id.slice(0, 8)}-`));
  try {
    const { video, poster } = renderVideo(dir, claim, locale, renderCmd);
    const form = new FormData();
    form.set("lease", String(lease));
    form.set("video", new Blob([readFileSync(video)], { type: "video/mp4" }), "year-review.mp4");
    form.set("poster", new Blob([readFileSync(poster)], { type: "image/png" }), "poster.png");
    await api(base, key, `/api/v1/builder-admin/render-jobs/${job.id}/complete`, { method: "POST", body: form });
    console.log(`rendered ${job.id} (${job.year}, ${job.format})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`render ${job.id} failed: ${message}`);
    await api(base, key, `/api/v1/builder-admin/render-jobs/${job.id}/fail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lease, error: message.slice(0, 2000) }),
    }).catch((failError) => console.error(`could not report failure: ${failError instanceof Error ? failError.message : failError}`));
  } finally {
    if (!process.argv.includes("--keep")) rmSync(dir, { recursive: true, force: true });
  }
  return true;
}

async function main(): Promise<void> {
  const locale: Locale = arg("locale") === "vi" ? "vi" : "en";
  const workRoot = resolve(arg("work-dir") ?? join(tmpdir(), "nlb-render"));
  mkdirSync(workRoot, { recursive: true });
  const renderCmd = arg("render-cmd");

  if (process.argv.includes("--dry-run")) {
    const sample = arg("sample");
    if (!sample) throw new Error("--dry-run needs --sample <claim.json> (a saved claim response `data`).");
    const claim = JSON.parse(readFileSync(sample, "utf8")) as Claim;
    const dir = mkdtempSync(join(workRoot, "dry-run-"));
    const out = process.argv.includes("--render") ? renderVideo(dir, claim, locale, renderCmd) : writeComposition(dir, claim, locale);
    console.log(`wrote ${dir}`, "video" in out ? "(with video)" : "");
    return;
  }

  const base = process.env.NLB_API_BASE;
  const key = process.env.NLB_RENDER_API_KEY;
  if (!base || !key) throw new Error("Set NLB_API_BASE and NLB_RENDER_API_KEY.");
  const max = Math.max(1, Number(arg("max") ?? 5) || 5);
  let done = 0;
  while (done < max && (await processOne(base, key, locale, workRoot, renderCmd))) done += 1;
  console.log(done === 0 ? "queue empty" : `processed ${done} job(s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
