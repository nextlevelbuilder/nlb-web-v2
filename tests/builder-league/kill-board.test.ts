import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalD1 } from "../helpers/local-d1";
import { activityEvidence, builderPrivacy } from "@/lib/db/schema";
import { getKillBoard, redactLearning } from "@/lib/builder-league/kill-board";
import { evaluateBadges } from "@/lib/builder-league/badges";
import { awardForEvent, reverseAward } from "@/lib/builder-league/ledger";
import { at, seedMembers, verified } from "./progression-fixtures";

describe("kill board redaction", () => {
  it("always strips contacts and links, and money unless the member opted out", () => {
    const text = "Charged $49/mo, made 2.000.000 VND; mail me at a@b.co or see https://x.y/z";
    expect(redactLearning(text, true)).toBe("Charged [amount]/mo, made [amount]; mail me at [email] or see [link]");
    expect(redactLearning(text, false)).toContain("$49");
    expect(redactLearning(text, false)).not.toContain("a@b.co");
  });
});

describe("kill board on local D1", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  it("shows only consented, approved, standing stop/pivot learnings, named only with a public passport", async () => {
    const local = await createLocalD1();
    try {
      await seedMembers(local.db);
      const pivot = async (userId: string, clientKey: string, visibility: "private" | "community" | "public", status: "approved" | "submitted" = "approved") => {
        const event = status === "approved" ? await verified(local.db, userId, "validate_stop_pivot", at(2)) : null;
        await local.db.insert(activityEvidence).values({
          userId,
          projectId: `p-${userId}`,
          eventType: "validate_stop_pivot",
          stage: "validate",
          title: `Stopped idea of ${userId}`,
          summary: "Nobody paid $20; contact me@x.io",
          occurredAt: at(2),
          source: "member",
          visibility,
          status,
          clientKey,
          links: ["https://secret.example"],
          privateObjectKeys: ["evidence/key"],
          counterpartyUserId: "u4",
          eventId: event?.id ?? null,
        });
        return event;
      };
      await pivot("u1", "a", "public");
      const u2Event = await pivot("u2", "b", "community");
      await pivot("u3", "c", "private");
      await pivot("u4", "d", "public", "submitted");
      await local.db.insert(builderPrivacy).values({ userId: "u1", passportPublic: true });
      await evaluateBadges(local.db, "u1");

      const board = await getKillBoard(local.db);
      expect(board.map((e) => e.title).sort()).toEqual(["Stopped idea of u1", "Stopped idea of u2"]);
      const u1 = board.find((e) => e.title.endsWith("u1"))!;
      const u2 = board.find((e) => e.title.endsWith("u2"))!;
      expect(u1).toMatchObject({ author: { userId: "u1", name: "Member u1" }, ideaSlayer: true, learning: "Nobody paid [amount]; contact [email]" });
      expect(u2.author).toBeNull();
      const json = JSON.stringify(board);
      expect(json).not.toMatch(/secret\.example|evidence\/key|u4|me@x\.io/);

      // A reversed decision leaves the board.
      const entry = await awardForEvent(local.db, u2Event!.id, { actorId: "admin", actorRole: "admin" });
      await reverseAward(local.db, entry!.id, { actorId: "admin", actorRole: "admin", reason: "fabricated" });
      expect((await getKillBoard(local.db)).map((e) => e.title)).toEqual(["Stopped idea of u1"]);
    } finally {
      await local.dispose();
    }
  });
});
