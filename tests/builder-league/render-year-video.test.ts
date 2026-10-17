import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCards, cardDuration, writeComposition } from "../../scripts/builder-league/render-year-video";

const labels = {
  kicker: "Your year among the stars",
  titleTemplate: "{name}'s {year} among the stars",
  unknownName: "A builder",
  outroTitle: "Chart your own year",
  outroBody: "Join the builders.",
  status: { provisional: "Provisional", final: "Final" },
  milestones: "Verified milestones",
  projects: "Projects",
  activeWeeks: "Active weeks",
  scenes: { first_idea: { title: "The first point of light", caption: "Where the year began." }, next_year: { title: "Next year's star", caption: "What next." } },
  archetypes: { maker: "The Maker" },
  eventTypes: { idea_logged: "Idea logged" },
  stages: {},
  ranks: {},
};

const claim = {
  job: { id: "job_1", year: 2026, format: "16x9" as const },
  lease: 1,
  displayName: "Ana <b>",
  review: {
    year: 2026,
    status: "final" as const,
    stats: { verifiedMilestones: 3, projects: 1, activeWeeks: 9 },
    milestones: [{ eventId: "e1", eventType: "idea_logged", localDate: "2026-01-04", projectName: "Atlas", title: null }],
    badges: [],
    ranks: [],
    nextYearNote: "Ship v2",
    scenes: [{ key: "first_idea", eventIds: ["e1"] }, { key: "next_year", eventIds: [] }],
    archetype: { key: "maker" },
  },
  labels: { en: labels, vi: labels },
  site: "https://nextlevelbuilder.io",
};

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

describe("render-year-video", () => {
  it("keeps the total length between 30 and 60 seconds", () => {
    for (const count of [3, 5, 8, 12]) {
      const total = cardDuration(count) * count;
      expect(total).toBeGreaterThanOrEqual(30);
      expect(total).toBeLessThanOrEqual(60);
    }
  });

  it("builds intro, one card per shared scene and outro from public fields", () => {
    const cards = buildCards(claim, "en");
    expect(cards.map((c) => c.title)).toEqual(["Ana <b>'s 2026 among the stars", "The first point of light", "Next year's star", "Chart your own year"]);
    expect(cards[1].facts).toEqual(["2026-01-04 · Idea logged · Atlas"]);
    expect(cards[2].body).toBe("“Ship v2”");
    expect(cards[3].facts).toEqual(["nextlevelbuilder.io"]);
  });

  it("writes escaped scene files, captions and a timed composition", () => {
    dir = mkdtempSync(join(tmpdir(), "nlb-render-test-"));
    const { scenes, duration, size } = writeComposition(dir, claim, "en");
    expect(size).toEqual({ width: 1920, height: 1080 });
    expect(scenes).toHaveLength(4);
    const intro = readFileSync(scenes[0], "utf8");
    expect(intro).toContain("Ana &lt;b&gt;");
    expect(intro).not.toContain("<b>");
    expect(intro).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(readFileSync(join(dir, "captions.srt"), "utf8")).toContain("00:00:00,000 --> ");
    expect(readFileSync(join(dir, "composition.html"), "utf8")).toContain(`data-duration="${duration.toFixed(2)}"`);
  });
});
