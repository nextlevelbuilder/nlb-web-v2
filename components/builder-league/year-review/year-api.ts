/** Small fetch helper for the Year in Review client islands (same-origin session cookies). */
export async function yearApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string } };
    if (!res.ok || json.data === undefined) return { ok: false, code: json.error?.code ?? `http_${res.status}` };
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

export function formatClientDate(locale: string, iso: string): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
}
