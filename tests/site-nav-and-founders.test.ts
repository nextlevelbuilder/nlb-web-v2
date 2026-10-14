import { describe, expect, it } from "vitest";
import { NAV, isCurrentNavItem } from "@/components/site/site-nav-items";
import { FOUNDERS, founderSameAs } from "@/lib/constants/home-content";

const item = (key: string) => {
  const found = NAV.find((entry) => entry.key === key);
  if (!found) throw new Error(`missing nav item ${key}`);
  return found;
};

describe("primary navigation", () => {
  it("lists every destination in the old site's order plus courses and blog", () => {
    expect(NAV.map((entry) => entry.key)).toEqual(["courses", "directory", "leaderboard", "blog", "pricing", "buildWithUs"]);
  });

  it("routes courses, directory, leaderboard and blog to real pages, never home anchors", () => {
    expect(item("courses").route).toBe("/courses");
    expect(NAV.filter((entry) => entry.homeAnchor).map((entry) => entry.key)).toEqual(["pricing"]);
    expect(item("directory").route).toBe("/build-with-us");
    expect(item("leaderboard").route).toBe("/leaderboards");
    expect(item("blog").route).toBe("/blog");
  });

  it("keeps pricing as an in-page anchor on home and /#pricing elsewhere", () => {
    expect(item("pricing")).toMatchObject({ homeAnchor: "#pricing", route: { pathname: "/", hash: "pricing" } });
  });

  it("marks the deepest owning item as current", () => {
    expect(isCurrentNavItem("/courses/week-1", item("courses"))).toBe(true);
    expect(isCurrentNavItem("/build-with-us", item("directory"))).toBe(true);
    expect(isCurrentNavItem("/build-with-us/instructions", item("directory"))).toBe(false);
    expect(isCurrentNavItem("/build-with-us/instructions", item("buildWithUs"))).toBe(true);
    expect(isCurrentNavItem("/blog/hello", item("blog"))).toBe(true);
    expect(isCurrentNavItem("/blogger", item("blog"))).toBe(false);
    expect(isCurrentNavItem("/", item("pricing"))).toBe(false);
  });
});

describe("founder Duy Nguyen", () => {
  const duy = FOUNDERS.find((founder) => founder.id === "duy");

  it("carries the /zuey/ phonetic", () => {
    expect(duy?.pronunciation).toBe("/zuey/");
  });

  it("links zuey.me, digitop.ai, T.O.P Group, Facebook and X in that order", () => {
    expect(duy?.links.map((link) => link.href)).toEqual([
      "https://zuey.me",
      "https://digitop.ai",
      "https://wearetopgroup.com",
      "https://facebook.com/mrgoonie",
      "https://x.com/goon_nguyen",
    ]);
    expect(duy?.links.at(-1)?.handle).toBe("@goon_nguyen");
  });

  it("exposes every profile as Person sameAs without duplicates", () => {
    expect(duy && founderSameAs(duy)).toHaveLength(5);
  });
});
