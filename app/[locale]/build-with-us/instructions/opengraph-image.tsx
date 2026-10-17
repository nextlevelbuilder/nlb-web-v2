import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { navLabel } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Build with us: API and AI integration guide";

/** Mirrors the page metadata, which is English-only on this page. */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return renderConstellationOgCard({
    numeral: "VII",
    kicker: await navLabel(locale, "buildWithUs"),
    title: "API & AI integration guide",
    subtitle: "Design product pages with content blocks, WebMCP, HTTP MCP and the REST API, then submit from your terminal or your agent.",
    meta: ["REST", "MCP", "CLI"],
  });
}
