import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RULESETS,
  LATEST_RULESET_VERSION,
  SEASON_EPOCH,
  V2_EFFECTIVE_FROM,
  canonicalJson,
  getEffectiveRuleset,
  getRuleset,
  meetsVerification,
  rulesetChecksum,
  rulesetDefinition,
} from "@/lib/builder-league/ruleset";
import { describeRankGates, describeRpTable, effectiveDateLabel, rulesetNotice } from "@/lib/builder-league/ruleset/policy-text";
import { EVENT_TYPE_KEYS, STAGES } from "@/lib/builder-league/types";
import { communityOverviewPolicy } from "@/content/policies/community-overview";
import { membershipTiersPolicy } from "@/content/policies/membership-tiers";
import { shipPolicy } from "@/content/policies/ship-policy";
import { contributorPolicy } from "@/content/policies/contributor-policy";

const v1 = getRuleset("v1");
const v2 = getRuleset("v2");

function seededRulesets(): Map<string, { effectiveFrom: number; checksum: string; definition: string }> {
  const dir = path.resolve(import.meta.dirname, "../../drizzle/migrations");
  const sql = readFileSync(path.join(dir, "0002_builder_league.sql"), "utf8");
  const seeds = new Map<string, { effectiveFrom: number; checksum: string; definition: string }>();
  const pattern = /INSERT INTO `score_rulesets` .*? VALUES \('([^']+)', (\d+), '([0-9a-f]{64})', '((?:[^']|'')*)', \d+\);/g;
  for (const match of sql.matchAll(pattern)) {
    seeds.set(match[1], { effectiveFrom: Number(match[2]), checksum: match[3], definition: match[4].replace(/''/g, "'") });
  }
  return seeds;
}

describe("ruleset invariants", () => {
  it("lists versions in effective order and resolves the one in force", () => {
    expect(RULESETS.map((r) => r.version)).toEqual(["v1", "v2"]);
    expect(LATEST_RULESET_VERSION).toBe("v2");
    expect(v2.effectiveFrom).toBe(V2_EFFECTIVE_FROM);
    const effective = new Date(V2_EFFECTIVE_FROM);
    expect(getEffectiveRuleset(new Date(effective.getTime() - 1)).version).toBe("v1");
    expect(getEffectiveRuleset(effective).version).toBe("v2");
    expect(() => getRuleset("v9")).toThrow();
  });

  it("v2 defines every scoring event with a consistent definition", () => {
    expect(Object.keys(v2.events).sort()).toEqual([...EVENT_TYPE_KEYS].sort());
    for (const [key, event] of Object.entries(v2.events)) {
      expect(event.key).toBe(key);
      expect(key.startsWith(`${event.stage}_`)).toBe(true);
      expect(event.rp).toBeGreaterThan(0);
      expect(event.caps.length).toBeGreaterThan(0);
      for (const cap of event.caps) expect(cap.max).toBeGreaterThan(0);
      if (event.dedupeScope === "project") expect(event.caps).toContainEqual({ window: "lifetime", per: "project", max: 1 });
      // Every SHIP event and every award of 25 RP or more needs a moderator or the system.
      if (event.stage === "ship" || event.rp >= 25) expect(meetsVerification(event.requiredVerification, "moderator_verified")).toBe(true);
    }
    expect(v2.events.contribute_discord_active!.rp).toBe(3);
    expect(v2.events.contribute_featured!.rp).toBe(50);
    expect(v2.events.contribute_peer_help!.evidence.counterpartyConfirmation).toBe(true);
  });

  it("v1 keeps the legacy RP table", () => {
    const rp = Object.fromEntries(Object.values(v1.events).map((e) => [e.key, e.rp]));
    expect(rp).toEqual({
      ship_public_post: 10,
      ship_highlighted_post: 25,
      contribute_weekly_feedback: 5,
      contribute_discord_active: 3,
      contribute_peer_help: 8,
      contribute_contributor_work: 15,
      contribute_featured: 50,
      ship_product_launch: 100,
    });
  });

  it("levels, ranks and league weights follow the contract", () => {
    for (const r of RULESETS) {
      expect(r.level).toEqual({ base: 50, exponent: 1.6, maxLevel: 100 });
      expect(r.noAutoDowngrade).toBe(true);
      expect(r.seasonEpoch).toBe(SEASON_EPOCH);
      expect(r.ranks.map((g) => g.rank)).toEqual(["apprentice", "builder", "architect", "master", "legend"]);
      const minRps = r.ranks.map((g) => g.minRp);
      expect([...minRps].sort((a, b) => a - b)).toEqual(minRps);
      expect(r.ranks.find((g) => g.rank === "legend")!.minMentorNominations).toBeGreaterThanOrEqual(2);
      const weights = STAGES.map((s) => r.league.weights[s]);
      expect(weights).toEqual([0.35, 0.2, 0.35, 0.1]);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
    expect(SEASON_EPOCH).toBe("2026-10-19T00:00:00+07:00");
    expect(new Date(SEASON_EPOCH).getUTCDay()).toBe(0); // Sunday 17:00 UTC = Monday 00:00 local
  });

  it("checksums are stable, ignore effectiveFrom and match the migration seed", () => {
    const seeds = seededRulesets();
    expect([...seeds.keys()]).toEqual(["v1", "v2"]);
    for (const r of RULESETS) {
      const checksum = rulesetChecksum(r);
      expect(checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(rulesetChecksum({ ...r, effectiveFrom: "2030-01-01T00:00:00+07:00" })).toBe(checksum);
      const seed = seeds.get(r.version)!;
      expect(seed.checksum).toBe(checksum);
      expect(seed.effectiveFrom).toBe(new Date(r.effectiveFrom).getTime());
      expect(seed.definition).toBe(canonicalJson(rulesetDefinition(r)));
    }
    expect(rulesetChecksum(v1)).not.toBe(rulesetChecksum(v2));
  });
});

describe("policy copy matches ruleset v2", () => {
  const sections = (entry: typeof membershipTiersPolicy, locale: "en" | "vi") =>
    entry.content[locale].sections.map((s) => s.content).join("\n");

  it.each(["en", "vi"] as const)("publishes one RP table generated from the ruleset (%s)", (locale) => {
    const tiers = sections(membershipTiersPolicy, locale);
    expect(tiers).toContain(describeRpTable(locale));
    expect(tiers).toContain(describeRankGates(locale));
    for (const event of Object.values(v2.events)) expect(describeRpTable(locale)).toContain(`+${event.rp} RP`);
    // The overview links to the table instead of repeating it.
    const overview = sections(communityOverviewPolicy, locale);
    expect(overview).toContain(describeRankGates(locale));
    expect(overview).not.toContain(describeRpTable(locale));
  });

  it.each(["en", "vi"] as const)("states the effective date and migration notice (%s)", (locale) => {
    const notice = rulesetNotice(locale);
    expect(notice).toContain(effectiveDateLabel(V2_EFFECTIVE_FROM, locale));
    expect(sections(membershipTiersPolicy, locale)).toContain(notice);
    expect(sections(communityOverviewPolicy, locale)).toContain(notice);
  });

  it("keeps the SHIP commitment, the Contributor path and no-downgrade wording", () => {
    expect(sections(communityOverviewPolicy, "en")).toContain("SHIP at least 4 public posts/month OR be approved as a Contributor");
    expect(sections(communityOverviewPolicy, "vi")).toContain("SHIP tối thiểu 4 bài public/tháng HOẶC được duyệt làm Contributor");
    expect(sections(membershipTiersPolicy, "en")).toContain("No automatic downgrade");
    expect(sections(membershipTiersPolicy, "vi")).toContain("Không tự động hạ hạng");
    expect(sections(membershipTiersPolicy, "en")).toContain("Membership type (Premium or VIP) never changes your rank or your RP");
    expect(sections(shipPolicy, "en")).toContain(`+${v2.events.ship_public_post!.rp} RP`);
    expect(sections(contributorPolicy, "en")).toContain(`+${v2.events.contribute_contributor_work!.rp} RP`);
    expect(sections(contributorPolicy, "vi")).toContain(`+${v2.events.contribute_contributor_work!.rp} RP`);
  });

  it("formats the effective date per locale", () => {
    expect(effectiveDateLabel("2026-10-20T00:00:00+07:00", "en")).toBe("October 20, 2026");
    expect(effectiveDateLabel("2026-10-20T00:00:00+07:00", "vi")).toBe("20/10/2026");
  });
});
