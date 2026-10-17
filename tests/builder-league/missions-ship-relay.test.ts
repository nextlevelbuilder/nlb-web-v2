import { describe, expect, it } from "vitest";
import { createLocalD1 } from "../helpers/local-d1";
import { activityEvidence, builderPrivacy } from "@/lib/db/schema";
import { getRelayOverview } from "@/components/builder-league/relay/relay-data";
import { at, seedMembers } from "./progression-fixtures";

describe("ship relay on local D1", () => {
  it("splits awaiting, given and shared help, naming people only when both allow peer mentions", async () => {
    const local = await createLocalD1();
    try {
      await seedMembers(local.db);
      const help = (
        clientKey: string,
        userId: string,
        counterpartyUserId: string,
        options: { confirmed?: boolean; status?: "submitted" | "approved"; visibility?: "private" | "community" } = {}
      ) =>
        local.db.insert(activityEvidence).values({
          userId,
          eventType: "contribute_peer_help",
          stage: "contribute",
          title: `${userId} helped ${counterpartyUserId} (${clientKey})`,
          occurredAt: at(1),
          source: "member",
          clientKey,
          counterpartyUserId,
          counterpartyConfirmedAt: options.confirmed ? at(2) : null,
          status: options.status ?? "submitted",
          visibility: options.visibility ?? "community",
        });

      await help("pending", "u2", "u1");
      await help("named", "u1", "u2", { confirmed: true, status: "approved" });
      await help("anonymous", "u3", "u4", { confirmed: true, status: "approved" });
      await help("private", "u3", "u1", { confirmed: true, status: "approved", visibility: "private" });
      await local.db.insert(builderPrivacy).values([
        { userId: "u1", peerMentionsOk: true },
        { userId: "u2", peerMentionsOk: true },
        { userId: "u3", peerMentionsOk: true },
      ]);

      const relay = await getRelayOverview(local.db, "u1");
      expect(relay.awaiting.map((item) => item.otherName)).toEqual(["Member u2"]);
      expect(relay.given).toHaveLength(1);
      expect(relay.given[0]).toMatchObject({ otherName: "Member u2", confirmed: true, status: "approved" });

      const feed = Object.fromEntries(relay.feed.map((item) => [item.title.split("(")[1], item]));
      expect(Object.keys(feed).sort()).toEqual(["anonymous)", "named)"]);
      expect(feed["named)"]).toMatchObject({ helperName: "Member u1", helpedName: "Member u2" });
      expect(feed["anonymous)"]).toMatchObject({ helperName: null, helpedName: null });
      // Private help still counts towards the totals, it is just not shown.
      expect(relay.totals).toEqual({ confirmed: 3, builders: 4 });
    } finally {
      await local.dispose();
    }
  });
});
