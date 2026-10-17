import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { timeCapsuleEntries } from "@/lib/db/schema";
import {
  canSeeCapsuleEntry,
  getCapsuleYear,
  getVisibleCapsuleEntries,
  saveCapsuleEntry,
  writableYears,
} from "@/lib/builder-league/time-capsule";
import { seedMembers } from "./progression-fixtures";

const NOW = new Date("2026-10-17T05:00:00Z");
let local: LocalD1;

beforeEach(async () => {
  local = await createLocalD1();
  await seedMembers(local.db, ["u1", "u2"]);
});
afterEach(async () => local.dispose());

describe("time capsule", () => {
  it("appends a version on every edit and keeps history for the owner", async () => {
    const v1 = await saveCapsuleEntry(local.db, "u1", { kind: "intent", body: "Ship one product" }, NOW);
    const same = await saveCapsuleEntry(local.db, "u1", { kind: "intent", body: "Ship one product" }, NOW);
    const v2 = await saveCapsuleEntry(local.db, "u1", { kind: "intent", body: "Ship and get one customer", visibility: "community" }, NOW);
    expect(v1).toMatchObject({ version: 1, year: 2026, visibility: "private" });
    expect(same.id).toBe(v1.id);
    expect(v2).toMatchObject({ version: 2, visibility: "community" });
    const year = await getCapsuleYear(local.db, "u1", 2026);
    expect(year.intent?.body).toBe("Ship and get one customer");
    expect(year.reflection).toBeNull();
    expect(year.history.map((e) => e.version)).toEqual([1, 2]);
  });

  it("never loses concurrent edits", async () => {
    await Promise.all(
      Array.from({ length: 4 }, (_, i) => saveCapsuleEntry(local.db, "u1", { kind: "reflection", body: `draft ${i}` }, NOW))
    );
    const rows = await local.db.select().from(timeCapsuleEntries);
    expect(rows.map((r) => r.version).sort()).toEqual([1, 2, 3, 4]);
  });

  it("limits writable years and validates input", async () => {
    expect(writableYears(NOW)).toEqual([2025, 2026, 2027]);
    await expect(saveCapsuleEntry(local.db, "u1", { year: 2024, kind: "intent", body: "x" }, NOW)).rejects.toMatchObject({ code: "year_closed" });
    await expect(saveCapsuleEntry(local.db, "u1", { kind: "intent", body: "   " }, NOW)).rejects.toThrow();
  });

  it("applies per-entry visibility from the latest version only", async () => {
    await saveCapsuleEntry(local.db, "u1", { kind: "intent", body: "public goal", visibility: "public" }, NOW);
    await saveCapsuleEntry(local.db, "u1", { kind: "intent", body: "now private", visibility: "private" }, NOW);
    await saveCapsuleEntry(local.db, "u1", { kind: "reflection", body: "for members", visibility: "community" }, NOW);
    const stranger = await getVisibleCapsuleEntries(local.db, "u1", 2026, { userId: null, isLeagueMember: false });
    expect(stranger).toEqual({ intent: null, reflection: null });
    const member = await getVisibleCapsuleEntries(local.db, "u1", 2026, { userId: "u2", isLeagueMember: true });
    expect(member.intent).toBeNull();
    expect(member.reflection?.body).toBe("for members");
    const owner = await getVisibleCapsuleEntries(local.db, "u1", 2026, { userId: "u1", isLeagueMember: true });
    expect(owner.intent?.body).toBe("now private");
    expect(canSeeCapsuleEntry("public", "u1", { userId: null, isLeagueMember: false })).toBe(true);
  });
});
