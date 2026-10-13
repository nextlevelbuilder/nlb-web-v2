import { describe, expect, it } from "vitest";
import { canonicalJson, hashSorted, normalizeValue, serializeNormalizedRow } from "@/scripts/migrate/lib/row-normalization";
import { loadCatalog } from "@/scripts/migrate/lib/table-catalog";
import { compareTable } from "@/scripts/migrate/lib/verify-table-comparison";

describe("verify value normalisation", () => {
  it("normalises timestamps with and without zone, and truncates microseconds", () => {
    const expected = Date.UTC(2026, 0, 2, 3, 4, 5, 123);
    expect(normalizeValue("2026-01-02T03:04:05.123987", "timestamp_ms")).toBe(expected);
    expect(normalizeValue("2026-01-02 03:04:05.123", "timestamp_ms")).toBe(expected);
    expect(normalizeValue("2026-01-02T10:04:05.123456+07:00", "timestamp_ms")).toBe(expected);
    expect(normalizeValue("2026-01-02T03:04:05.123Z", "timestamp_ms")).toBe(expected);
    expect(normalizeValue(expected, "timestamp_ms")).toBe(expected);
    expect(normalizeValue(String(expected), "timestamp_ms")).toBe(expected);
    expect(() => normalizeValue("soon", "timestamp_ms")).toThrow();
  });

  it("canonicalises JSON key order and whitespace recursively", () => {
    const a = normalizeValue('{ "b": 1, "a": { "y": [1, {"d": 2, "c": 3}], "x": null } }', "json");
    const b = normalizeValue({ a: { x: null, y: [1, { c: 3, d: 2 }] }, b: 1 }, "json");
    expect(a).toBe('{"a":{"x":null,"y":[1,{"c":3,"d":2}]},"b":1}');
    expect(b).toBe(a);
    expect(normalizeValue('"just a string"', "json")).toBe('"just a string"');
    expect(normalizeValue("{broken", "json")).toBe("invalid-json:{broken");
    expect(canonicalJson({ z: undefined, n: -0, f: 1.5 })).toBe('{"f":1.5,"n":0}');
  });

  it("maps booleans to 0/1 and keeps nulls", () => {
    expect(normalizeValue(true, "boolean")).toBe(1);
    expect(normalizeValue(false, "boolean")).toBe(0);
    expect(normalizeValue(1, "boolean")).toBe(1);
    expect(normalizeValue(0, "boolean")).toBe(0);
    expect(() => normalizeValue("yes", "boolean")).toThrow();
    for (const kind of ["text", "json", "integer", "boolean", "timestamp_ms"] as const) {
      expect(normalizeValue(null, kind)).toBeNull();
      expect(normalizeValue(undefined, kind)).toBeNull();
    }
  });

  it("normalises numbers and leaves text verbatim", () => {
    expect(normalizeValue(-0, "integer")).toBe(0);
    expect(normalizeValue("42", "integer")).toBe(42);
    expect(normalizeValue(true, "integer")).toBe(1);
    expect(() => normalizeValue(Number.NaN, "integer")).toThrow();
    expect(normalizeValue('{"b":1,"a":2}', "text")).toBe('{"b":1,"a":2}');
    expect(normalizeValue(7, "text")).toBe("7");
  });

  it("serialises rows positionally and hashes independent of order", () => {
    const columns = [
      { name: "id", kind: "text" as const },
      { name: "ok", kind: "boolean" as const },
    ];
    expect(serializeNormalizedRow({ id: "a", ok: true, ignored: 1 }, columns)).toBe('["a",1]');
    expect(hashSorted(["x", "y"])).toBe(hashSorted(["y", "x"]));
    expect(hashSorted(["x", "y"])).not.toBe(hashSorted(["x", "z"]));
  });
});

describe("verify table comparison", () => {
  const users = loadCatalog().find((table) => table.name === "users")!;
  const columns = ["id", "name", "email", "email_verified", "created_at"];
  const source = [
    { id: "u1", name: "Ann", email: "a@e.com", email_verified: true, created_at: "2026-01-02T03:04:05.123987" },
    { id: "u2", name: "Bob", email: "b@e.com", email_verified: false, created_at: "2026-01-02T10:04:05.5+07:00" },
  ];
  const d1 = [
    { id: "u1", name: "Ann", email: "a@e.com", email_verified: 1, created_at: Date.UTC(2026, 0, 2, 3, 4, 5, 123), role: "user" },
    { id: "u2", name: "Bob", email: "b@e.com", email_verified: 0, created_at: Date.UTC(2026, 0, 2, 3, 4, 5, 500), role: "user" },
  ];

  it("passes when D1 holds the converted snapshot (v2-only columns ignored)", () => {
    const result = compareTable(users, columns, source, d1, "exact");
    expect(result.ok).toBe(true);
    expect(result.sourceValueHash).toBe(result.targetValueHash);
    expect(result.mismatchedIds).toEqual([]);
  });

  it("fails on a changed value even when keys and counts match", () => {
    const corrupted = [d1[0], { ...d1[1], email_verified: 1 }];
    const result = compareTable(users, columns, source, corrupted, "exact");
    expect(result.rowCountOk).toBe(true);
    expect(result.identityOk).toBe(true);
    expect(result.valuesOk).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.mismatchedIds).toEqual(["u2"]);
  });

  it("treats D1-only rows as failure in exact mode and as info in final-sync mode", () => {
    const withExtra = [...d1, { id: "u3", name: "New", email: "n@e.com", email_verified: 1, created_at: 1 }];
    const exact = compareTable(users, columns, source, withExtra, "exact");
    expect(exact.ok).toBe(false);
    expect(exact.mismatchedIds).toEqual(["u3"]);

    const finalSync = compareTable(users, columns, source, withExtra, "final-sync");
    expect(finalSync.ok).toBe(true);
    expect(finalSync.extraTargetRows).toBe(1);
    expect(finalSync.comparedTargetRows).toBe(2);
    expect(finalSync.targetRows).toBe(3);
  });

  it("fails final-sync when a snapshot row is missing or differs", () => {
    const missing = compareTable(users, columns, source, [d1[0]], "final-sync");
    expect(missing.ok).toBe(false);
    expect(missing.missingTargetRows).toBe(1);
    const changed = compareTable(users, columns, source, [d1[0], { ...d1[1], name: "Robert" }], "final-sync");
    expect(changed.valuesOk).toBe(false);
    expect(changed.mismatchedIds).toEqual(["u2"]);
  });

  it("reports an unnormalisable D1 value as a mismatch instead of throwing", () => {
    const result = compareTable(users, columns, source, [d1[0], { ...d1[1], created_at: "garbage" }], "exact");
    expect(result.valuesOk).toBe(false);
  });
});
