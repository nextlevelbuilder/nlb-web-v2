/**
 * Homepage FAQ: the question keys (under the `faq.items` message namespace) and the FAQPage JSON-LD built
 * from the same localized copy, so the visible answers and the structured data never drift apart.
 */

export const HOME_FAQ_KEYS = [
  "whatIsNLB",
  "refundPolicy",
  "billing",
  "timeCommitment",
  "isItACourse",
  "whatWillILearn",
  "needTechnical",
  "technicalLevel",
  "tierIncludes",
  "howDiscordWorks",
  "whatMakesDifferent",
  "upgradePlan",
  "freeTrial",
] as const;

export type HomeFaqKey = (typeof HOME_FAQ_KEYS)[number];

export interface FaqEntry {
  question: string;
  answer: string;
}

/** schema.org FAQPage for the given Q&A pairs. Serialize with `serializeJsonLd`, which escapes `<`. */
export function buildFaqPageJsonLd(entries: readonly FaqEntry[], url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url,
    mainEntity: entries.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}
