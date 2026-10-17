/**
 * Type-normalised row values for the full-row verify hash (pure, unit tested).
 *
 * The same row must serialise identically whether it comes from the Neon snapshot (after the
 * conversion rules in value-converters.ts) or from D1 (`SELECT *`):
 * - timestamps -> epoch ms integers (ISO strings with or without zone, microseconds truncated)
 * - booleans -> 0/1
 * - JSON -> canonical text (recursively sorted keys, no whitespace)
 * - numbers -> finite JS numbers, -0 folded to 0
 * - null / undefined -> null
 */
import { createHash } from "node:crypto";
import { ConversionError, timestampToEpochMs, type ColumnKind } from "./value-converters";

export type NormalizedValue = string | number | null;

/** Prefix that can never start valid JSON, so unparseable D1 JSON never equals a canonical value. */
const INVALID_JSON_PREFIX = "invalid-json:";

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) throw new ConversionError(`Non-finite number ${value}`);
  return Object.is(value, -0) ? 0 : value;
}

/** Canonical JSON text: object keys sorted recursively, no whitespace, undefined members dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "number":
      return JSON.stringify(normalizeNumber(value));
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
      const record = value as Record<string, unknown>;
      const members = Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
      return `{${members.join(",")}}`;
    }
    default:
      throw new ConversionError(`Value of type ${typeof value} is not JSON`);
  }
}

/** Normalise one stored or converted value for comparison. */
export function normalizeValue(value: unknown, kind: ColumnKind): NormalizedValue {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case "timestamp_ms":
      if (typeof value === "number") return normalizeNumber(Math.trunc(value));
      if (typeof value === "string") return /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : timestampToEpochMs(value);
      throw new ConversionError(`Expected timestamp, got ${typeof value}`);
    case "boolean":
      if (typeof value === "boolean") return value ? 1 : 0;
      if (value === 0 || value === 1) return value;
      if (value === "0" || value === "1") return Number(value);
      throw new ConversionError(`Expected boolean, got ${JSON.stringify(value)}`);
    case "integer":
      if (typeof value === "boolean") return value ? 1 : 0;
      if (typeof value === "number") return normalizeNumber(value);
      if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return normalizeNumber(Number(value.trim()));
      throw new ConversionError(`Expected integer, got ${JSON.stringify(value)}`);
    case "json":
      if (typeof value !== "string") return canonicalJson(value);
      try {
        return canonicalJson(JSON.parse(value));
      } catch {
        return `${INVALID_JSON_PREFIX}${value}`;
      }
    case "text":
      if (typeof value === "string") return value;
      if (typeof value === "object") return canonicalJson(value);
      return String(value);
  }
}

export interface NormalizedColumn {
  name: string;
  kind: ColumnKind;
}

/** Serialise a row as a JSON array of normalised values in the given column order. */
export function serializeNormalizedRow(row: Record<string, unknown>, columns: readonly NormalizedColumn[]): string {
  return JSON.stringify(columns.map((column) => normalizeValue(row[column.name], column.kind)));
}

/** Order-independent SHA-256 over serialised rows or identities. */
export function hashSorted(lines: readonly string[]): string {
  return createHash("sha256").update([...lines].sort().join("\n")).digest("hex");
}
