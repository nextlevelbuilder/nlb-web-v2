import { LiveError, liveInvalid } from "./live-errors";

/** Shared boundary validation for operator and member input. Throws `LiveError(400)` on bad input. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function requireSlug(value: unknown, field = "slug"): string {
  if (typeof value !== "string" || value.length > 120 || !SLUG_RE.test(value)) {
    throw liveInvalid(`${field} must be lowercase letters, digits and single dashes (max 120)`);
  }
  return value;
}

export function requireText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw liveInvalid(`${field} is required (max ${max} characters)`);
  }
  return value.trim();
}

export function optionalText(value: unknown, field: string, max = 5000): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max) throw liveInvalid(`${field} must be text (max ${max} characters)`);
  return value;
}

export function requireDate(value: unknown, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw liveInvalid(`${field} must be a valid date`);
  return value;
}

export function requireInt(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw liveInvalid(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

/** Optional nullable id (Polar discount id, topic id): `undefined` = unchanged, `null` = cleared. */
export function optionalId(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) throw liveInvalid(`${field} must be an id`);
  return value.trim();
}

/** Run a statement and map a SQLite unique violation (duplicate slug, …) to a 409. */
export async function withUniqueConflict<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
      if (current instanceof Error && /UNIQUE constraint failed/i.test(current.message)) {
        throw new LiveError(409, "conflict", `${what} already exists`);
      }
      current = current instanceof Error ? current.cause : undefined;
    }
    throw error;
  }
}
