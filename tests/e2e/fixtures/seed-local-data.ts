/**
 * Deterministic Builder League fixtures for the local E2E run.
 *
 * Writes to the local D1 of the wrangler `staging` environment (`wrangler d1 execute --local`), never to a
 * remote database. The dev server reads the same local state because the Playwright webServer runs with
 * `NEXT_DEV_WRANGLER_ENV=staging`, whose vars set `BUILDER_LEAGUE_ENABLED` to `"true"`.
 *
 * Authentication: email sign-in sends a real OTP mail, so the seed inserts a session row for each test
 * member and signs its cookie the way Better Auth does (HMAC-SHA256 of the token with `BETTER_AUTH_SECRET`,
 * `encodeURIComponent(token.signature)`). Tokens are random on every run and never printed or committed;
 * the storage state files live in the gitignored `tests/e2e/.auth/`.
 */
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../../..");
/** Wrangler environment whose committed vars enable the Builder League (`BUILDER_LEAGUE_ENABLED: "true"`). */
export const WRANGLER_ENV = "staging";
export const AUTH_DIR = path.join(ROOT, "tests/e2e/.auth");
const SEED_DIR = path.join(ROOT, ".wrangler/e2e");

/** Fake Polar product id for the VIP annual plan; the webServer passes the same value as `POLAR_PRODUCT_VIP_ANNUAL`. */
export const E2E_VIP_PRODUCT_ID = "e2e-polar-vip-annual";

export const MEMBER = { id: "e2e-member-0001", name: "E2E Member", email: "e2e.member@example.test" } as const;
/** Second pilot member, deleted by the one test that exercises self-service deletion. */
export const THROWAWAY = { id: "e2e-throwaway-0001", name: "E2E Throwaway", email: "e2e.throwaway@example.test" } as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "better-auth.session_token";

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;

function sqlValue(value: Cell): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

function insert(table: string, row: Row): string {
  const columns = Object.keys(row);
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((c) => sqlValue(row[c])).join(", ")});`;
}

/** Reads one `KEY=value` entry from the local `.dev.vars` without echoing it anywhere. */
function readDevVar(name: string): string {
  const text = readFileSync(path.join(ROOT, ".dev.vars"), "utf8");
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] === name) return match[2].replace(/^["']|["']$/g, "");
  }
  throw new Error(`${name} is not set in .dev.vars; copy it from the main checkout before running the E2E suite.`);
}

function signedSessionCookie(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

const ts = (iso: string) => Date.parse(iso);

/** Approved, public evidence with its moderator-verified event and the ledger row that awards its RP. */
const APPROVED_EVIDENCE = [
  { n: 1, eventType: "validate_interviews", stage: "validate", rp: 30, occurredAt: "2026-03-10T10:00:00+07:00", title: "Ten customer interviews", visibility: "public" },
  { n: 2, eventType: "build_mvp", stage: "build", rp: 30, occurredAt: "2026-05-02T10:00:00+07:00", title: "First MVP deployed", visibility: "public" },
  { n: 3, eventType: "ship_public_post", stage: "ship", rp: 10, occurredAt: "2026-06-15T10:00:00+07:00", title: "Launch announcement post", visibility: "public" },
] as const;

function memberStatements(now: number): string[] {
  const statements: string[] = [];
  const memberUsers = [MEMBER, THROWAWAY];

  for (const user of memberUsers) {
    statements.push(insert("users", { id: user.id, name: user.name, email: user.email, email_verified: true, role: "user", created_at: now, updated_at: now }));
  }

  for (const user of memberUsers) {
    const customerId = `e2e-customer-${user.id}`;
    statements.push(
      insert("customers", {
        id: customerId,
        email: user.email,
        name: user.name,
        polar_customer_id: `e2e-polar-customer-${user.id}`,
        user_id: user.id,
        created_at: now,
        updated_at: now,
      })
    );
    statements.push(
      insert("subscriptions", {
        id: `e2e-subscription-${user.id}`,
        customer_id: customerId,
        polar_subscription_id: `e2e-polar-subscription-${user.id}`,
        polar_product_id: E2E_VIP_PRODUCT_ID,
        product_name: "VIP (E2E fixture)",
        status: "active",
        current_period_start: now - 30 * DAY_MS,
        current_period_end: now + 180 * DAY_MS,
        cancel_at_period_end: false,
        created_at: now,
        updated_at: now,
      })
    );
    statements.push(insert("builder_pilot_members", { user_id: user.id, added_by: "e2e-seed", note: "E2E fixture", added_at: now }));
  }

  statements.push(
    insert("builder_privacy", {
      user_id: MEMBER.id,
      leaderboard_public: true,
      passport_public: true,
      wrapped_public: true,
      peer_mentions_ok: true,
      backfill_opt_in: false,
      redact_financials: true,
      updated_at: now,
    })
  );

  for (const item of APPROVED_EVIDENCE) {
    const occurred = ts(item.occurredAt);
    const evidenceId = `e2e-evidence-${item.n}`;
    statements.push(
      insert("activity_evidence", {
        id: evidenceId,
        user_id: MEMBER.id,
        event_type: item.eventType,
        stage: item.stage,
        title: item.title,
        summary: `Fixture evidence ${item.n} for the Builder League E2E suite.`,
        occurred_at: occurred,
        links: JSON.stringify([`https://example.test/e2e/${item.n}`]),
        private_object_keys: "[]",
        status: "approved",
        source: "member",
        visibility: item.visibility,
        client_key: `e2e-client-${item.n}`,
        decided_by: "e2e-seed",
        decided_at: occurred,
        created_at: occurred,
        updated_at: occurred,
      })
    );
    const eventRowId = `e2e-event-row-${item.n}`;
    statements.push(
      insert("builder_events", {
        id: eventRowId,
        event_id: `e2e-event-${item.n}`,
        kind: "activity",
        subject_user_id: MEMBER.id,
        actor_user_id: "e2e-seed",
        actor_role: "moderator",
        stage: item.stage,
        event_type: item.eventType,
        source: "member",
        external_event_id: `e2e-external-${item.n}`,
        dedupe_key: `e2e-dedupe-${item.n}`,
        occurred_at: occurred,
        received_at: occurred,
        ruleset_version: "v2",
        verification: "moderator_verified",
        visibility: item.visibility,
        evidence_id: evidenceId,
        payload: "{}",
        provenance: "{}",
      })
    );
    statements.push(
      insert("score_ledger", {
        id: `e2e-ledger-${item.n}`,
        user_id: MEMBER.id,
        event_id: eventRowId,
        award_type: item.eventType,
        stage: item.stage,
        rp: item.rp,
        ruleset_version: "v2",
        dedupe_key: `e2e-ledger-dedupe-${item.n}`,
        occurred_at: occurred,
        created_at: occurred,
      })
    );
  }
  return statements;
}

/** Deletes every fixture row first so re-running the seed yields the same state. */
function cleanupStatements(): string[] {
  const ids = `('${MEMBER.id}', '${THROWAWAY.id}')`;
  const customers = `(SELECT id FROM customers WHERE user_id IN ${ids} OR id LIKE 'e2e-customer-%')`;
  return [
    `DELETE FROM score_ledger WHERE user_id IN ${ids} OR id LIKE 'e2e-ledger-%';`,
    `DELETE FROM builder_events WHERE subject_user_id IN ${ids} OR id LIKE 'e2e-event-row-%';`,
    `DELETE FROM activity_evidence WHERE user_id IN ${ids} OR id LIKE 'e2e-evidence-%';`,
    `DELETE FROM builder_pilot_members WHERE user_id IN ${ids};`,
    `DELETE FROM builder_privacy WHERE user_id IN ${ids};`,
    `DELETE FROM subscriptions WHERE customer_id IN ${customers};`,
    `DELETE FROM customers WHERE id IN ${customers};`,
    `DELETE FROM sessions WHERE user_id IN ${ids};`,
    `DELETE FROM users WHERE id IN ${ids};`,
  ];
}

function wrangler(args: string[]): void {
  execFileSync("npx", ["--no-install", "wrangler", ...args], { cwd: ROOT, stdio: "pipe", env: { ...process.env, CI: "1" } });
}

/** Applies committed D1 migrations to the local staging database (idempotent). */
export function migrateLocalD1(): void {
  wrangler(["d1", "migrations", "apply", "DB", "--local", `--env=${WRANGLER_ENV}`]);
}

export interface SeededSessions {
  memberCookie: string;
  throwawayCookie: string;
}

/** Seeds fixtures and writes one storage state per signed-in test member. */
export function seedLocalData(): SeededSessions {
  const secret = readDevVar("BETTER_AUTH_SECRET");
  const now = Date.now();
  const sessions = {
    [MEMBER.id]: randomBytes(32).toString("base64url"),
    [THROWAWAY.id]: randomBytes(32).toString("base64url"),
  };
  const sessionRows = Object.entries(sessions).map(([userId, token]) =>
    insert("sessions", {
      id: `e2e-session-${userId}`,
      user_id: userId,
      token,
      expires_at: now + 7 * DAY_MS,
      created_at: now,
      updated_at: now,
    })
  );

  mkdirSync(SEED_DIR, { recursive: true });
  const sqlPath = path.join(SEED_DIR, "seed.sql");
  writeFileSync(sqlPath, [...cleanupStatements(), ...memberStatements(now), ...sessionRows].join("\n") + "\n");
  wrangler(["d1", "execute", "DB", "--local", `--env=${WRANGLER_ENV}`, `--file=${sqlPath}`]);

  const memberCookie = signedSessionCookie(sessions[MEMBER.id], secret);
  const throwawayCookie = signedSessionCookie(sessions[THROWAWAY.id], secret);
  writeStorageState("member", memberCookie);
  writeStorageState("throwaway", throwawayCookie);
  return { memberCookie, throwawayCookie };
}

/** Storage state for a signed-in visitor on the local origin (cookie only, no other state). */
function writeStorageState(name: string, cookieValue: string): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  const state = {
    cookies: [
      {
        name: SESSION_COOKIE,
        value: cookieValue,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
  writeFileSync(path.join(AUTH_DIR, `${name}.json`), JSON.stringify(state, null, 2));
}
