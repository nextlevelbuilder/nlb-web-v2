import { describe, expect, it } from "vitest";
import { formatCelestialCoord } from "@/lib/constellation/celestial-coords";
import { computeDirectoryPlot } from "@/lib/constellation/directory-plot";
import { splitRichWords } from "@/lib/constellation/split-text-parse";
import { CONSTELLATION_ANCHORS, CONSTELLATION_EDGES, CONSTELLATION_MAGNITUDES, seededRandom } from "@/lib/constellation/geometry";
import { buildHomeLeaderboard, votesFromRanks } from "@/lib/home/home-leaderboard";
import { pickLatestCourseVideos, type HomeCourseVideo } from "@/lib/home/home-course-videos";

describe("formatCelestialCoord", () => {
  it("maps the viewport to RA 0h..24h and Dec +90°..−90°", () => {
    expect(formatCelestialCoord(0, 0, 1440, 900)).toBe("RA 00h 00m 00s · Dec +90° 00′");
    expect(formatCelestialCoord(720, 450, 1440, 900)).toBe("RA 12h 00m 00s · Dec +00° 00′");
    expect(formatCelestialCoord(360, 675, 1440, 900)).toBe("RA 06h 00m 00s · Dec −45° 00′");
  });

  it("clamps positions outside the viewport and survives a zero-sized window", () => {
    expect(formatCelestialCoord(5000, 5000, 1440, 900)).toMatch(/^RA 23h 59m 59s · Dec −90° 00′$/);
    expect(formatCelestialCoord(-10, -10, 1440, 900)).toBe("RA 00h 00m 00s · Dec +90° 00′");
    expect(formatCelestialCoord(10, 10, 0, 0)).toMatch(/^RA \d{2}h \d{2}m \d{2}s · Dec [+−]\d{2}° \d{2}′$/);
  });
});

describe("splitRichWords", () => {
  it("splits words and marks the <em> run", () => {
    expect(splitRichWords("Find your <em>constellation.</em>")).toEqual([
      { text: "Find", em: false },
      { text: "your", em: false },
      { text: "constellation.", em: true },
    ]);
  });

  it("keeps non-breaking spaces inside a word and decodes entities", () => {
    const words = splitRichWords("Tìm <em>chòm sao</em> của bạn &amp; more");
    expect(words.map((w) => w.text)).toEqual(["Tìm", "chòm sao", "của bạn", "&", "more"]);
    expect(words[1].em).toBe(true);
    expect(words[2].em).toBe(false);
  });

  it("treats other markup as text and ignores empty input", () => {
    expect(splitRichWords("")).toEqual([]);
    expect(splitRichWords("<b>bold</b>")).toEqual([{ text: "<b>bold</b>", em: false }]);
  });
});

describe("computeDirectoryPlot", () => {
  const plot = computeDirectoryPlot([
    { trust: 96, votes: 412 },
    { trust: 93, votes: 287 },
    { trust: 87, votes: 163 },
  ]);

  it("keeps every star inside the chart frame", () => {
    for (const s of plot.stars) {
      expect(s.x).toBeGreaterThanOrEqual(plot.left);
      expect(s.x).toBeLessThanOrEqual(plot.right);
      expect(s.y).toBeGreaterThanOrEqual(plot.top);
      expect(s.y).toBeLessThanOrEqual(plot.bottom);
    }
  });

  it("draws higher Trust higher and brighter, more votes further right", () => {
    const [a, b, c] = plot.stars;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    expect(a.r).toBeGreaterThan(c.r);
    expect(a.opacity).toBeGreaterThan(c.opacity);
    expect(a.x).toBeGreaterThan(b.x);
    expect(a.labelAnchor).toBe("end"); // right half labels to the left
  });

  it("uses descending trust ticks and a matching chain", () => {
    const values = plot.trustTicks.map((t) => t.value);
    expect(values).toHaveLength(5);
    expect([...values].sort((x, y) => y - x)).toEqual(values);
    expect(values[0]).toBeLessThanOrEqual(100);
    expect(plot.chain.split(" ")).toHaveLength(3);
  });

  it("labels the vote axis with whole numbers, even with no votes yet", () => {
    for (const entries of [[{ trust: 70, votes: 0 }], [{ trust: 90, votes: 3 }], [{ trust: 96, votes: 412 }]]) {
      const ticks = computeDirectoryPlot(entries).voteTicks;
      expect(ticks.length).toBeGreaterThan(0);
      for (const t of ticks) expect(Number.isInteger(t.value)).toBe(true);
    }
  });

  it("handles no entries, zero votes and invalid numbers", () => {
    expect(computeDirectoryPlot([]).stars).toEqual([]);
    const odd = computeDirectoryPlot([{ trust: Number.NaN, votes: -5 }, { trust: 140, votes: 0 }]);
    for (const s of odd.stars) {
      expect(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.r)).toBe(true);
    }
  });
});

describe("home leaderboard", () => {
  const products = [
    { id: "a", slug: "a", title: "Alpha", tagline: "", trustScore: 90.4 },
    { id: "b", slug: "b", title: "Beta", tagline: "", trustScore: 95 },
    { id: "c", slug: "c", title: "Gamma", tagline: "", trustScore: 95 },
  ];

  it("reads votes from snapshot ranks and ignores malformed rows", () => {
    const votes = votesFromRanks([{ productId: "a", voteCount: 3 }, { productId: "b", voteCount: "x" }, null, { productId: 4 }, { productId: "c", voteCount: -1 }]);
    expect([...votes]).toEqual([["a", 3]]);
    expect(votesFromRanks("nope").size).toBe(0);
  });

  it("orders by votes, then Trust, then title, and caps the size", () => {
    const board = buildHomeLeaderboard(products, [{ productId: "a", voteCount: 5 }], 2);
    expect(board.map((e) => e.slug)).toEqual(["a", "b"]);
    expect(board[0]).toMatchObject({ votes: 5, trustScore: 90 });
    expect(buildHomeLeaderboard(products, null).map((e) => e.slug)).toEqual(["b", "c", "a"]);
  });
});

describe("pickLatestCourseVideos", () => {
  const v = (slug: string, locale: "en" | "vi", weekNumber: number | null, publishedAt: number): HomeCourseVideo => ({
    slug, title: slug, locale, weekNumber, durationSec: 600, priceCents: 900, currency: "USD", thumbnailUrl: null, publishedAt,
  });

  it("prefers the visitor's language, then the latest week and publish date", () => {
    const videos = [v("en-1", "en", 1, 1), v("vi-3", "vi", 3, 3), v("en-2", "en", 2, 2), v("en-x", "en", null, 9)];
    expect(pickLatestCourseVideos(videos, "en").map((x) => x.slug)).toEqual(["en-2", "en-1", "en-x"]);
    expect(pickLatestCourseVideos(videos, "vi").map((x) => x.slug)).toEqual(["vi-3", "en-2", "en-1"]);
    expect(pickLatestCourseVideos([], "en")).toEqual([]);
  });
});

describe("NLB constellation geometry", () => {
  it("keeps edges pointing at real anchors with one magnitude per anchor", () => {
    expect(CONSTELLATION_MAGNITUDES).toHaveLength(CONSTELLATION_ANCHORS.length);
    for (const [a, b] of CONSTELLATION_EDGES) {
      expect(CONSTELLATION_ANCHORS[a]).toBeDefined();
      expect(CONSTELLATION_ANCHORS[b]).toBeDefined();
    }
  });

  it("produces the same deterministic sequence for a seed", () => {
    const a = seededRandom(20261013);
    const b = seededRandom(20261013);
    const seq = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seq);
    for (const n of seq) expect(n >= 0 && n < 1).toBe(true);
  });
});
