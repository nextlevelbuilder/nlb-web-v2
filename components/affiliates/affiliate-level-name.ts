import { titleCaseKey } from "./affiliate-format";

/** Minimal shape of a next-intl translator scoped to the `affiliates` namespace. */
interface LevelTranslator {
  (key: string): string;
  has(key: string): boolean;
}

/** Localized level name; a level an operator published after this copy falls back to its key. */
export function affiliateLevelName(t: LevelTranslator, key: string): string {
  return t.has(`levelNames.${key}`) ? t(`levelNames.${key}`) : titleCaseKey(key);
}
