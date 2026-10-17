import { afterEach, describe, expect, it, vi } from "vitest";
import { extractOgImage, loadFeaturedLabCourses, parseLabCoursesMarkdown } from "@/lib/courses/sidebar/fetch-200lab-courses";
import { loadZueyArticles, parseZueyArticles, zueyArticlesEndpoint, zueyArticleUrl } from "@/lib/courses/sidebar/fetch-zuey-knowledges";
import { withSidebarUtm } from "@/lib/courses/sidebar/utm-link";
import { getCoursesCopy } from "@/lib/courses/courses-copy";

// Real lines from https://200lab.io/courses.md (2026-10-14), descriptions shortened.
const FREE_LINE = "- [Hành trang cho vibe coder - git, frontend, backend, secret, cách tổ chức dữ liệu, test và CI](https://200lab.io/courses/hanh-trang-cho-vibe-coder-git-frontend-backend-secret-cach-to-chuc-du-lieu-test-va-ci.md): Khóa nền cho vibe coder đã dựng app bằng Claude Code hay Codex: agent viết code rồi, ai giữ cho app chạy ổn? · 17 bài học · Miễn phí";
const PRICED_LINE = "- [Prompt và Context Engineering cho coding agent - brief, spec, AGENTS.md, session và bằng chứng](https://200lab.io/courses/prompt-va-context-engineering-cho-coding-agent-brief-spec-agents-md-session-va-bang-chung.md): Khóa về prompt và context · cho vibe coder · 18 bài học · Đang mở bán, giá từ 139.000 ₫";
const QUOTED_LINE = "- [Hiểu chuẩn dữ liệu để \"Giao tiếp\" hiệu quả với AI](https://200lab.io/courses/tim-hieu-cac-file-du-lieu-thuong-gap-json-jsonl-csv-yaml-va-markdown-frontmatter.md): Khoá nền tảng miễn phí cho người không lập trình. · 8 bài học · Miễn phí";

const MARKDOWN = [
  "# Khóa học 200Lab",
  "",
  "> Các khóa học đang mở, mới nhất trước.",
  "",
  FREE_LINE,
  PRICED_LINE,
  QUOTED_LINE,
  "- [Broken](https://200lab.io/courses/broken.md): no lesson count here",
  "- [Wrong host](https://evil.example/courses/x.md): desc · 3 bài học · Miễn phí",
  "- [Unknown status](https://200lab.io/courses/soon.md): desc · 3 bài học · Sắp mở",
  "- [Zero lessons](https://200lab.io/courses/zero.md): desc · 0 bài học · Miễn phí",
  "",
  "Sitemap: https://200lab.io/sitemaps/courses.xml",
].join("\n");

describe("parseLabCoursesMarkdown", () => {
  it("parses free, priced and quoted titles, anchored on the last separators", () => {
    const courses = parseLabCoursesMarkdown(MARKDOWN);
    expect(courses).toHaveLength(3);
    expect(courses[0]).toMatchObject({
      title: "Hành trang cho vibe coder - git, frontend, backend, secret, cách tổ chức dữ liệu, test và CI",
      url: "https://200lab.io/courses/hanh-trang-cho-vibe-coder-git-frontend-backend-secret-cach-to-chuc-du-lieu-test-va-ci",
      lessons: 17,
      priceVnd: null,
      imageUrl: null,
    });
    expect(courses[1]).toMatchObject({ lessons: 18, priceVnd: 139000, description: "Khóa về prompt và context · cho vibe coder" });
    expect(courses[2].title).toBe('Hiểu chuẩn dữ liệu để "Giao tiếp" hiệu quả với AI');
  });

  it("returns nothing for unrelated text", () => {
    expect(parseLabCoursesMarkdown("<html>oops</html>")).toEqual([]);
  });

  it("formats the price per locale", () => {
    expect(getCoursesCopy("en").labPrice(139000)).toBe("from 139,000 ₫");
    expect(getCoursesCopy("vi").labPrice(139000)).toBe("từ 139.000 ₫");
    expect(getCoursesCopy("en").labPrice(null)).toBe("Free");
    expect(getCoursesCopy("vi").labPrice(null)).toBe("Miễn phí");
  });
});

describe("extractOgImage", () => {
  it("reads og:image regardless of attribute order and entities", () => {
    expect(extractOgImage('<head><meta property="og:title" content="x"/><meta property="og:image" content="https://assets.200lab.io/sha256/7d/abc?a=1&amp;b=2"/></head>'))
      .toBe("https://assets.200lab.io/sha256/7d/abc?a=1&b=2");
    expect(extractOgImage("<meta content='https://cdn.example/a.png' property='og:image'>")).toBe("https://cdn.example/a.png");
  });

  it("rejects missing, relative and non-https images", () => {
    expect(extractOgImage("<meta property=\"og:image:alt\" content=\"x\">")).toBeNull();
    expect(extractOgImage('<meta property="og:image" content="/img.png">')).toBeNull();
    expect(extractOgImage('<meta property="og:image" content="http://insecure.example/a.png">')).toBeNull();
    expect(extractOgImage('<meta property="og:image" content="javascript:alert(1)">')).toBeNull();
  });
});

const article = (overrides: Record<string, unknown> = {}) => ({
  slug: "ai-solo-vs-ai-gang",
  locale: "en",
  title: "  AI SOLO vs AI GANG  ",
  excerpt: "x",
  published_at: "2026-10-12T07:25:15.346Z",
  cover_url: "https://media.zuey.me/blog/2026/a.webp",
  reading_minutes: 8,
  access: "free",
  tags: ["AI"],
  ...overrides,
});

describe("parseZueyArticles", () => {
  it("builds article URLs, trims titles and flags members-only access", () => {
    const [free, members] = parseZueyArticles({ success: true, data: [article(), article({ slug: "models-loops", access: "knowledges", cover_url: null, reading_minutes: null })] });
    expect(free).toEqual({
      title: "AI SOLO vs AI GANG",
      url: "https://zuey.me/articles/ai-solo-vs-ai-gang?lang=en",
      publishedAt: "2026-10-12T07:25:15.346Z",
      readingMinutes: 8,
      coverUrl: "https://media.zuey.me/blog/2026/a.webp",
      membersOnly: false,
    });
    expect(members).toMatchObject({ url: "https://zuey.me/articles/models-loops?lang=en", membersOnly: true, coverUrl: null, readingMinutes: null });
  });

  it("drops invalid items and rejects a bad envelope", () => {
    const data = [article({ slug: "../etc" }), article({ cover_url: "http://insecure/a.png" }), article({ published_at: "yesterday" }), article({ reading_minutes: -1 }), article({ title: "" }), article()];
    expect(parseZueyArticles({ success: true, data })).toHaveLength(1);
    expect(parseZueyArticles({ success: false, data: [article()] })).toEqual([]);
    expect(parseZueyArticles(null)).toEqual([]);
  });

  it("builds the endpoint and article URLs", () => {
    expect(zueyArticlesEndpoint("vi")).toBe("https://zuey.me/api/v1/articles?sort=new&limit=5&lang=vi");
    expect(zueyArticleUrl("a-b", "vi")).toBe("https://zuey.me/articles/a-b?lang=vi");
  });
});

describe("withSidebarUtm", () => {
  it("appends UTM params and keeps the existing query and hash", () => {
    expect(withSidebarUtm("https://zuey.me/articles/a?lang=vi#top"))
      .toBe("https://zuey.me/articles/a?lang=vi&utm_source=nextlevelbuilder&utm_medium=referral&utm_campaign=courses_sidebar#top");
  });

  it("does not duplicate params when applied twice or when one already exists", () => {
    const once = withSidebarUtm("https://200lab.io/courses?utm_source=other");
    expect(withSidebarUtm(once)).toBe(once);
    expect(new URL(once).searchParams.getAll("utm_source")).toEqual(["nextlevelbuilder"]);
  });

  it("leaves non-absolute or non-http values untouched", () => {
    expect(withSidebarUtm("/courses")).toBe("/courses");
    expect(withSidebarUtm("mailto:a@b.c")).toBe("mailto:a@b.c");
  });
});

describe("source loaders (mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("attaches og:image best effort and limits the featured list to four", async () => {
    const lines = Array.from({ length: 6 }, (_, i) => `- [Course ${i}](https://200lab.io/courses/c-${i}.md): d · ${i + 1} bài học · Miễn phí`).join("\n");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).get("User-Agent")).toMatch(/NextLevelBuilder/);
      if (url === "https://200lab.io/courses.md") return new Response(lines);
      if (url.endsWith("c-1")) return new Response("down", { status: 503 });
      return new Response(`<meta property="og:image" content="https://assets.200lab.io/${url.split("/").pop()}.png">`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const courses = await loadFeaturedLabCourses();
    expect(courses.map((c) => c.imageUrl)).toEqual(["https://assets.200lab.io/c-0.png", null, "https://assets.200lab.io/c-2.png", "https://assets.200lab.io/c-3.png"]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("throws when a source returns nothing usable so the cache can serve stale data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json")));
    await expect(loadZueyArticles("en")).rejects.toThrow(/not valid JSON/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("# empty")));
    await expect(loadFeaturedLabCourses()).rejects.toThrow(/no parseable courses/);
  });
});
