/** UI copy for the public blog pages, keyed by locale (kept here rather than in messages/*.json). */
import type { BlogLocale } from "./blog-types";

/** A display heading with one italic accent phrase: `before <em>accent</em> after`. */
export interface AccentHeading {
  before: string;
  accent: string;
  after: string;
}

export type CalloutTone = "note" | "tip" | "warning" | "success" | "danger";

export interface BlogCopy {
  indexTitle: string;
  indexDescription: string;
  indexHeading: string;
  indexLede: string;
  emptyTitle: string;
  emptyBody: string;
  emptyTagBody: (tag: string) => string;
  filteredBy: (tag: string) => string;
  clearFilter: string;
  readMore: string;
  backToBlog: string;
  publishedOn: string;
  minutesRead: (minutes: number) => string;
  byAuthor: (name: string) => string;
  tagsLabel: string;
  otherLanguage: string;
  newer: string;
  older: string;
  dateLocale: string;
  /** Chapter plate on the index and the post kicker fallback. */
  plateName: string;
  indexHeadline: AccentHeading;
  featuredLabel: string;
  moreHeading: string;
  tagsNavLabel: string;
  allTags: string;
  paginationLabel: string;
  pageLabel: (page: number) => string;
  /** Visible author line on cards and in the meta row; the name itself is shown next to the avatar. */
  authorLabel: string;
  shareHeading: string;
  shareOn: (network: string) => string;
  copyLink: string;
  copy: string;
  copied: string;
  copyFailed: string;
  copyCode: string;
  codeLabel: (name: string) => string;
  adjacentLabel: string;
  newerPost: string;
  olderPost: string;
  authorHeading: string;
  meetFounders: string;
  keyTakeaways: string;
  productsLabel: string;
  productBy: (maker: string) => string;
  productPreviewAlt: (name: string) => string;
  calloutTones: Record<CalloutTone, string>;
}

export const BLOG_COPY: Record<BlogLocale, BlogCopy> = {
  en: {
    indexTitle: "Blog | Next Level Builders",
    indexDescription: "Build logs, product lessons and engineering notes from the Next Level Builders community.",
    indexHeading: "Blog",
    indexLede: "Build logs, product lessons and engineering notes from the community.",
    emptyTitle: "No posts yet",
    emptyBody: "The first stories are being written. Check back soon.",
    emptyTagBody: (tag) => `No published posts are tagged "${tag}" yet.`,
    filteredBy: (tag) => `Tagged "${tag}"`,
    clearFilter: "Show all posts",
    readMore: "Read post",
    backToBlog: "All posts",
    publishedOn: "Published",
    minutesRead: (minutes) => `${minutes} min read`,
    byAuthor: (name) => `By ${name}`,
    tagsLabel: "Tags",
    otherLanguage: "Đọc bằng tiếng Việt",
    newer: "Newer posts",
    older: "Older posts",
    dateLocale: "en-US",
    plateName: "Logbook",
    indexHeadline: { before: "Field notes from builders ", accent: "shipping in public", after: "." },
    featuredLabel: "Latest entry",
    moreHeading: "Earlier entries",
    tagsNavLabel: "Filter posts by tag",
    allTags: "All",
    paginationLabel: "Pagination",
    pageLabel: (page) => `Page ${page}`,
    authorLabel: "Written by",
    shareHeading: "Share this entry",
    shareOn: (network) => `Share on ${network}`,
    copyLink: "Copy link",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Copy failed",
    copyCode: "Copy code",
    codeLabel: (name) => `Code: ${name}`,
    adjacentLabel: "More entries",
    newerPost: "Newer entry",
    olderPost: "Older entry",
    authorHeading: "About the author",
    meetFounders: "Meet the founders",
    keyTakeaways: "Key takeaways",
    productsLabel: "Products",
    productBy: (maker) => `By ${maker}`,
    productPreviewAlt: (name) => `${name} preview`,
    calloutTones: { note: "Note", tip: "Tip", warning: "Warning", success: "Success", danger: "Careful" },
  },
  vi: {
    indexTitle: "Blog | Next Level Builders",
    indexDescription: "Nhật ký xây dựng, bài học sản phẩm và ghi chú kỹ thuật từ cộng đồng Next Level Builders.",
    indexHeading: "Blog",
    indexLede: "Nhật ký xây dựng, bài học sản phẩm và ghi chú kỹ thuật từ cộng đồng.",
    emptyTitle: "Chưa có bài viết",
    emptyBody: "Những bài viết đầu tiên đang được chuẩn bị. Hãy quay lại sau nhé.",
    emptyTagBody: (tag) => `Chưa có bài viết nào được gắn thẻ "${tag}".`,
    filteredBy: (tag) => `Thẻ "${tag}"`,
    clearFilter: "Xem tất cả bài viết",
    readMore: "Đọc bài",
    backToBlog: "Tất cả bài viết",
    publishedOn: "Đăng ngày",
    minutesRead: (minutes) => `${minutes} phút đọc`,
    byAuthor: (name) => `Tác giả: ${name}`,
    tagsLabel: "Thẻ",
    otherLanguage: "Read in English",
    newer: "Bài mới hơn",
    older: "Bài cũ hơn",
    dateLocale: "vi-VN",
    plateName: "Nhật ký",
    indexHeadline: { before: "Ghi chép từ những người ", accent: "xây dựng công khai", after: "." },
    featuredLabel: "Bài mới nhất",
    moreHeading: "Các bài trước",
    tagsNavLabel: "Lọc bài viết theo thẻ",
    allTags: "Tất cả",
    paginationLabel: "Phân trang",
    pageLabel: (page) => `Trang ${page}`,
    authorLabel: "Viết bởi",
    shareHeading: "Chia sẻ bài viết",
    shareOn: (network) => `Chia sẻ lên ${network}`,
    copyLink: "Sao chép liên kết",
    copy: "Sao chép",
    copied: "Đã sao chép",
    copyFailed: "Không sao chép được",
    copyCode: "Sao chép mã",
    codeLabel: (name) => `Mã nguồn: ${name}`,
    adjacentLabel: "Bài viết khác",
    newerPost: "Bài mới hơn",
    olderPost: "Bài cũ hơn",
    authorHeading: "Về tác giả",
    meetFounders: "Gặp các nhà sáng lập",
    keyTakeaways: "Điểm chính",
    productsLabel: "Sản phẩm",
    productBy: (maker) => `Bởi ${maker}`,
    productPreviewAlt: (name) => `Ảnh xem trước ${name}`,
    calloutTones: { note: "Ghi chú", tip: "Mẹo", warning: "Cảnh báo", success: "Hoàn tất", danger: "Lưu ý" },
  },
};

export function formatBlogDate(iso: string | null, locale: BlogLocale): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(BLOG_COPY[locale].dateLocale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}
