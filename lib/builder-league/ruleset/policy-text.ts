/**
 * Policy copy generated from the effective ruleset, so the published RP table and rank conditions can
 * never drift from what the ledger scores. `content/policies/*` import these strings.
 */
import type { EventTypeKey, Stage } from "../types";
import type { CapRule, EventDefinition, RankGate, Ruleset } from "./types";
import { rulesetV2 } from "./v2";

export type PolicyLocale = "en" | "vi";

/** Display name of every event type, per locale. The single source for policy pages and evidence UI. */
export const EVENT_LABELS: Record<EventTypeKey, Record<PolicyLocale, string>> = {
  validate_problem_signal: { en: "Problem signal with evidence", vi: "Tín hiệu vấn đề có bằng chứng" },
  validate_interviews: { en: "Customer interviews written up", vi: "Phỏng vấn khách hàng có ghi chép" },
  validate_waitlist: { en: "Waitlist or landing page with real sign-ups", vi: "Waitlist hoặc landing page có người đăng ký thật" },
  validate_wtp_commitment: { en: "Willingness-to-pay commitment", vi: "Cam kết sẵn sàng trả tiền" },
  validate_stop_pivot: { en: "Documented stop or pivot decision", vi: "Quyết định dừng hoặc pivot có ghi lại lý do" },
  build_scope_cut: { en: "Scope cut with rationale", vi: "Cắt scope có lý do rõ ràng" },
  build_mvp: { en: "Working MVP", vi: "MVP chạy được" },
  build_first_real_user: { en: "First real user", vi: "Người dùng thật đầu tiên" },
  build_feedback_improvement: { en: "Improvement shipped from user feedback", vi: "Cải tiến dựa trên feedback người dùng" },
  ship_public_post: { en: "SHIP a public post", vi: "SHIP một bài public" },
  ship_highlighted_post: { en: "SHIP gets highlighted", vi: "Bài SHIP được highlight" },
  ship_product_launch: { en: "Product launch", vi: "Ra mắt sản phẩm" },
  ship_first_payment: { en: "First payment from a customer", vi: "Khoản thanh toán đầu tiên từ khách hàng" },
  ship_distribution_case_study: { en: "Distribution case study", vi: "Case study về phân phối" },
  contribute_peer_help: { en: "Help a member (confirmed by them)", vi: "Giúp một thành viên (người được giúp xác nhận)" },
  contribute_weekly_feedback: { en: "Feedback Weekly", vi: "Feedback Weekly" },
  contribute_contributor_work: { en: "Contributor work", vi: "Công việc Contributor" },
  contribute_discord_active: { en: "Active in Discord", vi: "Hoạt động trên Discord" },
  contribute_featured: { en: "Featured contribution", vi: "Đóng góp nổi bật" },
};

const STAGE_LABELS: Record<Stage, string> = { validate: "VALIDATE", build: "BUILD", ship: "SHIP", contribute: "CONTRIBUTE" };

const RANK_LABELS: Record<RankGate["rank"], Record<PolicyLocale, string>> = {
  apprentice: { en: "Apprentice (Gray)", vi: "Apprentice (Xám)" },
  builder: { en: "Builder (Green)", vi: "Builder (Xanh lá)" },
  architect: { en: "Architect (Blue)", vi: "Architect (Xanh dương)" },
  master: { en: "Master (Purple)", vi: "Master (Tím)" },
  legend: { en: "Legend (Gold)", vi: "Legend (Vàng)" },
};

const WINDOW_LABELS: Record<Exclude<CapRule["window"], "lifetime">, Record<PolicyLocale, string>> = {
  week: { en: "week", vi: "tuần" },
  month: { en: "month", vi: "tháng" },
  year: { en: "year", vi: "năm" },
};

/** A cap rule in words, e.g. "max 4/week" or "once per project". */
export function describeCap(cap: CapRule, locale: PolicyLocale): string {
  const vi = locale === "vi";
  if (cap.window === "lifetime") {
    if (cap.max === 1) return vi ? "1 lần mỗi dự án" : "once per project";
    return vi ? `tối đa ${cap.max} lần mỗi dự án` : `max ${cap.max} per project`;
  }
  const window = WINDOW_LABELS[cap.window][locale];
  if (cap.per === "project") return vi ? `tối đa ${cap.max}/${window} mỗi dự án` : `max ${cap.max}/${window} per project`;
  if (cap.per === "counterparty") return vi ? `tối đa ${cap.max}/${window} cho cùng một người` : `max ${cap.max}/${window} for the same person`;
  return vi ? `tối đa ${cap.max}/${window}` : `max ${cap.max}/${window}`;
}

/** The definition of an event the ruleset must contain (policy copy quotes it). */
export function requireEvent(key: EventTypeKey, ruleset: Ruleset = rulesetV2): EventDefinition {
  const event = ruleset.events[key];
  if (!event) throw new Error(`Ruleset ${ruleset.version} does not define ${key}.`);
  return event;
}

/** Calendar date of an ISO timestamp with a fixed offset, as written in the policy. */
export function effectiveDateLabel(iso: string, locale: PolicyLocale): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (locale === "vi") return `${Number(day)}/${Number(month)}/${year}`;
  const name = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${name} ${Number(day)}, ${year}`;
}

/** One line per event, grouped by stage in ruleset order: "• SHIP a public post: +10 RP (max 4/week)". */
export function describeRpTable(locale: PolicyLocale, ruleset: Ruleset = rulesetV2): string {
  const blocks: string[] = [];
  for (const stage of Object.keys(STAGE_LABELS) as Stage[]) {
    const lines = Object.values(ruleset.events)
      .filter((event) => event.stage === stage)
      .map((event) => {
        const caps = event.caps.map((cap) => describeCap(cap, locale)).join(", ");
        return `• ${EVENT_LABELS[event.key][locale]}: +${event.rp} RP${caps ? ` (${caps})` : ""}`;
      });
    if (lines.length) blocks.push(`${STAGE_LABELS[stage]}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

function describeGate(gate: RankGate, locale: PolicyLocale): string {
  const vi = locale === "vi";
  if (gate.minRp === 0 && gate.minTenureDays === 0) return vi ? "tự động khi mới tham gia" : "assigned when you join";
  const parts = [`≥${gate.minRp} RP`, vi ? `>${gate.minTenureDays} ngày` : `>${gate.minTenureDays} days`];
  if (gate.minShipCount) {
    const ship = vi ? `≥${gate.minShipCount} SHIP` : `≥${gate.minShipCount} SHIPs`;
    parts.push(
      gate.contributorWeeksAlternative
        ? vi
          ? `${ship} hoặc ≥${gate.contributorWeeksAlternative} tuần Contributor`
          : `${ship} or ≥${gate.contributorWeeksAlternative} Contributor weeks`
        : ship
    );
  }
  if (gate.minFeedbackRate) parts.push(`≥${Math.round(gate.minFeedbackRate * 100)}% feedback`);
  if (gate.minWeeklyCheckIns) parts.push(vi ? `≥${gate.minWeeklyCheckIns} lần check-in hàng tuần` : `≥${gate.minWeeklyCheckIns} weekly check-ins`);
  if (gate.minPeopleHelped) parts.push(vi ? `giúp ≥${gate.minPeopleHelped} thành viên` : `helped ≥${gate.minPeopleHelped} members`);
  if (gate.minHighlightedPosts) parts.push(vi ? `≥${gate.minHighlightedPosts} bài highlight` : `≥${gate.minHighlightedPosts} highlighted posts`);
  if (gate.requiresFeaturedOrContributor) parts.push(vi ? "Featured hoặc Contributor" : "Featured or Contributor");
  if (gate.minMentorNominations) parts.push(vi ? `được ≥${gate.minMentorNominations} Mentor đề cử` : `nominated by ≥${gate.minMentorNominations} Mentors`);
  if (gate.maxShareOfMembers) parts.push(vi ? `tối đa ${Math.round(gate.maxShareOfMembers * 100)}% thành viên` : `max ${Math.round(gate.maxShareOfMembers * 100)}% of members`);
  return parts.join(", ");
}

/** One line per rank: "• Builder (Green): ≥100 RP, >45 days, ...". */
export function describeRankGates(locale: PolicyLocale, ruleset: Ruleset = rulesetV2): string {
  return ruleset.ranks.map((gate) => `• ${RANK_LABELS[gate.rank][locale]}: ${describeGate(gate, locale)}`).join("\n");
}

/** Effective date and migration notice of the ruleset. */
export function rulesetNotice(locale: PolicyLocale, ruleset: Ruleset = rulesetV2): string {
  const date = effectiveDateLabel(ruleset.effectiveFrom, locale);
  return locale === "vi"
    ? `Áp dụng từ ${date} (giờ Việt Nam, bộ quy tắc ${ruleset.version}). RP bạn đã nhận trước ${date} được giữ nguyên; các hoạt động mới được tính điểm theo ${ruleset.version}; lịch sử điểm không bao giờ bị viết lại.`
    : `Effective ${date} (Vietnam time, ruleset ${ruleset.version}). RP earned before ${date} is kept; new events score under ${ruleset.version}; history is never rewritten.`;
}
