/** UI copy for the Courses pages, kept here (not messages/*.json) so the feature ships self-contained. */
export type CoursesLocale = "en" | "vi";

export interface CoursesCopy {
  listTitle: string;
  listSubtitle: string;
  empty: string;
  week: (n: number) => string;
  minutes: (n: number) => string;
  watch: string;
  back: string;
  lockedTitle: string;
  lockedBody: string;
  buyOption: (price: string) => string;
  vipOption: string;
  buyButton: (price: string) => string;
  vipButton: string;
  signInToBuy: string;
  loadingPlayer: string;
  playerError: string;
  retry: string;
  checkoutError: string;
  paymentPending: string;
  unavailable: string;
  /** Masthead: chapter plate name and the h1 split around its italic accent phrase. */
  plateName: string;
  headingLead: string;
  headingAccent: string;
  headingTail: string;
  observation: (n: number) => string;
  emptyKicker: string;
  emptyTitle: string;
  emptyBody: string;
  emptyResources: string;
  detailPlate: string;
  /** Sidebar */
  asideLabel: string;
  newTab: string;
  labHeading: string;
  labNote: string;
  labLessons: (n: number) => string;
  labPrice: (priceVnd: number | null) => string;
  labAll: string;
  labFallback: string;
  labFallbackLink: string;
  zueyHeading: string;
  zueyNote: string;
  readingMinutes: (n: number) => string;
  membersBadge: string;
  zueyAll: string;
  zueyFallback: string;
  zueyFallbackLink: string;
  /** Catalogue controls */
  controlsLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  sortLabel: string;
  sorts: Record<"newest" | "oldest" | "longest" | "shortest", string>;
  speakerLabel: string;
  allSpeakers: string;
  transcriptFilter: string;
  applyFilters: string;
  clearFilters: string;
  resultsLabel: (matched: number, total: number) => string;
  noResultsTitle: string;
  noResultsBody: string;
  paginationLabel: string;
  prevPage: string;
  nextPage: string;
  pageOf: (page: number, count: number) => string;
  goToPage: (page: number) => string;
  transcriptBadge: string;
  /** Sidebar: reading transcripts through the MCP server */
  mcpKicker: string;
  mcpHeading: string;
  mcpBody: string;
  mcpSteps: [string, string, string];
  mcpEndpointLabel: string;
  mcpPromptLabel: string;
  mcpPrompt: string;
  mcpWho: string;
  mcpTools: string;
  mcpGuide: string;
  mcpJoin: string;
}

const en: CoursesCopy = {
  listTitle: "Courses",
  listSubtitle: "Recorded build sessions. Buy a single video, or become a Premium or VIP member to unlock every one.",
  empty: "No videos published yet. Check back soon.",
  week: (n) => `Week ${n}`,
  minutes: (n) => `${n} min`,
  watch: "View video",
  back: "All videos",
  lockedTitle: "This video is locked",
  lockedBody: "Choose how you want to unlock it:",
  buyOption: (price) => `Buy this video once for ${price} and keep access to it.`,
  vipOption: "Become a Premium or VIP member to watch every course video while your membership is active.",
  buyButton: (price) => `Buy for ${price}`,
  vipButton: "See membership plans",
  signInToBuy: "Sign in to buy",
  loadingPlayer: "Loading player…",
  playerError: "We could not load the player.",
  retry: "Try again",
  checkoutError: "We could not start checkout. Please try again.",
  paymentPending: "Payment received. Access unlocks as soon as Polar confirms the order, usually within a minute.",
  unavailable: "Playback is temporarily unavailable. Please try again later.",
  plateName: "Observatory",
  headingLead: "Build sessions you can ",
  headingAccent: "watch again",
  headingTail: ".",
  observation: (n) => `Obs. ${n}`,
  emptyKicker: "Obs. pending · no transmission yet",
  emptyTitle: "The first session is still in orbit.",
  emptyBody: "Videos land here as soon as they are published. Premium and VIP members unlock every one of them. Until then, the reading list alongside is open to everyone.",
  emptyResources: "Browse the reading list",
  detailPlate: "Observatory",
  asideLabel: "Keep learning",
  newTab: "(opens in a new tab)",
  labHeading: "Featured courses from 200lab",
  labNote: "In Vietnamese",
  labLessons: (n) => `${n} ${n === 1 ? "lesson" : "lessons"}`,
  labPrice: (priceVnd) => (priceVnd === null ? "Free" : `from ${new Intl.NumberFormat("en-US").format(priceVnd)} ₫`),
  labAll: "All courses on 200lab",
  labFallback: "The 200lab catalogue could not be loaded right now.",
  labFallbackLink: "Open 200lab courses",
  zueyHeading: "Knowledges · ZueyOS",
  zueyNote: "Latest articles",
  readingMinutes: (n) => `${n} min read`,
  membersBadge: "Members",
  zueyAll: "All articles",
  zueyFallback: "The latest ZueyOS articles could not be loaded right now.",
  zueyFallbackLink: "Read on zuey.me",
  controlsLabel: "Search and filter videos",
  searchLabel: "Search",
  searchPlaceholder: "Topic, tool or week…",
  sortLabel: "Sort",
  sorts: { newest: "Newest first", oldest: "Oldest first", longest: "Longest", shortest: "Shortest" },
  speakerLabel: "Speaker",
  allSpeakers: "All speakers",
  transcriptFilter: "Has transcript",
  applyFilters: "Apply",
  clearFilters: "Clear filters",
  resultsLabel: (matched, total) => (matched === total ? `Catalogue · ${total} ${total === 1 ? "video" : "videos"}` : `${matched} of ${total} videos`),
  noResultsTitle: "No video matches these filters.",
  noResultsBody: "Try a shorter search, another speaker, or clear the filters.",
  paginationLabel: "Catalogue pages",
  prevPage: "Previous",
  nextPage: "Next",
  pageOf: (page, count) => `Page ${page} of ${count}`,
  goToPage: (page) => `Page ${page}`,
  transcriptBadge: "Transcript",
  mcpKicker: "MCP · for AI agents",
  mcpHeading: "Read transcripts with your AI agent",
  mcpBody: "Every session has a full Vietnamese transcript with timestamps. Connect the NLB MCP server and ask Claude, ChatGPT or Cursor to summarise, search or quote any video.",
  mcpSteps: [
    "Add the MCP server below as a custom connector in your AI client.",
    "Sign in with your NLB account when it asks (OAuth).",
    "Ask about a video; the agent calls course_list_videos and course_get_transcript.",
  ],
  mcpEndpointLabel: "MCP server",
  mcpPromptLabel: "Try asking",
  mcpPrompt: "Summarise NLB Weekly #43 and list every tool mentioned, with timestamps.",
  mcpWho: "For members who bought the video, and every active Premium or VIP member.",
  mcpTools: "Tools",
  mcpGuide: "Connection guide",
  mcpJoin: "See membership plans",
};

const vi: CoursesCopy = {
  listTitle: "Khoá học",
  listSubtitle: "Các buổi build đã ghi hình. Mua lẻ từng video, hoặc trở thành hội viên Premium hay VIP để mở khoá tất cả.",
  empty: "Chưa có video nào được xuất bản. Hãy quay lại sau nhé.",
  week: (n) => `Tuần ${n}`,
  minutes: (n) => `${n} phút`,
  watch: "Xem video",
  back: "Tất cả video",
  lockedTitle: "Video này đang bị khoá",
  lockedBody: "Chọn cách mở khoá:",
  buyOption: (price) => `Mua riêng video này với giá ${price} và xem lại bất cứ lúc nào.`,
  vipOption: "Trở thành hội viên Premium hoặc VIP để xem toàn bộ video khoá học trong thời gian hội viên còn hiệu lực.",
  buyButton: (price) => `Mua với giá ${price}`,
  vipButton: "Xem các gói hội viên",
  signInToBuy: "Đăng nhập để mua",
  loadingPlayer: "Đang tải trình phát…",
  playerError: "Không thể tải trình phát.",
  retry: "Thử lại",
  checkoutError: "Không thể bắt đầu thanh toán. Vui lòng thử lại.",
  paymentPending: "Đã nhận thanh toán. Quyền xem sẽ mở ngay khi Polar xác nhận đơn hàng, thường trong vòng một phút.",
  unavailable: "Tạm thời không thể phát video. Vui lòng thử lại sau.",
  plateName: "Đài quan sát",
  headingLead: "Những buổi build bạn có thể ",
  headingAccent: "xem lại",
  headingTail: ".",
  observation: (n) => `Q.sát ${n}`,
  emptyKicker: "Đang chờ tín hiệu · chưa có video",
  emptyTitle: "Buổi build đầu tiên vẫn đang trên quỹ đạo.",
  emptyBody: "Video sẽ xuất hiện ở đây ngay khi được xuất bản, và hội viên Premium, VIP được xem toàn bộ. Trong lúc chờ, bạn có thể đọc ngay các tài liệu bên cạnh, mở cho tất cả mọi người.",
  emptyResources: "Xem danh sách tài liệu",
  detailPlate: "Đài quan sát",
  asideLabel: "Học tiếp",
  newTab: "(mở trong thẻ mới)",
  labHeading: "Khoá học nổi bật từ 200lab",
  labNote: "Tiếng Việt",
  labLessons: (n) => `${n} bài học`,
  labPrice: (priceVnd) => (priceVnd === null ? "Miễn phí" : `từ ${new Intl.NumberFormat("vi-VN").format(priceVnd)} ₫`),
  labAll: "Tất cả khoá học trên 200lab",
  labFallback: "Tạm thời chưa tải được danh sách khoá học của 200lab.",
  labFallbackLink: "Mở trang khoá học 200lab",
  zueyHeading: "Kiến thức · ZueyOS",
  zueyNote: "Bài viết mới",
  readingMinutes: (n) => `${n} phút đọc`,
  membersBadge: "Thành viên",
  zueyAll: "Tất cả bài viết",
  zueyFallback: "Tạm thời chưa tải được các bài viết mới trên ZueyOS.",
  zueyFallbackLink: "Đọc trên zuey.me",
  controlsLabel: "Tìm và lọc video",
  searchLabel: "Tìm kiếm",
  searchPlaceholder: "Chủ đề, công cụ hoặc tuần…",
  sortLabel: "Sắp xếp",
  sorts: { newest: "Mới nhất", oldest: "Cũ nhất", longest: "Dài nhất", shortest: "Ngắn nhất" },
  speakerLabel: "Diễn giả",
  allSpeakers: "Tất cả diễn giả",
  transcriptFilter: "Có transcript",
  applyFilters: "Áp dụng",
  clearFilters: "Xoá bộ lọc",
  resultsLabel: (matched, total) => (matched === total ? `Danh mục · ${total} video` : `${matched} / ${total} video`),
  noResultsTitle: "Không có video nào khớp bộ lọc.",
  noResultsBody: "Thử từ khoá ngắn hơn, chọn diễn giả khác hoặc xoá bộ lọc.",
  paginationLabel: "Các trang danh mục",
  prevPage: "Trước",
  nextPage: "Sau",
  pageOf: (page, count) => `Trang ${page} / ${count}`,
  goToPage: (page) => `Trang ${page}`,
  transcriptBadge: "Transcript",
  mcpKicker: "MCP · cho AI agent",
  mcpHeading: "Đọc transcript bằng AI agent",
  mcpBody: "Mỗi buổi đều có transcript tiếng Việt đầy đủ, kèm mốc thời gian. Kết nối MCP server của NLB rồi nhờ Claude, ChatGPT hay Cursor tóm tắt, tìm hoặc trích dẫn bất kỳ video nào.",
  mcpSteps: [
    "Thêm MCP server bên dưới làm custom connector trong AI client của bạn.",
    "Đăng nhập tài khoản NLB khi được hỏi (OAuth).",
    "Hỏi về một video; agent sẽ gọi course_list_videos và course_get_transcript.",
  ],
  mcpEndpointLabel: "MCP server",
  mcpPromptLabel: "Thử hỏi",
  mcpPrompt: "Tóm tắt NLB Weekly #43 và liệt kê mọi công cụ được nhắc tới, kèm mốc thời gian.",
  mcpWho: "Dành cho người đã mua video và mọi hội viên Premium hoặc VIP còn hiệu lực.",
  mcpTools: "Công cụ",
  mcpGuide: "Hướng dẫn kết nối",
  mcpJoin: "Xem các gói hội viên",
};

const COPY: Record<CoursesLocale, CoursesCopy> = { en, vi };

export function toCoursesLocale(locale: string): CoursesLocale {
  return locale === "en" ? "en" : "vi";
}

export function getCoursesCopy(locale: string): CoursesCopy {
  return COPY[toCoursesLocale(locale)];
}

/** Format integer minor units (cents) for display, e.g. 1900 usd -> "$19.00". */
export function formatCoursePrice(priceCents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "vi-VN", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
