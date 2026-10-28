/**
 * Browser calls to the Live member endpoints (`/api/v1/live/...`, envelope `{ data }` or
 * `{ error: { code, message } }`). Each call resolves to a tagged result instead of throwing, so
 * components render a localized message for every failure, network errors included.
 */
import type { LiveUiErrorCode } from "@/lib/live/live-copy";
import { liveErrorCode } from "./live-ui-helpers";

export type LiveApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: LiveUiErrorCode };

export async function liveApi<T>(path: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<LiveApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") throw error;
    return { ok: false, status: 0, code: "network" };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, status: response.status, code: liveErrorCode(response.status, body) };
  const data = (body as { data?: unknown } | null)?.data;
  if (data === undefined || data === null || typeof data !== "object") return { ok: false, status: response.status, code: "unknown" };
  return { ok: true, data: data as T };
}

/** Only absolute http(s) URLs are followed (https outside localhost). */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.href;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return url.href;
    return null;
  } catch {
    return null;
  }
}

/** Accepts an ISO string or epoch ms; null when missing or invalid. */
export function parseApiDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
