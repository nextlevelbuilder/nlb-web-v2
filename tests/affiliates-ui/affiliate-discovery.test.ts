import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";
import { GET as llms } from "@/app/llms.txt/route";
import { GET as llmsFull } from "@/app/llms-full.txt/route";
import { getAllPublishedProducts } from "@/lib/domain/catalog";
import { fetchPageMarkdown } from "@/lib/markdown/page-markdown";
import { isPrivatePage, markdownSourcePath, pagePath } from "@/lib/markdown/page-paths";
import enMessages from "@/messages/en.json";
import viMessages from "@/messages/vi.json";

vi.mock("@/lib/domain/catalog", () => ({ getAllPublishedProducts: vi.fn(), getPublishedProductBySlug: vi.fn() }));
vi.mock("@/lib/markdown/page-markdown", () => ({ fetchPageMarkdown: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test");
  vi.stubEnv("LIVE_ENABLED", "false");
  vi.mocked(getAllPublishedProducts).mockResolvedValue([]);
  vi.mocked(fetchPageMarkdown).mockResolvedValue({ status: 200, body: "# Page\n" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const fetchedPaths = () => vi.mocked(fetchPageMarkdown).mock.calls.map((call) => String(call[1]));

describe("affiliate discovery with the program flag off", () => {
  beforeEach(() => vi.stubEnv("AFFILIATES_ENABLED", "false"));

  it("keeps /affiliates out of the sitemap, llms.txt, llms-full.txt and markdown twins", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => /\/affiliates$/.test(url))).toBe(false);
    expect(await (await llms()).text()).not.toContain("/affiliates");
    await llmsFull();
    expect(fetchedPaths().some((path) => path.endsWith("/affiliates"))).toBe(false);
    expect(markdownSourcePath("/affiliates.md")).toBeNull();
    expect(pagePath("/vi/affiliates")).toBeNull();
  });
});

describe("affiliate discovery with the program flag on", () => {
  beforeEach(() => vi.stubEnv("AFFILIATES_ENABLED", "true"));

  it("lists the landing in both locales with hreflang alternates", async () => {
    const entries = await sitemap();
    const landing = entries.find((entry) => entry.url === "https://example.test/affiliates");
    expect(landing?.alternates?.languages).toMatchObject({ vi: "https://example.test/vi/affiliates", "x-default": "https://example.test/affiliates" });
    expect(entries.some((entry) => entry.url === "https://example.test/vi/affiliates")).toBe(true);
    expect(entries.some((entry) => entry.url.includes("/account/referrals"))).toBe(false);
  });

  it("advertises the .md twin in llms.txt and includes both locales in llms-full.txt", async () => {
    expect(await (await llms()).text()).toContain("[Affiliate program](https://example.test/affiliates.md)");
    await llmsFull();
    expect(fetchedPaths()).toEqual(expect.arrayContaining(["/affiliates", "/vi/affiliates"]));
  });

  it("serves markdown twins for the landing only, never for the private dashboard", () => {
    expect(markdownSourcePath("/affiliates.md")).toEqual({ path: "/affiliates", pathname: "/affiliates", locale: "en" });
    expect(markdownSourcePath("/vi/affiliates.md")).toEqual({ path: "/affiliates", pathname: "/vi/affiliates", locale: "vi" });
    expect(markdownSourcePath("/account/referrals.md")).toBeNull();
    expect(markdownSourcePath("/affiliates/x.md")).toBeNull();
    expect(isPrivatePage("/affiliates")).toBe(false);
  });

  it("lists the affiliate agreement among the policy pages", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toEqual(expect.arrayContaining(["https://example.test/policies/affiliate-agreement", "https://example.test/vi/policies/affiliate-agreement"]));
  });
});

type Tree = { [key: string]: string | Tree };

function keyPaths(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === "string" ? [`${prefix}${key}`] : keyPaths(value, `${prefix}${key}.`)));
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
}

describe("affiliate copy", () => {
  it.each(["affiliates", "affiliateAccount", "affiliateCheckout"] as const)("%s has the same keys and placeholders in EN and VI", (namespace) => {
    const enTree = (enMessages as unknown as Record<string, Tree>)[namespace];
    const viTree = (viMessages as unknown as Record<string, Tree>)[namespace];
    const enKeys = keyPaths(enTree);
    expect(enKeys.length).toBeGreaterThan(0);
    expect(keyPaths(viTree)).toEqual(enKeys);
    const lookup = (tree: Tree, path: string) => path.split(".").reduce<string | Tree>((node, part) => (node as Tree)[part], tree) as string;
    for (const path of enKeys) {
      expect(lookup(viTree, path).trim(), path).not.toBe("");
      expect(placeholders(lookup(viTree, path)), path).toEqual(placeholders(lookup(enTree, path)));
    }
  });
});
