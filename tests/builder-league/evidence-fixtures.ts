/**
 * Shared fixtures for the evidence, moderation, peer-help and backfill tests: an in-memory Miniflare
 * with the migrated D1 database and a private R2 bucket standing in for `BUILDER_EVIDENCE`, seeded
 * members with real (Polar-shaped) subscriptions, and request builders for the route handlers.
 *
 * The test files mock `@/lib/auth-api-key` (caller from `x-test-user` / `x-test-auth` headers),
 * `@/lib/polar` (plan product ids) and `@opennextjs/cloudflare` (the bucket from
 * `globalThis.__BUILDER_EVIDENCE__`, the flag from `process.env`), inline in each file because mock
 * factories must not import modules that load the mocked ones.
 */
import { Miniflare } from "miniflare";
import { createDb, type AppDb } from "@/lib/db";
import { builderPilotMembers, builderProjects, customers, subscriptions, users } from "@/lib/db/schema";
import type { EvidenceBucket } from "@/lib/builder-league/evidence-storage";
import { readMigrationStatements } from "../helpers/local-d1";

export interface LeagueEnv {
  db: AppDb;
  bucket: EvidenceBucket;
  /** Empties every table except the seeded rulesets, so one Miniflare can serve a whole test file. */
  reset: () => Promise<void>;
  dispose: () => Promise<void>;
}

const KEEP_TABLES = new Set(["score_rulesets"]);

const bindings = globalThis as { __BUILDER_EVIDENCE__?: EvidenceBucket };

export async function createLeagueEnv(): Promise<LeagueEnv> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: { DB: "builder-league-test" },
    r2Buckets: ["BUILDER_EVIDENCE"],
  });
  const d1 = (await mf.getD1Database("DB")) as unknown as D1Database;
  // One batch instead of a round trip per statement keeps per-test setup fast.
  await d1.batch(readMigrationStatements().map((statement) => d1.prepare(statement)));
  const bucket = (await mf.getR2Bucket("BUILDER_EVIDENCE")) as unknown as EvidenceBucket;
  bindings.__BUILDER_EVIDENCE__ = bucket;
  const { results } = await d1
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' and name not like 'd1_%'")
    .all<{ name: string }>();
  const tables = results.map((row) => row.name).filter((name) => !KEEP_TABLES.has(name));
  return {
    db: createDb(d1),
    bucket,
    reset: async () => {
      await d1.batch([d1.prepare("PRAGMA defer_foreign_keys = on"), ...tables.map((name) => d1.prepare(`delete from "${name}"`))]);
    },
    dispose: async () => {
      bindings.__BUILDER_EVIDENCE__ = undefined;
      await mf.dispose();
    },
  };
}

/** Test "now": after ruleset v2's effective date, so both rulesets can be exercised with past dates. */
export const TEST_NOW = new Date("2026-11-20T05:00:00Z");
/** Monday 2026-11-02 10:00 local, inside a v2 week fully in the past. */
export const V2_WEEK = new Date("2026-11-02T03:00:00Z");
export const hoursAfter = (base: Date, hours: number) => new Date(base.getTime() + hours * 3_600_000);

export const PLAN_PRODUCTS = { premium: "prod_premium", vip: "prod_vip" };

const PAID = ["alice", "bob", "carol", "outsider", "admin"];

/**
 * Members: `alice`, `bob`, `carol` (paid pilot members), `outsider` (paid, not on the pilot), `admin`
 * (admin, also paid), `mod2` (second admin). Alice owns projects `p-alice` and `p-alice-2`; Bob
 * owns `p-bob`, the admin `p-admin`.
 */
export async function seedMembers(db: AppDb): Promise<void> {
  await db.batch([
    db.insert(users).values([
      { id: "alice", name: "Alice", email: "alice@example.com", emailVerified: true },
      { id: "bob", name: "Bob", email: "bob@example.com", emailVerified: true },
      { id: "carol", name: "Carol", email: "carol@example.com", emailVerified: true },
      { id: "outsider", name: "Outsider", email: "outsider@example.com", emailVerified: true },
      { id: "admin", name: "Admin", email: "admin@example.com", emailVerified: true, role: "admin" },
      { id: "mod2", name: "Second admin", email: "mod2@example.com", emailVerified: true, role: "admin" },
    ]),
    db.insert(customers).values(PAID.map((userId) => ({ id: `cus_${userId}`, email: `${userId}@example.com`, userId }))),
    db.insert(subscriptions).values(
      PAID.map((userId) => ({
        customerId: `cus_${userId}`,
        polarSubscriptionId: `sub_${userId}`,
        polarProductId: PLAN_PRODUCTS.premium,
        productName: "Premium",
        status: "active",
        currentPeriodEnd: new Date(TEST_NOW.getTime() + 60 * 86_400_000),
      }))
    ),
    db.insert(builderPilotMembers).values(["alice", "bob", "carol"].map((userId) => ({ userId, addedBy: "admin" }))),
    db.insert(builderProjects).values([
      { id: "p-alice", ownerUserId: "alice", name: "Alice app", slug: "alice-app" },
      { id: "p-alice-2", ownerUserId: "alice", name: "Alice tool", slug: "alice-tool" },
      { id: "p-bob", ownerUserId: "bob", name: "Bob app", slug: "bob-app" },
      { id: "p-admin", ownerUserId: "admin", name: "Admin app", slug: "admin-app" },
    ]),
  ]);
}

export function jsonRequest(path: string, user: string | null, body?: unknown, init: { method?: string; auth?: string } = {}): Request {
  const headers = new Headers({ accept: "application/json" });
  if (user) headers.set("x-test-user", user);
  if (init.auth) headers.set("x-test-auth", init.auth);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://nlb.test${path}`, {
    method: init.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A browser form post (no JSON accept header) from the same origin. */
export function formRequest(path: string, user: string, form: FormData): Request {
  const headers = new Headers({ origin: "https://nlb.test", "sec-fetch-site": "same-origin", "x-test-user": user });
  return new Request(`https://nlb.test${path}`, { method: "POST", headers, body: form });
}

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
export const pngFile = (name = "proof.png") => new File([PNG_BYTES], name, { type: "image/png" });
export const htmlAsPng = () => new File([new TextEncoder().encode("<html><script>alert(1)</script></html>")], "x.png", { type: "image/png" });

export const longText = (length: number) => "Real outcome with numbers and context. ".repeat(Math.ceil(length / 39)).slice(0, length);
