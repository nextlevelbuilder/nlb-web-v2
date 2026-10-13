/**
 * Pure Postgres(JSON row) -> SQLite literal conversion used by the Neon -> D1 migration.
 *
 * Source rows come from `SELECT row_to_json(t)`, so values are already JSON-typed:
 * uuid/text -> string, int -> number, bool -> boolean, jsonb -> any JSON value, text[] -> array,
 * timestamp -> ISO string without zone (stored as UTC by the old app), timestamptz -> ISO with offset.
 */

/** The drizzle sqlite column kinds present in lib/db/schema.ts. */
export type ColumnKind = "text" | "json" | "integer" | "boolean" | "timestamp_ms";

export class ConversionError extends Error {}

/** Parse a Postgres JSON timestamp to epoch milliseconds. Zone-less values are UTC. */
export function timestampToEpochMs(value: string): number {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(value.trim());
  if (!match) throw new ConversionError(`Unrecognised timestamp: ${value}`);
  const [, date, time, fraction = "", zone = "Z"] = match;
  // Postgres keeps microseconds; SQLite stores ms. Truncate (never round across a second boundary).
  const ms = fraction ? fraction.slice(0, 4).padEnd(4, "0") : "";
  const normalisedZone = zone === "Z" ? "Z" : zone.length === 3 ? `${zone}:00` : zone.includes(":") ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const epoch = Date.parse(`${date}T${time}${ms}${normalisedZone}`);
  if (Number.isNaN(epoch)) throw new ConversionError(`Invalid timestamp: ${value}`);
  return epoch;
}

/** Convert one source value to the value stored in SQLite (string | number | null). */
export function convertValue(value: unknown, kind: ColumnKind): string | number | null {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case "timestamp_ms":
      if (typeof value === "number") return Math.trunc(value);
      if (typeof value === "string") return timestampToEpochMs(value);
      throw new ConversionError(`Expected timestamp, got ${typeof value}`);
    case "boolean":
      if (typeof value === "boolean") return value ? 1 : 0;
      if (value === 0 || value === 1) return value;
      throw new ConversionError(`Expected boolean, got ${JSON.stringify(value)}`);
    case "integer":
      if (typeof value === "boolean") return value ? 1 : 0;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
      throw new ConversionError(`Expected integer, got ${JSON.stringify(value)}`);
    case "json":
      // jsonb and arrays are stored verbatim as JSON text (a jsonb string stays a JSON string).
      return JSON.stringify(value);
    case "text":
      if (typeof value === "string") return value;
      // Better Auth-owned array/json columns are plain text holding JSON (its adapter parses them).
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
  }
}

/** Render a converted value as an SQLite literal. */
export function sqlLiteral(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ConversionError(`Non-finite number ${value}`);
    return String(value);
  }
  if (value.includes("\u0000")) throw new ConversionError("NUL byte in text value");
  return `'${value.replace(/'/g, "''")}'`;
}

/** Stable identity of a row: primary-key values joined with a unit separator. */
export function rowIdentity(row: Record<string, unknown>, primaryKey: string[]): string {
  return primaryKey.map((column) => String(row[column] ?? "")).join("\u001f");
}
