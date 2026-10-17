/**
 * Maps a post's free-text `authorName` to a known founder (avatar and role from FOUNDERS), so the
 * blog shows the same portraits as the home page. Matching ignores case, diacritics and word order,
 * so "Duy Nguyen", "duy nguyễn" and "Nguyễn Duy" all resolve to the same founder. Unknown authors keep
 * their name and get a star monogram instead of a portrait.
 */
import { FOUNDERS, pick } from "@/lib/constants/home-content";
import type { BlogLocale } from "./blog-types";

export interface BlogAuthor {
  name: string;
  /** First letter of the name, for the star monogram fallback. */
  initial: string;
  avatar: string | null;
  role: string | null;
  /** Set when the author is one of the founders (links to /#founders). */
  founderId: string | null;
}

/** Order-insensitive identity key: "Nguyễn Duy" and "Duy Nguyen" both become "duy nguyen". */
export function authorKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

const FOUNDER_BY_KEY = new Map(FOUNDERS.map((founder) => [authorKey(founder.name), founder]));

export function resolveBlogAuthor(name: string | null | undefined, locale: BlogLocale): BlogAuthor | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const founder = FOUNDER_BY_KEY.get(authorKey(trimmed));
  const initial = (Array.from(trimmed)[0] ?? "").toLocaleUpperCase(locale);
  if (!founder) return { name: trimmed, initial, avatar: null, role: null, founderId: null };
  return { name: founder.name, initial, avatar: founder.avatar, role: pick(founder.role, locale), founderId: founder.id };
}
