import { Command, InvalidArgumentError } from "commander";
import pc from "picocolors";
import type { BuilderEnvelope } from "@nextlevelbuilder/contracts";
import { resolveConfig } from "../config.js";
import { BuilderApiError, BuilderInputError, NlbBuilderClient } from "../api/builder-client.js";
import { sanitizeTerminalText as safe } from "../preview/ascii.js";
import { readJsonInput } from "./blog.js";

export interface BuilderCommonOptions {
  apiKey?: string;
  cookie?: string;
  url?: string;
  json?: boolean;
}

/** Injection points for tests and embedding; defaults are the real process streams and global fetch. */
export interface BuilderCommandDeps {
  stdin?: NodeJS.ReadableStream;
  fetchFn?: typeof fetch;
}

function parseInteger(value: string): number {
  if (!/^\d+$/.test(value.trim())) throw new InvalidArgumentError("must be a non-negative integer");
  return Number(value);
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function createClient(opts: BuilderCommonOptions, deps: BuilderCommandDeps): NlbBuilderClient {
  const config = resolveConfig({ apiKey: opts.apiKey, url: opts.url });
  return new NlbBuilderClient({
    baseUrl: config.apiUrl,
    apiKey: config.apiKey,
    sessionCookie: opts.cookie || process.env.NLB_SESSION_COOKIE,
    fetchFn: deps.fetchFn
  });
}

function reportFailure(err: unknown, opts: BuilderCommonOptions): void {
  const message = err instanceof Error ? err.message : String(err);
  if (opts.json) {
    const payload: Record<string, unknown> = { success: false, error: message };
    if (err instanceof BuilderApiError) {
      payload.status = err.status;
      payload.notEnabled = err.notEnabled;
      if (err.code !== undefined) payload.code = err.code;
      if (err.details !== undefined) payload.details = err.details;
    } else if (err instanceof BuilderInputError) {
      payload.details = err.issues;
    }
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(pc.red(`✖ ${safe(message)}`));
    if (err instanceof BuilderApiError && err.status === 401) {
      console.error(pc.dim("  Pass a member API key (--api-key, NLB_API_KEY, or 'nlb config set api-key') or a session cookie (--cookie, NLB_SESSION_COOKIE)."));
    }
  }
  process.exitCode = 1;
}

/** Runs one Builder League action: prints the raw JSON envelope or a readable dump, and maps failures to exit code 1. */
async function run(
  opts: BuilderCommonOptions,
  deps: BuilderCommandDeps,
  title: string,
  action: (client: NlbBuilderClient) => Promise<BuilderEnvelope>
): Promise<void> {
  try {
    const result = await action(createClient(opts, deps));
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(pc.green(`✔ ${title}`));
    console.log(safe(JSON.stringify(result.data, null, 2)));
    const next = (result.pagination as { nextCursor?: string | null } | undefined)?.nextCursor;
    if (next) console.log(pc.dim(`\nMore results: --cursor ${safe(next)}`));
  } catch (err) {
    reportFailure(err, opts);
  }
}

function withCommonOptions(cmd: Command, sessionOnly = false): Command {
  return cmd
    .option("-k, --api-key <key>", sessionOnly ? "Ignored: this action needs a signed-in session cookie" : "Member API key (or NLB_API_KEY)")
    .option("-c, --cookie <cookie>", sessionOnly ? "Better Auth session cookie, required (or NLB_SESSION_COOKIE)" : "Better Auth session cookie, used when no API key is set (or NLB_SESSION_COOKIE)")
    .option("-u, --url <url>", "Directory API base URL")
    .option("--json", "Output the API response (or error) as JSON");
}

const SESSION_NOTE = "(signed-in session only: API keys and agents are refused)";
const ADMIN_NOTE = "(admin session only)";

export function registerBuilderCommands(program: Command, deps: BuilderCommandDeps = {}): Command {
  const builder = program
    .command("builder")
    .description("Builder League: your passport, evidence, journey, missions, seasons, rankings, rewards and Year in Review. API keys can only submit self-reported activity; approvals and awards stay with moderators.");

  const add = (parent: Command, name: string, description: string, sessionOnly = false) =>
    withCommonOptions(parent.command(name).description(description), sessionOnly);

  // --- Profile ---

  add(builder, "access", "Show whether Builder League is open to you on this environment").action(async (opts: BuilderCommonOptions) => {
    await run(opts, deps, "Builder League access", (c) => c.getAccess());
  });

  add(builder, "me", "Show your Builder League profile, level and privacy settings").action(async (opts: BuilderCommonOptions) => {
    await run(opts, deps, "Your Builder League profile", (c) => c.getMe());
  });

  add(builder, "privacy", `Update your privacy opt-ins from a JSON object of flags ${SESSION_NOTE}`, true)
    .argument("<file>", "JSON file with the privacy flags to change ('-' for stdin)")
    .action(async (file: string, opts: BuilderCommonOptions) => {
      await run(opts, deps, "Privacy updated", async (c) => c.updatePrivacy(await readJsonInput(file, deps.stdin)));
    });

  add(builder, "passport", "Show a builder's public passport")
    .argument("<userId>", "Builder user id")
    .action(async (userId: string, opts: BuilderCommonOptions) => {
      await run(opts, deps, "Builder passport", (c) => c.getPassport(userId));
    });

  // --- Projects ---

  const projects = builder.command("projects").description("List or create your Builder League projects");
  add(projects, "list", "List your projects").action(async (opts: BuilderCommonOptions) => {
    await run(opts, deps, "Your projects", (c) => c.listProjects());
  });
  add(projects, "create", "Create a project from JSON { name, summary?, stage?, productId?, visibility? }")
    .argument("<file>", "Project JSON ('-' for stdin)")
    .action(async (file: string, opts: BuilderCommonOptions) => {
      await run(opts, deps, "Project created", async (c) => c.createProject(await readJsonInput(file, deps.stdin)));
    });

  // --- Evidence ---

  const evidence = builder.command("evidence").description("Submit and manage your evidence (API-key submissions are always self-reported)");
  add(evidence, "list", "List your evidence")
    .option("--status <status>", "Filter by status (submitted, needs_info, approved, rejected, withdrawn)")
    .option("-l, --limit <n>", "Page size (1-100)", parseInteger)
    .option("--cursor <cursor>", "Pagination cursor")
    .action(async (opts: BuilderCommonOptions & { status?: string; limit?: number; cursor?: string }) => {
      await run(opts, deps, "Your evidence", (c) => c.listEvidence(defined({ status: opts.status, limit: opts.limit, cursor: opts.cursor })));
    });
  add(evidence, "get", "Show one evidence item")
    .argument("<id>", "Evidence id")
    .action(async (id: string, opts: BuilderCommonOptions) => {
      await run(opts, deps, "Evidence", (c) => c.getEvidence(id));
    });
  add(evidence, "submit", "Submit activity evidence from JSON { eventType, title, occurredAt, ... }; it is recorded as self-reported")
    .argument("<file>", "Evidence JSON ('-' for stdin)")
    .option("--client-key <key>", "Idempotency key so a retried submission is not recorded twice")
    .action(async (file: string, opts: BuilderCommonOptions & { clientKey?: string }) => {
      await run(opts, deps, "Evidence submitted for review", async (c) => {
        const input = await readJsonInput(file, deps.stdin);
        if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Evidence payload must be a JSON object");
        return c.submitEvidence(opts.clientKey ? { ...(input as Record<string, unknown>), clientKey: opts.clientKey } : input);
      });
    });
  add(evidence, "update", "Edit your evidence while it is submitted or needs_info")
    .argument("<id>", "Evidence id")
    .argument("<file>", "JSON with the fields to change ('-' for stdin)")
    .action(async (id: string, file: string, opts: BuilderCommonOptions) => {
      await run(opts, deps, "Evidence updated", async (c) => c.updateEvidence(id, await readJsonInput(file, deps.stdin)));
    });
  add(evidence, "withdraw", "Withdraw your evidence while it is submitted or needs_info")
    .argument("<id>", "Evidence id")
    .action(async (id: string, opts: BuilderCommonOptions) => {
      await run(opts, deps, "Evidence withdrawn", (c) => c.withdrawEvidence(id));
    });
  add(evidence, "appeal", "Appeal a rejected decision")
    .argument("<id>", "Evidence id")
    .requiredOption("--reason <text>", "Why the decision should change (20-2000 characters)")
    .action(async (id: string, opts: BuilderCommonOptions & { reason: string }) => {
      await run(opts, deps, "Appeal filed", (c) => c.appealEvidence(id, opts.reason));
    });
  add(evidence, "confirm", `Confirm you were helped by the evidence's author ${SESSION_NOTE}`, true)
    .argument("<id>", "Evidence id naming you as the counterparty")
    .action(async (id: string, opts: BuilderCommonOptions) => {
      await run(opts, deps, "Peer help confirmed", (c) => c.confirmEvidence(id));
    });

  // --- Progress ---

  add(builder, "journey", "Show your build journey timeline")
    .option("-l, --limit <n>", "Page size (1-200)", parseInteger)
    .option("--cursor <cursor>", "Pagination cursor")
    .option("--project <id>", "Only this project")
    .action(async (opts: BuilderCommonOptions & { limit?: number; cursor?: string; project?: string }) => {
      await run(opts, deps, "Your journey", (c) => c.getJourney(defined({ limit: opts.limit, cursor: opts.cursor, project: opts.project })));
    });

  add(builder, "missions", "Show your missions for the current week")
    .option("--locale <locale>", "en or vi")
    .action(async (opts: BuilderCommonOptions & { locale?: string }) => {
      await run(opts, deps, "Your missions", (c) => c.listMissions(opts.locale));
    });

  add(builder, "badges", "Show the badge catalogue and the badges you earned")
    .option("--locale <locale>", "en or vi")
    .action(async (opts: BuilderCommonOptions & { locale?: string }) => {
      await run(opts, deps, "Badges", (c) => c.listBadges(opts.locale));
    });

  add(builder, "rankings", "Show a leaderboard and your position")
    .option("--board <board>", "overall, validate, build, ship, contribute, rising or newcomers")
    .option("--period <period>", "week, month, year or season")
    .option("--key <key>", "Period key such as 2026-W42, 2026-10, 2026 or S2026-1")
    .option("-l, --limit <n>", "Rows (1-100)", parseInteger)
    .action(async (opts: BuilderCommonOptions & { board?: string; period?: string; key?: string; limit?: number }) => {
      await run(opts, deps, "Rankings", (c) => c.getRankings(defined({ board: opts.board, period: opts.period, key: opts.key, limit: opts.limit })));
    });

  const seasons = builder.command("seasons").description("Show or join Builder League seasons");
  add(seasons, "show", "Show the current and next season and your enrollment").action(async (opts: BuilderCommonOptions) => {
    await run(opts, deps, "Seasons", (c) => c.getSeasons());
  });
  add(seasons, "join", "Join or update your enrollment in the current or next season")
    .option("--season <key>", "Season key (defaults to the current or next season)")
    .option("--track <track>", "open, validate, build, ship or contribute")
    .option("--goal <text>", "Your season goal (up to 280 characters)")
    .action(async (opts: BuilderCommonOptions & { season?: string; track?: string; goal?: string }) => {
      await run(opts, deps, "Season enrollment saved", (c) => c.joinSeason(defined({ seasonKey: opts.season, track: opts.track, goal: opts.goal })));
    });

  const rewards = builder.command("rewards").description("Show or claim Builder League rewards");
  add(rewards, "list", "Show the rewards you can claim and your claims")
    .option("--locale <locale>", "en or vi")
    .action(async (opts: BuilderCommonOptions & { locale?: string }) => {
      await run(opts, deps, "Rewards", (c) => c.listRewards(opts.locale));
    });
  add(rewards, "claim", `Claim an unlocked reward ${SESSION_NOTE}`, true)
    .argument("<id>", "Reward id")
    .option("--note <text>", "Note for the team (up to 500 characters)")
    .action(async (id: string, opts: BuilderCommonOptions & { note?: string }) => {
      await run(opts, deps, "Reward claimed", (c) => c.claimReward(id, opts.note));
    });

  const capsule = builder.command("capsule").description("Read or write your time capsule (yearly intent and reflection)");
  add(capsule, "show", "Show your time capsule")
    .option("--year <year>", "Year (defaults to the current year)", parseInteger)
    .action(async (opts: BuilderCommonOptions & { year?: number }) => {
      await run(opts, deps, "Time capsule", (c) => c.getTimeCapsule(opts.year));
    });
  add(capsule, "save", "Save an intent or reflection entry")
    .requiredOption("--kind <kind>", "intent or reflection")
    .requiredOption("--body <text>", "Entry text (up to 4000 characters)")
    .option("--year <year>", "Year (defaults to the current year)", parseInteger)
    .option("--visibility <visibility>", "private, community or public")
    .action(async (opts: BuilderCommonOptions & { kind: string; body: string; year?: number; visibility?: string }) => {
      await run(opts, deps, "Time capsule saved", (c) => c.saveTimeCapsule(defined({ kind: opts.kind, body: opts.body, year: opts.year, visibility: opts.visibility })));
    });

  // --- Year in Review ---

  const year = builder.command("year").description("Your Year in Review: scenes, share links and videos");
  add(year, "get", "Show your Year in Review").argument("<year>", "Year", parseInteger).action(async (y: number, opts: BuilderCommonOptions) => {
    await run(opts, deps, `Year in Review ${y}`, (c) => c.getYear(y));
  });
  add(year, "hide", `Set the scenes hidden from your Year in Review (none clears) ${SESSION_NOTE}`, true)
    .argument("<year>", "Year", parseInteger)
    .argument("[scenes...]", "Scene keys to hide")
    .action(async (y: number, scenes: string[], opts: BuilderCommonOptions) => {
      await run(opts, deps, "Hidden scenes saved", (c) => c.hideYearScenes(y, scenes));
    });
  add(year, "shares", "List your share links").argument("<year>", "Year", parseInteger).action(async (y: number, opts: BuilderCommonOptions) => {
    await run(opts, deps, "Share links", (c) => c.listShareLinks(y));
  });
  add(year, "share", `Create a public share link ${SESSION_NOTE}`, true)
    .argument("<year>", "Year", parseInteger)
    .option("--locale <locale>", "en or vi")
    .action(async (y: number, opts: BuilderCommonOptions & { locale?: string }) => {
      await run(opts, deps, "Share link created", (c) => c.createShareLink(y, opts.locale));
    });
  add(year, "unshare", "Revoke a share link")
    .argument("<year>", "Year", parseInteger)
    .argument("<linkId>", "Share link id")
    .action(async (y: number, linkId: string, opts: BuilderCommonOptions) => {
      await run(opts, deps, "Share link revoked", (c) => c.revokeShareLink(y, linkId));
    });
  add(year, "videos", "List your Year in Review videos").argument("<year>", "Year", parseInteger).action(async (y: number, opts: BuilderCommonOptions) => {
    await run(opts, deps, "Year videos", (c) => c.listYearVideos(y));
  });
  add(year, "render", "Request a Year in Review video")
    .argument("<year>", "Year", parseInteger)
    .requiredOption("--format <format>", "9x16 or 16x9")
    .action(async (y: number, opts: BuilderCommonOptions & { format: string }) => {
      await run(opts, deps, "Video requested", (c) => c.requestYearVideo(y, opts.format));
    });

  add(builder, "wrapped", "Show Community Wrapped for a year").argument("<year>", "Year", parseInteger).action(async (y: number, opts: BuilderCommonOptions) => {
    await run(opts, deps, `Community Wrapped ${y}`, (c) => c.getCommunityWrapped(y));
  });

  // --- Admin (human admin session; never an API key or agent) ---

  const admin = builder.command("admin").description(`Moderate Builder League evidence ${ADMIN_NOTE}`);
  add(admin, "queue", `Show the moderation queue ${ADMIN_NOTE}`, true)
    .option("--view <view>", "evidence or appeals")
    .option("--status <status>", "Evidence status filter")
    .option("--stage <stage>", "validate, build, ship or contribute")
    .option("--event-type <type>", "Event type filter")
    .option("--older-than-hours <n>", "Only items waiting at least this long", parseInteger)
    .option("-l, --limit <n>", "Page size (1-100)", parseInteger)
    .option("--cursor <cursor>", "Pagination cursor")
    .action(async (opts: BuilderCommonOptions & { view?: string; status?: string; stage?: string; eventType?: string; olderThanHours?: number; limit?: number; cursor?: string }) => {
      const query = defined({ view: opts.view, status: opts.status, stage: opts.stage, eventType: opts.eventType, olderThanHours: opts.olderThanHours, limit: opts.limit, cursor: opts.cursor });
      await run(opts, deps, "Moderation queue", (c) => c.listModerationQueue(query));
    });
  add(admin, "decide", `Approve, reject or ask for more information ${ADMIN_NOTE}`, true)
    .argument("<id>", "Evidence id")
    .requiredOption("--decision <decision>", "approve, reject or needs_info")
    .option("--reason-code <code>", "Reason code (repeatable; required for reject and needs_info)", collect)
    .option("--note <text>", "Note to the member (required with reason code 'other')")
    .action(async (id: string, opts: BuilderCommonOptions & { decision: string; reasonCode?: string[]; note?: string }) => {
      await run(opts, deps, "Decision recorded", (c) => c.decideEvidence(id, defined({ decision: opts.decision, reasonCodes: opts.reasonCode, note: opts.note })));
    });
  add(admin, "resolve-appeal", `Uphold or overturn an appeal ${ADMIN_NOTE}`, true)
    .argument("<id>", "Evidence id")
    .requiredOption("--outcome <outcome>", "uphold or overturn")
    .requiredOption("--resolution <text>", "Explanation for the member (5-2000 characters)")
    .option("--appeal-id <id>", "Appeal id (defaults to the open appeal)")
    .action(async (id: string, opts: BuilderCommonOptions & { outcome: string; resolution: string; appealId?: string }) => {
      await run(opts, deps, "Appeal resolved", (c) => c.resolveAppeal(id, defined({ outcome: opts.outcome, resolution: opts.resolution, appealId: opts.appealId })));
    });
  add(admin, "backfill", `Preview (default) or apply the historical backfill ${ADMIN_NOTE}`, true)
    .option("--user <id>", "Limit to this user id (repeatable)", collect)
    .option("--apply", "Write the backfill instead of a dry run")
    .action(async (opts: BuilderCommonOptions & { user?: string[]; apply?: boolean }) => {
      await run(opts, deps, opts.apply ? "Backfill applied" : "Backfill preview (dry run)", (c) => c.runBackfill(defined({ userIds: opts.user, dryRun: !opts.apply })));
    });

  return builder;
}

/** Drops undefined values so strict contract schemas see only the options the user set. */
function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
