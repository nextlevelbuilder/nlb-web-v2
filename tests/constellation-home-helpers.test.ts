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


describe("computeDirectoryPlot sky map", () => {
  const entries = [
    { slug: "agentkit", trust: 70, votes: 0 },
    { slug: "3dviz-pro-max", trust: 60, votes: 0 },
    { slug: "ak-render", trust: 60, votes: 0 },
    { slug: "anymd", trust: 60, votes: 0 },
    { slug: "cloud-harness-mcp", trust: 60, votes: 0 },
  ];
  const plot = computeDirectoryPlot(entries);

  it("keeps every star and label inside the frame", () => {
    for (const s of plot.stars) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(plot.width);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(plot.height);
      expect(s.labelY).toBeGreaterThan(0);
      expect(s.labelY).toBeLessThan(plot.height);
    }
  });

  it("separates stars that share Trust and votes, marching left to right in rank order", () => {
    for (let i = 1; i < plot.stars.length; i++) {
      const a = plot.stars[i - 1];
      const b = plot.stars[i];
      expect(b.x).toBeGreaterThan(a.x);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(40);
      expect(Math.abs(b.y - a.y)).toBeGreaterThanOrEqual(38);
    }
    expect(plot.chain.split(" ")).toHaveLength(5);
  });

  it("is stable for the same products and brighter for higher Trust", () => {
    expect(computeDirectoryPlot(entries)).toEqual(plot);
    expect(plot.stars[0].r).toBeGreaterThan(plot.stars[1].r);
    expect(plot.stars[0].opacity).toBeGreaterThan(plot.stars[1].opacity);
  });

  it("gives labels their own lines", () => {
    const boxes = plot.stars.map((s) => ({ x: s.labelX, y: s.labelY, anchor: s.labelAnchor }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const span = (x: typeof a) => (x.anchor === "start" ? [x.x, x.x + 170] : [x.x - 170, x.x]);
        const overlapX = span(a)[0] < span(b)[1] && span(b)[0] < span(a)[1];
        if (overlapX) expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(17);
      }
    }
  });

  it("widens the glow with votes and handles empty or invalid input", () => {
    const voted = computeDirectoryPlot([{ slug: "a", trust: 80, votes: 10 }, { slug: "b", trust: 80, votes: 0 }]);
    expect(voted.stars[0].haloR).toBeGreaterThan(voted.stars[1].haloR);
    expect(computeDirectoryPlot([]).stars).toEqual([]);
    const odd = computeDirectoryPlot([{ slug: "", trust: Number.NaN, votes: -5 }, { slug: "x", trust: 140, votes: 0 }]);
    for (const s of odd.stars) expect(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.r)).toBe(true);
  });
});
