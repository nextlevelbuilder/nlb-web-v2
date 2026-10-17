import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { shareAttributions, users } from "@/lib/db/schema";
import { createShareLink } from "@/lib/builder-league/share-links";
import {
  buildShareUrl,
  hashVisitor,
  isValidVisitorId,
  recordShareConversion,
  recordShareVisit,
  sanitizeUtm,
  shareFunnel,
} from "@/lib/builder-league/attribution";
import { local } from "./year-review-fixtures";

let t: LocalD1;
let linkId = "";
const SECRET = "s".repeat(40);
const VISITOR = "8b0c5a3e-1f2d-4c6b-9a7e-0d1c2b3a4f5e";

beforeAll(async () => {
  t = await createLocalD1();
  await t.db.insert(users).values([
    { id: "owner", name: "Owner", email: "owner@example.com" },
    { id: "friend", name: "Friend", email: "friend@example.com" },
    { id: "late", name: "Late", email: "late@example.com" },
  ]);
  linkId = (await createShareLink(t.db, { userId: "owner", kind: "year_review", year: 2026 })).link.id;
});

afterAll(async () => {
  await t.dispose();
});

describe("share attribution", () => {
  it("builds a tagged personal URL", () => {
    const url = new URL(buildShareUrl({ origin: "https://nlb.example", locale: "vi", year: 2026, token: "tok", channel: "zalo" }));
    expect(url.pathname).toBe("/vi/wrapped/2026/tok");
    expect(Object.fromEntries(url.searchParams)).toEqual({ utm_source: "zalo", utm_medium: "share", utm_campaign: "year-review-2026" });
    expect(new URL(buildShareUrl({ origin: "https://nlb.example", locale: "en", year: 2026, token: "tok" })).pathname).toBe("/wrapped/2026/tok");
  });

  it("keeps only known, clean UTM values", () => {
    expect(sanitizeUtm({ utm_source: "x", utm_medium: "<script>", gclid: "abc", utm_campaign: 5 })).toEqual({ utm_source: "x" });
  });

  it("hashes the visitor with the day and link, and needs a strong secret", () => {
    const day1 = hashVisitor(VISITOR, linkId, local(2026, 12, 1, 10), SECRET);
    expect(day1).toMatch(/^[0-9a-f]{64}$/);
    expect(day1).not.toContain(VISITOR);
    expect(hashVisitor(VISITOR, linkId, local(2026, 12, 1, 23), SECRET)).toBe(day1);
    expect(hashVisitor(VISITOR, linkId, local(2026, 12, 2, 0, 30), SECRET)).not.toBe(day1);
    expect(hashVisitor(VISITOR, "other-link", local(2026, 12, 1, 10), SECRET)).not.toBe(day1);
    expect(hashVisitor(VISITOR, linkId, local(2026, 12, 1), "short")).toBeNull();
    expect(isValidVisitorId(VISITOR)).toBe(true);
    expect(isValidVisitorId("not-a-uuid")).toBe(false);
  });

  it("counts one visit per visitor and local day and stores no raw id", async () => {
    expect(await recordShareVisit(t.db, { shareLinkId: linkId, visitorId: VISITOR, utm: { utm_source: "x" }, now: local(2026, 12, 1, 9), secret: SECRET })).toBe(true);
    expect(await recordShareVisit(t.db, { shareLinkId: linkId, visitorId: VISITOR, utm: {}, now: local(2026, 12, 1, 20), secret: SECRET })).toBe(false);
    expect(await recordShareVisit(t.db, { shareLinkId: linkId, visitorId: VISITOR, utm: {}, now: local(2026, 12, 2, 9), secret: SECRET })).toBe(true);
    const rows = await t.db.select().from(shareAttributions);
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(VISITOR);
  });

  it("attributes signup then paid once, reusing the signup link, and ignores self-attribution", async () => {
    expect(await recordShareConversion(t.db, "friend", "signup", { shareLinkId: linkId })).toBe(linkId);
    expect(await recordShareConversion(t.db, "friend", "signup", { shareLinkId: linkId })).toBe(linkId);
    expect(await recordShareConversion(t.db, "friend", "paid")).toBe(linkId);
    expect(await recordShareConversion(t.db, "owner", "signup", { shareLinkId: linkId })).toBeNull();
    expect(await recordShareConversion(t.db, "late", "paid")).toBeNull();
    expect(await recordShareConversion(t.db, "late", "signup", { shareLinkId: "missing" })).toBeNull();
    expect(await shareFunnel(t.db, "owner", 2026)).toEqual({ visits: 2, signups: 1, paid: 1 });
  });
});
