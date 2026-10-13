import type { ReactNode } from "react";

type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const BULLET = /^•\s+/;
const NUMBERED = /^\d+\.\s+/;

/**
 * Turns the plain-text policy format into blocks: consecutive `• ` lines become
 * one list, consecutive `1. ` lines one ordered list, anything else a paragraph.
 * Blank lines only end the current list.
 */
export function parsePolicyContent(content: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (!line) {
      if (last && last.kind !== "p") blocks.push({ kind: "p", text: "" });
      continue;
    }
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "");
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
    } else if (NUMBERED.test(line)) {
      const item = line.replace(NUMBERED, "");
      if (last?.kind === "ol") last.items.push(item);
      else blocks.push({ kind: "ol", items: [item] });
    } else {
      blocks.push({ kind: "p", text: line });
    }
  }
  return blocks.filter((block) => block.kind !== "p" || block.text !== "");
}

/** Renders one policy section body with semantic lists and readable measure. */
export function PolicyContent({ content }: { content: string }) {
  const blocks = parsePolicyContent(content);
  return (
    <div className="max-w-[68ch] space-y-4 text-step-base leading-relaxed text-ink-2">
      {blocks.map((block, i): ReactNode => {
        if (block.kind === "ul") {
          return (
            <ul key={i} className="space-y-2">
              {block.items.map((item, j) => (
                <li key={j} className="relative pl-5">
                  <span aria-hidden className="absolute left-0 top-[0.7em] h-1 w-1 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ol") {
          return (
            <ol key={i} className="list-none space-y-2 [counter-reset:step]">
              {block.items.map((item, j) => (
                <li
                  key={j}
                  className="relative pl-8 [counter-increment:step] before:absolute before:left-0 before:top-0 before:font-mono before:text-step-sm before:text-primary before:content-[counter(step,decimal-leading-zero)]"
                >
                  {item}
                </li>
              ))}
            </ol>
          );
        }
        // Short lines ending in a colon introduce the list that follows.
        const isLead = block.text.endsWith(":") && block.text.length < 80;
        return (
          <p key={i} className={isLead ? "font-medium text-foreground" : undefined}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
