import { eq } from "drizzle-orm";
import { renderConstellationOgCard } from "@/lib/og/constellation-og-card";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { navLabel, toOgLocale } from "@/lib/og/og-route-helpers";

export { contentType, size } from "@/lib/og/og-route-helpers";
export const alt = "Builder profile on Next Level Builders";

export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const kicker = await navLabel(locale, "directory");
  const [builder] = id.length <= 128 ? await getDb().select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1) : [];
  if (!builder) return renderConstellationOgCard({ numeral: "IV", kicker, title: "Next Level Builders" });
  const subtitle = toOgLocale(locale) === "vi" ? `Hồ sơ builder và sản phẩm đã xuất bản của ${builder.name}.` : `Published products and builder profile for ${builder.name}.`;
  return renderConstellationOgCard({ numeral: "IV", kicker, title: builder.name, subtitle });
}
