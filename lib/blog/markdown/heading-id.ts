/** Stable, URL-safe heading anchors (strips Vietnamese diacritics, đ → d). */
export function headingId(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "section"
  );
}

/** Returns an id generator that de-duplicates anchors within one document ("faq", "faq-1", …). */
export function createHeadingIdAllocator(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = headingId(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}
