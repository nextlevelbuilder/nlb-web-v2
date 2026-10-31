import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { resolveConfig } from "../config.js";
import {
  CoursesApiError,
  NlbCoursesClient,
  dateFromRecordingName,
  nextWeekNumber,
  slugifyTitle,
  tusUpload,
  type CourseVideo,
  type CourseVideoInput,
  type StreamUploadStatus
} from "../api/courses-client.js";
import { sanitizeTerminalText as safe } from "../preview/ascii.js";

export interface CourseCommandDeps {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface BaseOptions {
  apiKey?: string;
  url?: string;
  json?: boolean;
}

interface WaitOptions {
  pollSeconds?: string;
  timeoutMinutes?: string;
}

export interface PublishRecordingOptions extends BaseOptions, WaitOptions {
  title: string;
  speaker: string;
  description?: string;
  descriptionFile?: string;
  week?: string;
  date?: string;
  slug?: string;
  price?: string;
  currency?: string;
  locale?: string;
  streamUid?: string;
  dryRun?: boolean;
}

const WEEKLY_PRICE_CENTS = 900;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function clientFor(opts: BaseOptions, deps: CourseCommandDeps) {
  const config = resolveConfig({ apiKey: opts.apiKey, url: opts.url });
  return { config, client: new NlbCoursesClient({ baseUrl: config.apiUrl, apiKey: config.apiKey, fetchFn: deps.fetchFn }) };
}

function log(opts: BaseOptions, message: string) {
  // Progress goes to stderr under --json so stdout stays one parseable document.
  if (opts.json) console.error(message);
  else console.log(message);
}

function parseIntOption(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a non-negative integer`);
  return n;
}

async function run(opts: BaseOptions, body: () => Promise<unknown>): Promise<void> {
  try {
    const result = await body();
    if (opts.json && result !== undefined) console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      const payload: Record<string, unknown> = { success: false, error: message };
      if (err instanceof CoursesApiError) {
        payload.status = err.status;
        if (err.code) payload.code = err.code;
      }
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error(pc.red(`✖ ${safe(message)}`));
    }
    process.exitCode = 1;
  }
}

function progressPrinter(opts: BaseOptions) {
  let lastPct = -1;
  return (uploaded: number, total: number) => {
    const pct = Math.floor((uploaded / total) * 100);
    if (pct === lastPct) return;
    lastPct = pct;
    log(opts, `  uploaded ${pct}% (${Math.round(uploaded / 1048576)} / ${Math.round(total / 1048576)} MiB)`);
  };
}

/** Polls Stream until the video is ready to stream; throws on a processing error or timeout. */
async function waitUntilReady(client: NlbCoursesClient, uid: string, opts: BaseOptions & WaitOptions, deps: CourseCommandDeps): Promise<StreamUploadStatus> {
  const pollMs = parseIntOption(opts.pollSeconds, "poll-seconds", 30) * 1000;
  const deadline = Date.now() + parseIntOption(opts.timeoutMinutes, "timeout-minutes", 180) * 60000;
  const sleep = deps.sleep ?? defaultSleep;
  let lastState = "";
  for (;;) {
    const status = await client.getUpload(uid);
    if (status.state === "error") throw new Error(`Stream could not process ${uid}: ${status.errorReason ?? "unknown error"}`);
    if (status.state === "ready" && status.readyToStream) return status;
    const line = `  stream ${status.state}${status.pctComplete !== null ? ` ${Math.round(status.pctComplete)}%` : ""}`;
    if (line !== lastState) log(opts, line);
    lastState = line;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${uid} (last state: ${status.state}); rerun with --stream-uid ${uid} to continue.`);
    await sleep(pollMs);
  }
}

function renderVideo(video: CourseVideo, baseUrl: string): string {
  const week = video.weekNumber !== null ? `#${video.weekNumber} ` : "";
  const price = `${(video.priceCents / 100).toFixed(2)} ${video.currency.toUpperCase()}`;
  return `  ${week}${safe(video.title)}\n    ${baseUrl}/courses/${safe(video.slug)} · ${Math.round(video.durationSec / 60)} min · ${price}`;
}

/** The whole weekly flow: upload signed-only, wait for Stream, register the draft, publish (creates the Polar product). */
export async function publishRecordingCommand(file: string, opts: PublishRecordingOptions, deps: CourseCommandDeps = {}): Promise<void> {
  await run(opts, async () => {
    const { config, client } = clientFor(opts, deps);
    const sizeBytes = statSync(file).size;
    const published = await client.listVideos();
    const week = opts.week !== undefined ? parseIntOption(opts.week, "week", 0) : nextWeekNumber(published);
    const date = opts.date ?? dateFromRecordingName(file);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Pass --date YYYY-MM-DD (or name the file record-YYMMDD.mp4)");
    const topic = opts.title.trim().replace(/^NLB Weekly #\d+:\s*/i, "");
    const title = `NLB Weekly #${week}: ${topic}`;
    const slug = opts.slug ?? slugifyTitle(title);
    const summary = (opts.descriptionFile ? readFileSync(opts.descriptionFile, "utf8") : opts.description ?? "").trim();
    if (!summary) throw new Error("Pass --description or --description-file with the session summary");
    const input: CourseVideoInput = {
      slug,
      title,
      description: `${summary}\n\nDiễn giả: ${opts.speaker.trim()} · ${date}`,
      locale: (opts.locale ?? "vi") as "en" | "vi",
      weekNumber: week,
      priceCents: parseIntOption(opts.price, "price", WEEKLY_PRICE_CENTS),
      currency: opts.currency ?? "usd",
      thumbnailUrl: null
    };
    const streamName = `${week} - ${date} - ${opts.speaker.trim()} - ${topic}`.slice(0, 200);

    const existing = published.find((v) => v.slug === slug);
    if (existing) {
      log(opts, pc.yellow(`Already published: ${config.apiUrl}/courses/${slug}`));
      return { success: true, alreadyPublished: true, video: existing };
    }
    if (opts.dryRun) {
      log(opts, pc.cyan(`Dry run: would upload ${basename(file)} (${Math.round(sizeBytes / 1048576)} MiB) as "${streamName}" and publish:`));
      log(opts, `  ${title}\n  ${config.apiUrl}/courses/${slug} · ${(input.priceCents / 100).toFixed(2)} ${input.currency!.toUpperCase()}`);
      return { success: true, dryRun: true, streamName, video: input };
    }

    let streamUid = opts.streamUid;
    if (!streamUid) {
      const upload = await client.createUpload({ name: streamName, sizeBytes });
      streamUid = upload.streamUid;
      log(opts, pc.cyan(`Uploading ${basename(file)} to Stream ${streamUid} (rerun with --stream-uid ${streamUid} if interrupted)`));
      await tusUpload(file, upload.uploadUrl, { fetchFn: deps.fetchFn, onProgress: progressPrinter(opts) });
    }
    const status = await waitUntilReady(client, streamUid, opts, deps);
    if (!status.requireSignedUrls) throw new Error(`Stream ${streamUid} is not signed-only; fix it before publishing.`);

    const body = { ...input, streamUid, durationSec: status.durationSec };
    try {
      await client.createVideo(body);
    } catch (err) {
      // A previous run left the draft behind: refresh it instead.
      if (!(err instanceof CoursesApiError && err.code === "slug_taken")) throw err;
      const { slug: _slug, ...changes } = body;
      await client.updateVideo(slug, changes);
    }
    const video = await client.publishVideo(slug);
    log(opts, pc.green(`✔ Published ${title}\n  ${config.apiUrl}/courses/${slug} · ${(video.priceCents / 100).toFixed(2)} ${video.currency.toUpperCase()}`));
    return { success: true, streamUid, video };
  });
}

export function registerCourseCommands(program: Command, deps: CourseCommandDeps = {}): Command {
  const courses = program.command("courses").description("Course videos: list, upload signed-only to Stream, register and publish (admin)");
  const withAuth = (cmd: Command) =>
    cmd
      .option("-k, --api-key <key>", "Admin API key (or NLB_API_KEY)")
      .option("-u, --url <url>", "Directory API base URL")
      .option("--json", "Output the result (or error) as JSON");
  const withWait = (cmd: Command) =>
    cmd
      .option("--poll-seconds <n>", "Seconds between Stream status checks (default 30)")
      .option("--timeout-minutes <n>", "Give up waiting for Stream after this long (default 180)");

  withAuth(courses.command("list").description("List published course videos")).action(async (opts: BaseOptions) => {
    await run(opts, async () => {
      const { config, client } = clientFor(opts, deps);
      const videos = await client.listVideos();
      if (opts.json) return videos;
      console.log(pc.cyan(`\n${videos.length} published videos (next week: #${nextWeekNumber(videos)})`));
      for (const v of videos) console.log(renderVideo(v, config.apiUrl));
      console.log("");
    });
  });

  withWait(withAuth(
    courses
      .command("upload")
      .description("Reserve a signed-only Stream upload, send the file and wait until it is ready")
      .argument("<file>", "Video file")
      .requiredOption("-n, --name <name>", "Stream name, e.g. \"44 - 2026-11-07 - Speaker - Topic\"")
      .option("--no-wait", "Return after the upload without waiting for processing")
  )).action(async (file: string, opts: BaseOptions & WaitOptions & { name: string; wait: boolean }) => {
    await run(opts, async () => {
      const { client } = clientFor(opts, deps);
      const upload = await client.createUpload({ name: opts.name, sizeBytes: statSync(file).size });
      log(opts, pc.cyan(`Uploading to Stream ${upload.streamUid}`));
      await tusUpload(file, upload.uploadUrl, { fetchFn: deps.fetchFn, onProgress: progressPrinter(opts) });
      const status = opts.wait ? await waitUntilReady(client, upload.streamUid, opts, deps) : await client.getUpload(upload.streamUid);
      if (!opts.json) console.log(pc.green(`✔ ${upload.streamUid} ${status.state} · ${status.durationSec}s`));
      return status;
    });
  });

  courses
    .command("put")
    .description("Send a file to a tus upload URL from `course_create_upload` (no credentials needed)")
    .argument("<file>", "Video file")
    .argument("<uploadUrl>", "One-time upload URL")
    .option("--json", "Output the result as JSON")
    .action(async (file: string, uploadUrl: string, opts: BaseOptions) => {
      await run(opts, async () => {
        if (!/^https:\/\//.test(uploadUrl)) throw new Error("The upload URL must be https");
        await tusUpload(file, uploadUrl, { fetchFn: deps.fetchFn, onProgress: progressPrinter(opts) });
        if (!opts.json) console.log(pc.green("✔ Upload complete"));
        return { success: true };
      });
    });

  withAuth(courses.command("status").description("Show the Stream processing status of an upload").argument("<streamUid>", "Stream video uid")).action(
    async (uid: string, opts: BaseOptions) => {
      await run(opts, async () => {
        const status = await clientFor(opts, deps).client.getUpload(uid);
        if (!opts.json) console.log(`  ${status.streamUid} ${status.state}${status.pctComplete !== null ? ` ${status.pctComplete}%` : ""} · ${status.durationSec}s · signed-only: ${status.requireSignedUrls}`);
        return status;
      });
    }
  );

  withAuth(courses.command("create").description("Register a draft video from a JSON file (slug, title, priceCents, streamUid, …)").argument("<file>", "Video JSON")).action(
    async (file: string, opts: BaseOptions) => {
      await run(opts, async () => {
        const video = await clientFor(opts, deps).client.createVideo(JSON.parse(readFileSync(file, "utf8")) as CourseVideoInput);
        if (!opts.json) console.log(pc.green(`✔ Draft ${safe(video.slug)} created`));
        return video;
      });
    }
  );

  withAuth(courses.command("publish").description("Publish a draft video (creates its Polar product)").argument("<slug>", "Video slug")).action(
    async (slug: string, opts: BaseOptions) => {
      await run(opts, async () => {
        const { config, client } = clientFor(opts, deps);
        const video = await client.publishVideo(slug);
        if (!opts.json) console.log(pc.green(`✔ Published\n${renderVideo(video, config.apiUrl)}`));
        return video;
      });
    }
  );

  withWait(withAuth(
    courses
      .command("publish-recording")
      .description("Upload an NLB Weekly recording and publish it: week number, title, slug and description follow the house conventions")
      .argument("<file>", "Recording, ideally named record-YYMMDD.mp4")
      .requiredOption("-t, --title <topic>", "Topic; becomes \"NLB Weekly #<week>: <topic>\"")
      .requiredOption("-s, --speaker <name>", "Speaker name, with diacritics")
      .option("-d, --description <text>", "Session summary (2–3 sentences)")
      .option("--description-file <file>", "Read the summary from a file")
      .option("-w, --week <n>", "Week number (default: highest published + 1)")
      .option("--date <YYYY-MM-DD>", "Session date (default: from record-YYMMDD)")
      .option("--slug <slug>", "Override the slug derived from the title")
      .option("--price <cents>", `Price in minor units (default ${WEEKLY_PRICE_CENTS})`)
      .option("--currency <code>", "Currency (default usd)")
      .option("--locale <locale>", "en or vi (default vi)")
      .option("--stream-uid <uid>", "Reuse an existing upload instead of uploading again")
      .option("--dry-run", "Show what would be published without uploading or writing")
  )).action(async (file: string, opts: PublishRecordingOptions) => {
    await publishRecordingCommand(file, opts, deps);
  });

  return courses;
}
