import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import { courseVideoTranscripts } from "@/lib/db/schema";
import { foldText } from "./course-catalogue";

export const TRANSCRIPT_DEFAULT_CHARS = 20_000;
export const TRANSCRIPT_MAX_CHARS = 50_000;
// About 6 hours of speech; D1 rows are capped at 2 MB.
const TRANSCRIPT_MAX_STORED_CHARS = 1_000_000;

export const transcriptQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(TRANSCRIPT_MAX_CHARS).default(TRANSCRIPT_DEFAULT_CHARS),
  q: z.string().trim().min(2).max(200).optional(),
});
export type TranscriptQuery = z.infer<typeof transcriptQuerySchema>;

export const putTranscriptSchema = z
  .object({
    content: z.string().trim().min(1).max(TRANSCRIPT_MAX_STORED_CHARS),
    source: z.string().trim().min(1).max(40).default("manual"),
  })
  .strict();
export type PutTranscriptInput = z.infer<typeof putTranscriptSchema>;

export async function getTranscript(videoId: string, db: AppDb) {
  const [row] = await db.select().from(courseVideoTranscripts).where(eq(courseVideoTranscripts.videoId, videoId)).limit(1);
  return row ?? null;
}

export async function hasTranscript(videoId: string, db: AppDb): Promise<boolean> {
  const [row] = await db
    .select({ videoId: courseVideoTranscripts.videoId })
    .from(courseVideoTranscripts)
    .where(eq(courseVideoTranscripts.videoId, videoId))
    .limit(1);
  return Boolean(row);
}

/** Ids of videos that have a transcript, for the catalogue's `hasTranscript` flag. */
export async function listTranscriptVideoIds(db: AppDb): Promise<Set<string>> {
  const rows = await db.select({ videoId: courseVideoTranscripts.videoId }).from(courseVideoTranscripts);
  return new Set(rows.map((row) => row.videoId));
}

export async function putTranscript(videoId: string, input: PutTranscriptInput, db: AppDb) {
  const now = new Date();
  const [row] = await db
    .insert(courseVideoTranscripts)
    .values({ videoId, content: input.content, source: input.source, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: courseVideoTranscripts.videoId, set: { content: input.content, source: input.source, updatedAt: now } })
    .returning();
  return row;
}

export interface TranscriptPage {
  totalChars: number;
  offset: number;
  content: string;
  /** Offset of the next page, or null when this page reaches the end. */
  nextOffset: number | null;
}

/**
 * One page of the transcript. Pages end on a paragraph break when one falls in the second half of the
 * window, so a `[hh:mm:ss]` paragraph is not split across two reads.
 */
export function pageTranscript(content: string, offset: number, limit: number): TranscriptPage {
  const start = Math.min(offset, content.length);
  let end = Math.min(start + limit, content.length);
  if (end < content.length) {
    const brk = content.lastIndexOf("\n\n", end);
    if (brk > start + limit / 2) end = brk + 2;
  }
  return { totalChars: content.length, offset: start, content: content.slice(start, end), nextOffset: end < content.length ? end : null };
}

export interface TranscriptMatch {
  offset: number;
  text: string;
}

/** Paragraphs containing `query` (case- and diacritic-insensitive), each with its character offset. */
export function searchTranscript(content: string, query: string, limit = 30): TranscriptMatch[] {
  const needle = foldText(query);
  const matches: TranscriptMatch[] = [];
  let offset = 0;
  for (const paragraph of content.split("\n\n")) {
    if (paragraph.trim() && foldText(paragraph).includes(needle)) {
      matches.push({ offset, text: paragraph.trim() });
      if (matches.length >= limit) break;
    }
    offset += paragraph.length + 2;
  }
  return matches;
}
