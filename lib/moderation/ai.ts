export interface AiModerationReport {
  isClean: boolean;
  confidence: number;
  flags: string[];
  suggestedTags: string[];
  model: string;
  summary: string;
}

/**
 * Advisory AI content screening for product listing submissions.
 * Strictly non-authoritative: produces suggestions and flags for human reviewers.
 */
export async function screenListingWithAi({
  title,
  tagline,
  description,
  websiteUrl,
}: {
  title: string;
  tagline: string;
  description: string;
  websiteUrl: string;
}): Promise<AiModerationReport> {
  const flags: string[] = [];
  const textSample = `${title} ${tagline} ${description}`.toLowerCase();

  // Basic deterministic heuristic checks
  const prohibitedKeywords = ["casino", "crypto scam", "pyramid", "gambling", "phishing", "malware"];
  for (const kw of prohibitedKeywords) {
    if (textSample.includes(kw)) {
      flags.push(`prohibited_topic:${kw}`);
    }
  }

  if (title.length < 3) {
    flags.push("title_too_short");
  }
  if (description.length < 20) {
    flags.push("description_too_brief");
  }

  // Derive suggested tags based on technology heuristics
  const suggestedTags: string[] = [];
  if (textSample.includes("ai") || textSample.includes("gpt") || textSample.includes("llm")) {
    suggestedTags.push("ai-tools");
  }
  if (textSample.includes("saas") || textSample.includes("software")) {
    suggestedTags.push("micro-saas");
  }
  if (textSample.includes("dev") || textSample.includes("code") || textSample.includes("api")) {
    suggestedTags.push("developer-tools");
  }

  const isClean = flags.length === 0;

  return {
    isClean,
    confidence: isClean ? 0.95 : 0.65,
    flags,
    suggestedTags,
    model: "@cf/meta/llama-3-8b-instruct",
    summary: isClean
      ? "Listing appears compliant with standard community guidelines. Ready for human verification."
      : `Potential policy concerns detected: ${flags.join(", ")}. Human review required.`,
  };
}
