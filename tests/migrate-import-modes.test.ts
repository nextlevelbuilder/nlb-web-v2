import { describe, expect, it } from "vitest";
import {
  assertImportScriptHeader,
  buildImportScript,
  importScriptHeader,
  insertStatements,
  migratedTables,
  upsertClause,
} from "@/scripts/migrate/lib/convert-to-sql";
import type { DumpManifest } from "@/scripts/migrate/lib/dump-neon";
import { IMPORT_MODE_USAGE, parseImportMode, parseVerifyMode, UsageError, verifyModeFor } from "@/scripts/migrate/lib/import-mode";
import { loadCatalog } from "@/scripts/migrate/lib/table-catalog";

const catalog = loadCatalog();
const table = (name: string) => {
  const found = catalog.find((entry) => entry.name === name);
  if (!found) throw new Error(`catalog has no ${name}`);
  return found;
};

const V2_ONLY_TABLES = ["blog_posts", "blog_post_revisions", "course_videos", "api_idempotency_keys"];

const manifest: DumpManifest = {
  dumpedAt: "2026-10-13T11:45:21.503Z",
  backupFile: "neon.sql",
  tables: {
    users: { rows: 1, columns: ["id", "name", "email", "email_verified", "created_at", "updated_at"] },
    sessions: { rows: 1, columns: ["id", "user_id", "token", "expires_at", "created_at", "updated_at"] },
    product_tags: { rows: 1, columns: ["product_id", "tag_id"] },
  },
};
const rows: Record<string, Record<string, unknown>[]> = {
  users: [{ id: "u1", name: "Ann", email: "a@e.com", email_verified: true, created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00" }],
  sessions: [{ id: "s1", user_id: "u1", token: "t", expires_at: "2026-02-01T00:00:00", created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00" }],
  product_tags: [{ product_id: "p1", tag_id: "t1" }],
};
const tables = migratedTables(manifest, catalog);
const script = (mode: "final-sync" | "replace") => buildImportScript(manifest, tables, (name) => rows[name] ?? [], mode).sql;

describe("import mode flags", () => {
  it("refuses import/all without an explicit mode", () => {
    expect(() => parseImportMode([])).toThrow(UsageError);
    expect(() => parseImportMode(["--target", "local"])).toThrow(IMPORT_MODE_USAGE);
  });

  it("requires --i-understand for the destructive replace", () => {
    expect(() => parseImportMode(["--replace"])).toThrow("--i-understand");
    expect(parseImportMode(["--replace", "--i-understand"])).toBe("replace");
  });

  it("accepts --final-sync alone and rejects conflicting flags", () => {
    expect(parseImportMode(["--target", "production", "--final-sync", "--confirm-production"])).toBe("final-sync");
    expect(() => parseImportMode(["--final-sync", "--replace", "--i-understand"])).toThrow("mutually exclusive");
    expect(() => parseImportMode(["--final-sync", "--i-understand"])).toThrow("only applies to --replace");
  });

  it("maps verify modes", () => {
    expect(parseVerifyMode([])).toBe("exact");
    expect(parseVerifyMode(["--final-sync"])).toBe("final-sync");
    expect(verifyModeFor("final-sync")).toBe("final-sync");
    expect(verifyModeFor("replace")).toBe("exact");
  });
});

describe("final-sync script", () => {
  const sql = script("final-sync");

  it("upserts by primary key, updating every non-key column from excluded", () => {
    const [statement] = insertStatements(table("users"), rows.users, manifest.tables.users.columns, "final-sync");
    expect(statement).toMatch(/^INSERT INTO "users" \("id", "name", "email", "email_verified", "created_at", "updated_at"\) VALUES\n/);
    expect(statement.endsWith(
      'ON CONFLICT ("id") DO UPDATE SET "name" = excluded."name", "email" = excluded."email", ' +
        '"email_verified" = excluded."email_verified", "created_at" = excluded."created_at", "updated_at" = excluded."updated_at";'
    )).toBe(true);
  });

  it("uses DO NOTHING for key-only tables and the full composite key as conflict target", () => {
    expect(upsertClause(table("product_tags"), table("product_tags").columns)).toBe('ON CONFLICT ("product_id", "tag_id") DO NOTHING');
    expect(sql).toContain('ON CONFLICT ("product_id", "tag_id") DO NOTHING;');
  });

  it("refuses an upsert when a primary key column is absent from the snapshot", () => {
    const users = table("users");
    expect(() => upsertClause(users, users.columns.filter((column) => column.name !== "id"))).toThrow("primary key");
  });

  it("never deletes and never touches v2-only tables", () => {
    expect(sql).not.toMatch(/\bDELETE\b/i);
    for (const name of V2_ONLY_TABLES) expect(sql).not.toContain(`"${name}"`);
    expect(sql.split("\n")[0]).toBe(importScriptHeader("final-sync", manifest.dumpedAt));
  });

  it("inserts parents before children", () => {
    expect(sql.indexOf('INSERT INTO "users"')).toBeLessThan(sql.indexOf('INSERT INTO "sessions"'));
  });

  it("keeps upsert statements under the D1 statement size cap", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `u${i}`, name: "é".repeat(300), email: `u${i}@e.com` }));
    const statements = insertStatements(table("users"), many, ["id", "name", "email"], "final-sync");
    expect(statements.length).toBeGreaterThan(2);
    for (const statement of statements) {
      expect(Buffer.byteLength(statement, "utf8")).toBeLessThanOrEqual(90_000);
      expect(statement).toContain('ON CONFLICT ("id") DO UPDATE SET');
    }
  });
});

describe("replace script", () => {
  it("deletes only snapshot tables, children first, then inserts without upsert", () => {
    const sql = script("replace");
    expect(sql.indexOf('DELETE FROM "sessions"')).toBeLessThan(sql.indexOf('DELETE FROM "users"'));
    expect(sql.indexOf('DELETE FROM "users"')).toBeLessThan(sql.indexOf('INSERT INTO "users"'));
    expect(sql).not.toContain("ON CONFLICT");
    for (const name of V2_ONLY_TABLES) expect(sql).not.toContain(`"${name}"`);
  });
});

describe("import script header guard", () => {
  const header = importScriptHeader("final-sync", manifest.dumpedAt);

  it("accepts the matching mode and snapshot", () => {
    expect(() => assertImportScriptHeader(header, "final-sync", manifest.dumpedAt)).not.toThrow();
  });

  it("rejects a script for another mode, another snapshot, or without a header", () => {
    expect(() => assertImportScriptHeader(header, "replace", manifest.dumpedAt)).toThrow("generated for mode final-sync");
    expect(() => assertImportScriptHeader(header, "final-sync", "2026-10-14T00:00:00.000Z")).toThrow("re-run the convert step");
    expect(() => assertImportScriptHeader("-- Neon -> D1 import generated x", "replace", manifest.dumpedAt)).toThrow("no nlb-migrate header");
  });
});
