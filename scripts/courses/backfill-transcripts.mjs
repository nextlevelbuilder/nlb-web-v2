#!/usr/bin/env node
// Builds a verbatim transcript for every published course video and (with --upload) stores it on the site.
//
//   node scripts/courses/backfill-transcripts.mjs [--weeks 1-40] [--parallel 4] [--concurrency 4] [--upload] [--force]
//
// --parallel: videos processed at once; --concurrency: Gemini calls per video.
//
// For each video: mints a short-lived signed Stream token, reads the audio-only HLS rendition with ffmpeg
// (nothing on Stream changes), splits it into 10-minute chunks, transcribes each chunk with multix/Gemini and
// merges them into one markdown transcript with absolute [hh:mm:ss] marks. Work lands in
// .recordings/<slug>/ (git-ignored) and is reused on reruns, so an interrupted run continues where it stopped.
//
// Env: CLOUDFLARE_API_TOKEN (Stream read), NLB_API_KEY (admin, only for --upload), NLB_API_URL (default
// https://nextlevelbuilder.io), CF_ACCOUNT_ID (default: the hi@ account). Secrets are never printed.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const apiUrl = (process.env.NLB_API_URL || "https://nextlevelbuilder.io").replace(/\/+$/, "");
const account = process.env.CF_ACCOUNT_ID || "7ac87c90789159ae1b10b7d78f5dcc08";
const cfToken = process.env.CLOUDFLARE_API_TOKEN;
const parallel = Number(option("parallel", "4"));
const concurrency = Number(option("concurrency", "4"));
const [weekFrom, weekTo] = option("weeks", "0-100000").split("-").map(Number);
const CHUNK_SECONDS = 600;
const PROMPT =
  "Transcribe this Vietnamese audio verbatim, in Vietnamese with full diacritics. Keep product, tool and person names exactly as spoken. " +
  "Start every paragraph with its [mm:ss] offset from the start of this audio. Do not summarise, translate or add headings.";

if (!cfToken) throw new Error("CLOUDFLARE_API_TOKEN is required");
if (flag("upload") && !process.env.NLB_API_KEY) throw new Error("--upload needs an admin NLB_API_KEY");

const cf = async (path, init = {}) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/stream${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json", ...init.headers }
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Stream ${path}: HTTP ${res.status}`);
  return body.result;
};

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: ["ignore", "ignore", "pipe"], shell: process.platform === "win32" && cmd === "multix" });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`))));
  });
}

const pad = (n) => String(n).padStart(2, "0");
const stamp = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;

/** Audio-only HLS playlist URL behind a signed token (valid long enough for ffmpeg to read every segment). */
async function audioPlaylist(uid) {
  const video = await cf(`/${uid}`);
  const host = new URL(video.playback.hls).host;
  const { token } = await cf(`/${uid}/token`, { method: "POST", body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 4 * 3600 }) });
  const master = `https://${host}/${token}/manifest/video.m3u8`;
  const text = await (await fetch(master)).text();
  const audio = /#EXT-X-MEDIA:[^\n]*TYPE=AUDIO[^\n]*URI="([^"]+)"/.exec(text)?.[1];
  return audio ? new URL(audio, master).href : master;
}

async function transcribeChunk(part) {
  const md = part.replace(/\.mp3$/, ".md");
  if (existsSync(md) && readFileSync(md, "utf8").includes("Status: success")) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await run("multix", ["gemini", "analyze", "--files", part, "--prompt", JSON.stringify(PROMPT), "--output", md]);
      if (readFileSync(md, "utf8").includes("Status: success")) return;
    } catch (err) {
      if (attempt === 3) throw err;
    }
  }
  throw new Error(`transcription failed for ${part}`);
}

/** Joins chunk transcripts, turning each chunk's [mm:ss] into an absolute [hh:mm:ss]. */
function merge(dir, video) {
  const parts = readdirSync(dir).filter((f) => /^part-\d+\.md$/.test(f)).sort();
  const sections = parts.map((file) => {
    const base = Number(/part-(\d+)/.exec(file)[1]) * CHUNK_SECONDS;
    const raw = readFileSync(join(dir, file), "utf8").split(/^Result:\s*$/m).pop().trim();
    return raw.replace(/\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g, (_m, h, m, s) => `[${stamp(base + Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s))}]`);
  });
  return `# ${video.title}\n\n${sections.join("\n\n")}\n`;
}

async function pool(items, size, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

const videos = (await (await fetch(`${apiUrl}/api/courses/videos`)).json()).data
  .filter((v) => v.weekNumber !== null && v.weekNumber >= weekFrom && v.weekNumber <= weekTo)
  .filter((v) => flag("force") || !v.hasTranscript)
  .sort((a, b) => a.weekNumber - b.weekNumber);
const streamVideos = await cf("?limit=1000");

await pool(videos, parallel, async (video) => {
  const dir = join(".recordings", video.slug);
  const out = join(dir, "transcript.md");
  try {
    mkdirSync(dir, { recursive: true });
    if (!existsSync(out)) {
      // Stream names start with the week number ("41 - 2026-10-17 - …"); the duration confirms the match.
      const match = streamVideos.find((s) => parseInt(s.meta?.name, 10) === video.weekNumber && Math.abs(Math.round(s.duration) - video.durationSec) <= 2);
      if (!match) throw new Error("no matching Stream video");
      // audio.done marks a complete download; a partial one (interrupted run) is redone from scratch.
      if (!existsSync(join(dir, "audio.done"))) {
        for (const f of readdirSync(dir).filter((name) => name.endsWith(".mp3"))) rmSync(join(dir, f));
        await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-http_persistent", "1", "-http_multiple", "1", "-i", await audioPlaylist(match.uid),
          "-vn", "-ac", "1", "-ar", "16000", "-b:a", "24k", "-f", "segment", "-segment_time", String(CHUNK_SECONDS), "-reset_timestamps", "1", join(dir, "part-%02d.mp3")]);
        writeFileSync(join(dir, "audio.done"), "");
      }
      const parts = readdirSync(dir).filter((f) => f.endsWith(".mp3")).map((f) => join(dir, f));
      await pool(parts, concurrency, transcribeChunk);
      writeFileSync(out, merge(dir, video));
    }
    let uploaded = "";
    if (flag("upload")) {
      const res = await fetch(`${apiUrl}/api/courses/videos/${video.slug}/transcript`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${process.env.NLB_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: readFileSync(out, "utf8"), source: "gemini" })
      });
      uploaded = ` upload ${res.status}`;
      if (!res.ok) process.exitCode = 1;
    }
    console.log(`#${video.weekNumber} ${video.slug} ${Math.round(readFileSync(out, "utf8").length / 1024)} KiB${uploaded}`);
  } catch (err) {
    process.exitCode = 1;
    console.error(`#${video.weekNumber} ${video.slug} FAILED: ${err instanceof Error ? err.message : err}`);
  }
});
