import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { CommunityMetricKey } from "@/lib/builder-league/community-wrapped";

/** Public Community Wrapped and the shared view of a member's Year in Review. */
export interface WrappedCopy {
  community: {
    metaTitle: (year: number) => string;
    metaDescription: (year: number) => string;
    eyebrow: (year: number) => string;
    title: (year: number) => string;
    lede: string;
    status: { provisional: string; final: string };
    statusNote: { provisional: string; final: string };
    metrics: Record<CommunityMetricKey, { label: string; unit: string }>;
    membersHelped: (n: number) => string;
    share: (value: number, total: number) => string;
    suppressed: (min: number) => string;
    methodHeading: string;
    method: (min: number) => string;
    source: (types: string, verification: string) => string;
    timeframe: (start: string, end: string, tz: string) => string;
    backfill: (n: number) => string;
    versionMeta: (version: number, created: string) => string;
    hallOfFame: string;
    cta: string;
  };
  shared: {
    metaTitle: (name: string, year: number) => string;
    metaDescription: (year: number) => string;
    eyebrow: (year: number) => string;
    title: (name: string, year: number) => string;
    lede: string;
    unknownName: string;
    cta: string;
    ctaBody: string;
    communityLink: (year: number) => string;
  };
}

const en: WrappedCopy = {
  community: {
    metaTitle: (year) => `NLB Community Wrapped ${year}`,
    metaDescription: (year) => `What the Next Level Builders community validated, built and shipped in ${year}, counted from verified activity only.`,
    eyebrow: (year) => `Plate ${year} · The community sky`,
    title: (year) => `What we built together in ${year}`,
    lede: "Every figure comes from verified activity and says how it was counted. Groups smaller than five builders are not shown, and no one is named.",
    status: { provisional: "Provisional", final: "Final" },
    statusNote: {
      provisional: "Counts activity verified so far. Final figures follow after December 31 and the review grace period.",
      final: "Final figures, frozen after every review closed.",
    },
    metrics: {
      active_builders: { label: "Active builders", unit: "builders with verified work" },
      active_validators: { label: "Builders who validated", unit: "builders with verified evidence of demand" },
      launches: { label: "Launches", unit: "products launched in public" },
      paying_products: { label: "Products with a paying customer", unit: "first verified payments" },
      peer_help: { label: "Times builders helped each other", unit: "verified peer help" },
    },
    membersHelped: (n) => `${n} builders helped`,
    share: (value, total) => `${value} of ${total} active builders`,
    suppressed: (min) => `Fewer than ${min} builders: not shown`,
    methodHeading: "How this was counted",
    method: (min) => `Only verified, non-reversed activity counts. Launches and payments need moderator or system verification. Any figure behind fewer than ${min} builders is hidden.`,
    source: (types, verification) => `Source: builder events · ${types} · ${verification}`,
    timeframe: (start, end, tz) => `${start} to ${end} (${tz})`,
    backfill: (n) => `${n} imported historical ${n === 1 ? "event is" : "events are"} included and labelled.`,
    versionMeta: (version, created) => `Version ${version} · ${created}`,
    hallOfFame: "See the Hall of Fame",
    cta: "Join the builders",
  },
  shared: {
    metaTitle: (name, year) => `${name}'s ${year} among the stars`,
    metaDescription: (year) => `A builder's verified ${year} on Next Level Builders: public milestones only.`,
    eyebrow: (year) => `Plate ${year} · A year among the stars`,
    title: (name, year) => `${name}'s ${year}, charted`,
    lede: "Public, verified milestones only. Points, scores and private notes stay private.",
    unknownName: "A builder",
    cta: "Chart your own year",
    ctaBody: "Next Level Builders turns real progress into a verified record you can share.",
    communityLink: (year) => `See the community's ${year}`,
  },
};

const vi: WrappedCopy = {
  community: {
    metaTitle: (year) => `NLB Community Wrapped ${year}`,
    metaDescription: (year) => `Những gì cộng đồng Next Level Builders đã kiểm chứng, xây dựng và ra mắt trong năm ${year}, chỉ tính từ hoạt động đã xác minh.`,
    eyebrow: (year) => `Bản đồ ${year} · Bầu trời cộng đồng`,
    title: (year) => `Những gì chúng ta cùng xây trong năm ${year}`,
    lede: "Mỗi con số đều đến từ hoạt động đã xác minh và ghi rõ cách tính. Nhóm dưới năm builder sẽ không hiển thị, và không ai bị nêu tên.",
    status: { provisional: "Tạm tính", final: "Chính thức" },
    statusNote: {
      provisional: "Tính các hoạt động đã xác minh đến nay. Số liệu chính thức có sau ngày 31/12 và thời gian duyệt bổ sung.",
      final: "Số liệu chính thức, đã chốt sau khi mọi đợt duyệt kết thúc.",
    },
    metrics: {
      active_builders: { label: "Builder đang hoạt động", unit: "builder có việc đã xác minh" },
      active_validators: { label: "Builder đã kiểm chứng", unit: "builder có bằng chứng nhu cầu đã xác minh" },
      launches: { label: "Lần ra mắt", unit: "sản phẩm ra mắt công khai" },
      paying_products: { label: "Sản phẩm có khách trả tiền", unit: "khoản thanh toán đầu tiên đã xác minh" },
      peer_help: { label: "Lần builder giúp nhau", unit: "lượt hỗ trợ đã xác minh" },
    },
    membersHelped: (n) => `${n} builder được giúp`,
    share: (value, total) => `${value} trên ${total} builder đang hoạt động`,
    suppressed: (min) => `Dưới ${min} builder: không hiển thị`,
    methodHeading: "Cách tính",
    method: (min) => `Chỉ tính hoạt động đã xác minh và chưa bị thu hồi. Ra mắt và thanh toán cần điều phối viên hoặc hệ thống xác minh. Con số nào chỉ có dưới ${min} builder sẽ được ẩn.`,
    source: (types, verification) => `Nguồn: builder events · ${types} · ${verification}`,
    timeframe: (start, end, tz) => `${start} đến ${end} (${tz})`,
    backfill: (n) => `Có ${n} sự kiện lịch sử được nhập lại, đã ghi chú rõ.`,
    versionMeta: (version, created) => `Phiên bản ${version} · ${created}`,
    hallOfFame: "Xem Hall of Fame",
    cta: "Tham gia cùng các builder",
  },
  shared: {
    metaTitle: (name, year) => `Năm ${year} giữa các vì sao của ${name}`,
    metaDescription: (year) => `Năm ${year} đã được xác minh của một builder trên Next Level Builders: chỉ gồm các cột mốc công khai.`,
    eyebrow: (year) => `Bản đồ ${year} · Một năm giữa các vì sao`,
    title: (name, year) => `Năm ${year} của ${name}, trên bản đồ sao`,
    lede: "Chỉ gồm các cột mốc công khai đã được xác minh. Điểm số và ghi chú riêng được giữ kín.",
    unknownName: "Một builder",
    cta: "Vẽ bản đồ năm của bạn",
    ctaBody: "Next Level Builders biến tiến độ thật thành hồ sơ đã xác minh mà bạn có thể chia sẻ.",
    communityLink: (year) => `Xem năm ${year} của cộng đồng`,
  },
};

export const wrappedCopy: Record<PageLocale, WrappedCopy> = { en, vi };

export function getWrappedCopy(locale: string): WrappedCopy {
  return wrappedCopy[toPageLocale(locale)];
}
