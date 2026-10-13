/** UI copy for the public blog pages, keyed by locale (kept here rather than in messages/*.json). */
import type { BlogLocale } from "./blog-types";

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
  },
};

export function formatBlogDate(iso: string | null, locale: BlogLocale): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(BLOG_COPY[locale].dateLocale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}
