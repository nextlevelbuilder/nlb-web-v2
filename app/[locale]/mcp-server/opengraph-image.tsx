import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { toOgLocale } from "@/lib/og/og-route-helpers";
import { mcpServerCopy } from "@/content/pages/mcp-server-copy";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Next Level Builders official MCP server";

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const copy = mcpServerCopy[toOgLocale((await params).locale)];
  return renderConstellationOgCard({ numeral: "VII", kicker: copy.plate, title: copy.metaTitle, subtitle: copy.metaDescription });
}
