import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { builderShareLinks, users } from "@/lib/db/schema";
import {
  MAX_ACTIVE_LINKS,
  createShareLink,
  hashShareToken,
  listShareLinks,
  resolveShareToken,
  revokeShareLink,
  serializeShareLink,
} from "@/lib/builder-league/share-links";

let t: LocalD1;

beforeAll(async () => {
  t = await createLocalD1();
  await t.db.insert(users).values([
    { id: "u1", name: "Owner", email: "u1@example.com" },
    { id: "u2", name: "Other", email: "u2@example.com" },
  ]);
});

afterAll(async () => {
  await t.dispose();
});

describe("share links", () => {
  it("stores only the token hash and resolves the raw token", async () => {
    const { link, token } = await createShareLink(t.db, { userId: "u1", kind: "year_review", year: 2026 });
    const [row] = await t.db.select().from(builderShareLinks);
    expect(row.tokenHash).toBe(hashShareToken(token));
    expect(row.tokenHash).not.toContain(token);
    expect(await resolveShareToken(t.db, token, { kind: "year_review", year: 2026 })).toMatchObject({ id: link.id });
    expect(await resolveShareToken(t.db, token, { kind: "year_review", year: 2025 })).toBeNull();
    expect(await resolveShareToken(t.db, token, { kind: "passport" })).toBeNull();
    expect(await resolveShareToken(t.db, "short")).toBeNull();
    expect(JSON.stringify(serializeShareLink(link))).not.toContain(row.tokenHash);
  });

  it("revokes idempotently, only for the owner, and a revoked token resolves to nothing", async () => {
    const { link, token } = await createShareLink(t.db, { userId: "u1", kind: "year_review", year: 2026 });
    await expect(revokeShareLink(t.db, "u2", link.id)).rejects.toMatchObject({ status: 404 });
    // A link of another year is not found and stays active.
    await expect(revokeShareLink(t.db, "u1", link.id, new Date(), { year: 2025 })).rejects.toMatchObject({ status: 404, code: "link_not_found" });
    expect(await resolveShareToken(t.db, token, { kind: "year_review", year: 2026 })).toMatchObject({ id: link.id });
    const revoked = await revokeShareLink(t.db, "u1", link.id, new Date("2026-11-01T00:00:00Z"));
    expect(revoked.revokedAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    const again = await revokeShareLink(t.db, "u1", link.id, new Date("2026-12-01T00:00:00Z"));
    expect(again.revokedAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(await resolveShareToken(t.db, token, { kind: "year_review", year: 2026 })).toBeNull();
  });

  it("caps active links per year", async () => {
    const active = await listShareLinks(t.db, "u1", { kind: "year_review", year: 2026, activeOnly: true });
    for (let i = active.length; i < MAX_ACTIVE_LINKS; i++) await createShareLink(t.db, { userId: "u1", kind: "year_review", year: 2026 });
    await expect(createShareLink(t.db, { userId: "u1", kind: "year_review", year: 2026 })).rejects.toMatchObject({ status: 409, code: "too_many_links" });
    await expect(createShareLink(t.db, { userId: "u1", kind: "year_review", year: 2027 })).resolves.toBeTruthy();
  });
});
