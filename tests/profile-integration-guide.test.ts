import { register } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import { MCP_ENDPOINT, mcpEndpoint } from "@/lib/discovery/agent-discovery-documents";

// Same Next.js subpath mapping as the homepage render smoke test (next-intl imports `next/navigation` bare).
const NEXT_SUBPATH_RESOLVER = `
export async function resolve(specifier, context, next) {
  if (/^next\\/(server|navigation|headers|link|image)$/.test(specifier)) return next(specifier + ".js", context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(NEXT_SUBPATH_RESOLVER)}`);

let Guide: ComponentType<{ mcpUrl: string }>;

beforeAll(async () => {
  ({ default: Guide } = await import("@/components/profile/developer-integration-guide"));
});

/* eslint-disable react/no-children-prop */
function render(locale: "en" | "vi", mcpUrl = MCP_ENDPOINT) {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale,
    messages: locale === "en" ? en : vi,
    timeZone: "UTC",
    onError: (error: Error) => {
      throw error;
    },
    children: createElement(Guide, { mcpUrl }),
  }));
}
/* eslint-enable react/no-children-prop */

describe("profile developer integration guide", () => {
  it("leads with the hosted MCP endpoint and keeps the API key tools as the alternative", () => {
    const html = render("en");
    const remote = html.indexOf("claude mcp add --transport http nlb-directory https://nextlevelbuilder.io/mcp");
    const details = html.indexOf("<details");
    expect(remote).toBeGreaterThan(-1);
    expect(details).toBeGreaterThan(remote);
    expect(html.indexOf("@nextlevelbuilder/mcp")).toBeGreaterThan(details);
    expect(html.indexOf("NLB_API_KEY")).toBeGreaterThan(details);
    expect(html).toContain('href="/oauth/connections"');
  });

  it("renders the endpoint it is given, in both locales", () => {
    const staging = "https://staging.nextlevelbuilder.io/mcp";
    expect(render("vi", staging)).toContain(`&quot;url&quot;: &quot;${staging}&quot;`);
    expect(render("vi")).toContain("Khuyên dùng");
    expect(mcpEndpoint("https://nextlevelbuilder.io")).toBe("https://nextlevelbuilder.io/mcp");
  });

  it("names every copy button and announces copies", () => {
    const html = render("en");
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(5);
    for (const button of buttons) expect(button).toMatch(/aria-label="[^"]+"/);
    expect(html.match(/role="status"/g)).toHaveLength(5);
    expect(html).toContain("NLB_ORG_ID");
  });
});
