import { describe, expect, it } from "vitest";
import { convertValue, rowIdentity, sqlLiteral, timestampToEpochMs } from "@/scripts/migrate/lib/value-converters";
import { insertStatements, migratedTables } from "@/scripts/migrate/lib/convert-to-sql";
import { loadCatalog, topologicalOrder } from "@/scripts/migrate/lib/table-catalog";

describe("Neon -> D1 value conversion", () => {
  it("treats zone-less Postgres timestamps as UTC and truncates microseconds", () => {
    expect(timestampToEpochMs("2026-01-02T03:04:05.123987")).toBe(Date.UTC(2026, 0, 2, 3, 4, 5, 123));
    expect(timestampToEpochMs("2026-01-02T03:04:05")).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(timestampToEpochMs("2026-01-02T10:04:05.5+07:00")).toBe(Date.UTC(2026, 0, 2, 3, 4, 5, 500));
    expect(() => timestampToEpochMs("yesterday")).toThrow("Unrecognised timestamp");
  });

  it("maps booleans, json, arrays and nulls", () => {
    expect(convertValue(true, "boolean")).toBe(1);
    expect(convertValue(false, "boolean")).toBe(0);
    expect(convertValue({ a: [1] }, "json")).toBe('{"a":[1]}');
    // A jsonb value that is itself a string stays a JSON string (double-encoded docs are handled in SQL).
    expect(convertValue('{"x":1}', "json")).toBe('"{\\"x\\":1}"');
    expect(convertValue(["a", "b"], "text")).toBe('["a","b"]');
    expect(convertValue(null, "timestamp_ms")).toBeNull();
    expect(() => convertValue("yes", "boolean")).toThrow();
  });

  it("escapes SQL literals and rejects NUL bytes", () => {
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(42)).toBe("42");
    expect(() => sqlLiteral("a\u0000b")).toThrow("NUL");
  });

  it("builds composite row identities", () => {
    expect(rowIdentity({ a: "1", b: "2" }, ["a", "b"])).toBe("1\u001f2");
  });
});

describe("migration catalog and script", () => {
  const catalog = loadCatalog();

  it("orders parents before children", () => {
    const names = catalog.map((table) => table.name);
    expect(names.indexOf("users")).toBeLessThan(names.indexOf("sessions"));
    expect(names.indexOf("products")).toBeLessThan(names.indexOf("product_revisions"));
    expect(() =>
      topologicalOrder([
        { name: "a", columns: [], primaryKey: ["id"], dependsOn: ["b"] },
        { name: "b", columns: [], primaryKey: ["id"], dependsOn: ["a"] },
      ])
    ).toThrow("cycle");
  });

  it("aborts on source columns or tables missing from D1", () => {
    const manifest = { dumpedAt: "", backupFile: "", tables: { users: { rows: 0, columns: ["id", "legacy_col"] } } };
    expect(() => migratedTables(manifest, catalog)).toThrow("users.legacy_col");
    const unknown = { dumpedAt: "", backupFile: "", tables: { ghost: { rows: 0, columns: ["id"] } } };
    expect(() => migratedTables(unknown, catalog)).toThrow("ghost");
  });

  it("splits large inserts under the D1 statement limit", () => {
    const users = catalog.find((table) => table.name === "users")!;
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: `u${i}`, name: "x".repeat(400), email: `u${i}@e.com` }));
    const statements = insertStatements(users, rows, ["id", "name", "email"]);
    expect(statements.length).toBeGreaterThan(2);
    for (const statement of statements) expect(Buffer.byteLength(statement)).toBeLessThan(100_000);
  });
});
