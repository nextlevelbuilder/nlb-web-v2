import { getTranslations } from "next-intl/server";
import type { ProgramLevel } from "@/lib/referrals/types";
import { formatBps } from "./affiliate-format";
import { affiliateLevelName } from "./affiliate-level-name";

/** Levels with their thresholds and both budget columns, from the active program rules. */
export default async function AffiliateLevelTable({
  levels,
  locale,
  currentKey,
}: {
  levels: readonly ProgramLevel[];
  locale: string;
  /** Highlights the viewer's level on the dashboard. */
  currentKey?: string;
}) {
  const t = await getTranslations({ locale, namespace: "affiliates" });
  const sorted = [...levels].sort((a, b) => a.minCustomers - b.minCustomers);
  return (
    <div className="overflow-x-auto rounded-sm border border-line bg-surface">
      <table className="w-full min-w-[22rem] text-left text-step-sm">
        <caption className="sr-only">{t("levels.caption")}</caption>
        <thead className="bg-surface-raised">
          <tr className="mono-label text-ink-3">
            <th scope="col" className="p-3 font-normal">{t("levels.level")}</th>
            <th scope="col" className="p-3 font-normal">{t("levels.customers")}</th>
            <th scope="col" className="p-3 text-right font-normal">{t("levels.ordinary")}</th>
            <th scope="col" className="p-3 text-right font-normal">{t("levels.member")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((level) => {
            const current = level.key === currentKey;
            return (
              <tr key={level.key} className={current ? "bg-primary/10" : undefined} aria-current={current ? "true" : undefined}>
                <th scope="row" className="p-3 text-left font-display text-step-md font-normal text-foreground">
                  {affiliateLevelName(t, level.key)}
                </th>
                <td className="num-tab p-3 text-ink-2">{t("levels.customersFrom", { count: level.minCustomers })}</td>
                <td className="num-tab p-3 text-right text-foreground">{formatBps(level.ordinaryBudgetBps, locale)}</td>
                <td className="num-tab p-3 text-right text-primary">{formatBps(level.memberBudgetBps, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
