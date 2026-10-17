/**
 * Shared shapes for the policy content modules.
 *
 * Section `content` keeps the plain-text conventions of the original site:
 * `\n` separates lines, a blank line separates paragraphs, lines starting with
 * `• ` render as bullets and lines starting with `1.` style numbers render as
 * ordered steps. The renderer lives in `app/[locale]/policies/policy-content.tsx`.
 */
export type PolicyLocale = "en" | "vi";

export const POLICY_LOCALES: readonly PolicyLocale[] = ["en", "vi"];

/** Community rules carried over from the old site vs. legal documents written for v2. */
export type PolicyGroup = "community" | "legal";

export type PolicySection = {
  heading: string;
  content: string;
};

export type PolicyDocument = {
  /** Short label used in the sidebar and cards. */
  navLabel: string;
  /** Page heading (h1). */
  title: string;
  /** One-sentence description used for cards and the meta description. */
  summary: string;
  sections: PolicySection[];
};

export type PolicyEntry = {
  group: PolicyGroup;
  /** ISO date shown as "Last updated" on the page. */
  lastUpdated: string;
  /**
   * True while a document has not been reviewed by counsel. Internal flag only:
   * it is never rendered to visitors.
   */
  legalReviewPending: boolean;
  content: Record<PolicyLocale, PolicyDocument>;
};
