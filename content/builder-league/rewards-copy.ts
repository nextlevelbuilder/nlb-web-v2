import { toPageLocale, type PageLocale } from "@/content/pages/page-locale";
import type { Availability, ClaimAction, RewardClaimStatus, RewardKind, RewardPeriod } from "@/lib/builder-league/rewards";

/** Builder League rewards copy (member page and admin studio). */
export type RewardsCopy = {
  kinds: Record<RewardKind, string>;
  availability: Record<Availability, string>;
  claimStatus: Record<RewardClaimStatus, string>;
  period: Record<RewardPeriod, string>;
  page: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    lede: string;
    notCash: string;
    empty: string;
    left: (count: number) => string;
    unlimited: string;
    opensOn: (date: string) => string;
    closesOn: (date: string) => string;
    requirementsAll: string;
    requirementsAny: string;
    requirementsOneOf: string;
    met: string;
    notMet: string;
    eligible: string;
    notEligible: string;
    noteLabel: string;
    notePlaceholder: string;
    claim: string;
    claiming: string;
    claimed: string;
    claimError: Record<string, string>;
    yourClaim: (status: string) => string;
    redeemBy: (date: string) => string;
    historyHeading: string;
    historyEmpty: string;
  };
  admin: {
    metaTitle: string;
    eyebrow: string;
    title: string;
    lede: string;
    seed: string;
    seeding: string;
    seeded: (count: number | string) => string;
    itemsHeading: string;
    itemsEmpty: string;
    active: string;
    inactive: string;
    activate: string;
    deactivate: string;
    inventory: string;
    inventoryUnlimited: string;
    setInventory: string;
    budget: string;
    window: string;
    always: string;
    claimsHeading: string;
    claimsEmpty: string;
    filterLabel: string;
    allStatuses: string;
    member: string;
    reward: string;
    period: string;
    requested: string;
    actions: string;
    note: string;
    actionLabels: Record<ClaimAction, string>;
    badgesHeading: string;
    badgesBody: string;
    badgesEmpty: string;
    revoke: string;
    revokeReason: string;
    revoked: (reason: string) => string;
    working: string;
    done: string;
    error: string;
    adminOnly: string;
  };
};

export const rewardsCopy: Record<PageLocale, RewardsCopy> = {
  en: {
    kinds: {
      editorial_exposure: "Editorial exposure",
      launch_review: "Launch review",
      mentorship: "Mentorship",
      distribution_intro: "Introduction",
      co_launch: "Co-launch",
    },
    availability: { open: "Open", upcoming: "Opens soon", closed: "Closed", out_of_stock: "All places taken" },
    claimStatus: {
      requested: "Requested",
      approved: "Approved",
      rejected: "Not approved",
      redeemed: "Redeemed",
      expired: "Expired",
      cancelled: "Cancelled",
    },
    period: { season: "Once per season", year: "Once per year", once: "Once" },
    page: {
      metaTitle: "Rewards · Builder League",
      metaDescription: "Opportunities unlocked by verified progress: editorial features, launch reviews, mentorship, introductions and co-launches.",
      eyebrow: "Plate IV · Rewards",
      title: "Opportunities earned by progress",
      lede: "Rewards are people's time and attention, unlocked by verified milestones, badges, rank or last season's result.",
      notCash: "Rewards are never cash, RP is never spent, and membership type never matters. A moderator reviews every request.",
      empty: "No rewards are open right now.",
      left: (count) => `${count} ${count === 1 ? "place" : "places"} left`,
      unlimited: "No fixed limit",
      opensOn: (date) => `Opens ${date}`,
      closesOn: (date) => `Closes ${date}`,
      requirementsAll: "You need all of",
      requirementsAny: "And one of",
      requirementsOneOf: "You need one of",
      met: "Met",
      notMet: "Not yet",
      eligible: "You are eligible",
      notEligible: "Not eligible yet",
      noteLabel: "Note for the moderator (optional)",
      notePlaceholder: "What would you use it for?",
      claim: "Request this reward",
      claiming: "Sending…",
      claimed: "Request sent. A moderator will review it.",
      claimError: {
        already_claimed: "You already requested this reward for this period.",
        out_of_stock: "All places have been taken.",
        not_eligible: "You do not meet the requirements yet.",
        reward_closed: "This reward has closed.",
        reward_not_open: "This reward is not open yet.",
        default: "Could not send the request. Try again.",
      },
      yourClaim: (status) => `Your request: ${status}`,
      redeemBy: (date) => `Use by ${date}`,
      historyHeading: "Your requests",
      historyEmpty: "You have not requested a reward yet.",
    },
    admin: {
      metaTitle: "Rewards admin · Builder League",
      eyebrow: "Studio · Rewards",
      title: "Rewards, claims and badge revocations",
      lede: "Approve requests, track redemption and capacity, and revoke badges whose evidence did not hold. Every action is audited.",
      seed: "Add the initial catalogue",
      seeding: "Adding…",
      seeded: (count) => (count === 0 ? "The catalogue already exists." : `Added ${count} items (inactive).`),
      itemsHeading: "Catalogue",
      itemsEmpty: "No rewards yet. Add the initial catalogue to start.",
      active: "Active",
      inactive: "Inactive",
      activate: "Activate",
      deactivate: "Deactivate",
      inventory: "Places left",
      inventoryUnlimited: "No limit",
      setInventory: "Set places",
      budget: "Budget",
      window: "Window",
      always: "Always open",
      claimsHeading: "Claims",
      claimsEmpty: "No claims with this status.",
      filterLabel: "Status",
      allStatuses: "All",
      member: "Member",
      reward: "Reward",
      period: "Period",
      requested: "Requested",
      actions: "Actions",
      note: "Note",
      actionLabels: { approve: "Approve", reject: "Reject", redeem: "Mark redeemed", expire: "Expire", cancel: "Cancel" },
      badgesHeading: "Recent badge awards",
      badgesBody: "Revoke only when the evidence behind a badge was wrong. The member keeps the record with your reason.",
      badgesEmpty: "No badges awarded yet.",
      revoke: "Revoke",
      revokeReason: "Reason (required)",
      revoked: (reason) => `Revoked: ${reason}`,
      working: "Working…",
      done: "Done.",
      error: "That did not work. Reload and try again.",
      adminOnly: "Admins only.",
    },
  },
  vi: {
    kinds: {
      editorial_exposure: "Giới thiệu biên tập",
      launch_review: "Review ra mắt",
      mentorship: "Mentor 1:1",
      distribution_intro: "Giới thiệu kết nối",
      co_launch: "Ra mắt cùng NLB",
    },
    availability: { open: "Đang mở", upcoming: "Sắp mở", closed: "Đã đóng", out_of_stock: "Đã hết suất" },
    claimStatus: {
      requested: "Đã gửi yêu cầu",
      approved: "Đã duyệt",
      rejected: "Không được duyệt",
      redeemed: "Đã sử dụng",
      expired: "Đã hết hạn",
      cancelled: "Đã hủy",
    },
    period: { season: "Mỗi mùa một lần", year: "Mỗi năm một lần", once: "Một lần" },
    page: {
      metaTitle: "Phần thưởng · Builder League",
      metaDescription: "Cơ hội mở ra nhờ tiến độ đã xác minh: bài giới thiệu, review ra mắt, mentor, giới thiệu kết nối và ra mắt cùng NLB.",
      eyebrow: "Bản IV · Phần thưởng",
      title: "Cơ hội đến từ tiến độ thật",
      lede: "Phần thưởng là thời gian và sự chú ý của con người, mở ra nhờ cột mốc đã xác minh, huy hiệu, hạng hoặc kết quả mùa trước.",
      notCash: "Phần thưởng không bao giờ là tiền mặt, RP không bao giờ bị trừ, và loại thành viên không ảnh hưởng gì. Moderator duyệt mọi yêu cầu.",
      empty: "Hiện chưa có phần thưởng nào mở.",
      left: (count) => `Còn ${count} suất`,
      unlimited: "Không giới hạn suất",
      opensOn: (date) => `Mở ngày ${date}`,
      closesOn: (date) => `Đóng ngày ${date}`,
      requirementsAll: "Bạn cần đủ tất cả",
      requirementsAny: "Và một trong các điều sau",
      requirementsOneOf: "Bạn cần một trong các điều sau",
      met: "Đã đạt",
      notMet: "Chưa đạt",
      eligible: "Bạn đủ điều kiện",
      notEligible: "Chưa đủ điều kiện",
      noteLabel: "Ghi chú cho moderator (tùy chọn)",
      notePlaceholder: "Bạn sẽ dùng phần thưởng này để làm gì?",
      claim: "Gửi yêu cầu nhận",
      claiming: "Đang gửi…",
      claimed: "Đã gửi yêu cầu. Moderator sẽ xem xét.",
      claimError: {
        already_claimed: "Bạn đã gửi yêu cầu cho phần thưởng này trong kỳ này.",
        out_of_stock: "Đã hết suất.",
        not_eligible: "Bạn chưa đủ điều kiện.",
        reward_closed: "Phần thưởng đã đóng.",
        reward_not_open: "Phần thưởng chưa mở.",
        default: "Chưa gửi được yêu cầu. Hãy thử lại.",
      },
      yourClaim: (status) => `Yêu cầu của bạn: ${status}`,
      redeemBy: (date) => `Sử dụng trước ngày ${date}`,
      historyHeading: "Yêu cầu của bạn",
      historyEmpty: "Bạn chưa gửi yêu cầu nhận phần thưởng nào.",
    },
    admin: {
      metaTitle: "Quản trị phần thưởng · Builder League",
      eyebrow: "Studio · Phần thưởng",
      title: "Phần thưởng, yêu cầu và thu hồi huy hiệu",
      lede: "Duyệt yêu cầu, theo dõi việc sử dụng và số suất, thu hồi huy hiệu có bằng chứng không đứng vững. Mọi thao tác đều được ghi lại.",
      seed: "Thêm danh mục ban đầu",
      seeding: "Đang thêm…",
      seeded: (count) => (count === 0 ? "Danh mục đã có sẵn." : `Đã thêm ${count} mục (chưa kích hoạt).`),
      itemsHeading: "Danh mục",
      itemsEmpty: "Chưa có phần thưởng. Hãy thêm danh mục ban đầu để bắt đầu.",
      active: "Đang bật",
      inactive: "Đang tắt",
      activate: "Bật",
      deactivate: "Tắt",
      inventory: "Số suất còn",
      inventoryUnlimited: "Không giới hạn",
      setInventory: "Đặt số suất",
      budget: "Ngân sách",
      window: "Thời gian",
      always: "Luôn mở",
      claimsHeading: "Yêu cầu nhận thưởng",
      claimsEmpty: "Không có yêu cầu nào ở trạng thái này.",
      filterLabel: "Trạng thái",
      allStatuses: "Tất cả",
      member: "Thành viên",
      reward: "Phần thưởng",
      period: "Kỳ",
      requested: "Ngày gửi",
      actions: "Thao tác",
      note: "Ghi chú",
      actionLabels: { approve: "Duyệt", reject: "Từ chối", redeem: "Đánh dấu đã dùng", expire: "Cho hết hạn", cancel: "Hủy" },
      badgesHeading: "Huy hiệu vừa trao",
      badgesBody: "Chỉ thu hồi khi bằng chứng của huy hiệu sai. Thành viên vẫn thấy bản ghi kèm lý do của bạn.",
      badgesEmpty: "Chưa trao huy hiệu nào.",
      revoke: "Thu hồi",
      revokeReason: "Lý do (bắt buộc)",
      revoked: (reason) => `Đã thu hồi: ${reason}`,
      working: "Đang xử lý…",
      done: "Xong.",
      error: "Thao tác chưa thành công. Tải lại trang và thử lại.",
      adminOnly: "Chỉ dành cho admin.",
    },
  },
};

export function getRewardsCopy(locale: string): RewardsCopy {
  return rewardsCopy[toPageLocale(locale)];
}
