/**
 * Visible strings the document blocks add around user content (section kickers, link suffixes).
 * Plain strings only, so the labels can cross the server/client boundary (the Studio preview renders
 * blocks inside a client component). `{n}` is replaced with the 1-based image number.
 */
export interface BlockLabels {
  gallery: string;
  features: string;
  techStack: string;
  pricing: string;
  faq: string;
  founder: string;
  popular: string;
  opensInNewTab: string;
  linkedin: string;
  openImage: string;
  imageAlt: string;
}

/** English defaults keep every existing BlockRenderer consumer rendering without passing labels. */
export const DEFAULT_BLOCK_LABELS: BlockLabels = {
  gallery: "Gallery",
  features: "Features",
  techStack: "Technology stack",
  pricing: "Pricing",
  faq: "Questions",
  founder: "Maker",
  popular: "Popular",
  opensInNewTab: "(opens in a new tab)",
  linkedin: "LinkedIn profile",
  openImage: "Open image {n} full size",
  imageAlt: "Screenshot {n}",
};

/** Fill the `{n}` placeholder of a numbered label. */
export function numberedLabel(template: string, n: number): string {
  return template.replace("{n}", String(n));
}
