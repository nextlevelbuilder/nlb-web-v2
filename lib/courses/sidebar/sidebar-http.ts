/** Shared outbound HTTP for the /courses sidebar: short timeout, descriptive User-Agent, status check. */
export const SIDEBAR_USER_AGENT = "NextLevelBuilderBot/1.0 (+https://nextlevelbuilder.io/courses; courses sidebar)";
export const SIDEBAR_FETCH_TIMEOUT_MS = 4_000;

/** Upper bound on a response body we are willing to parse (markdown index, article JSON, course HTML). */
const MAX_BODY_CHARS = 2_000_000;

export class SidebarFetchError extends Error {
  constructor(message: string, readonly url: string) {
    super(message);
    this.name = "SidebarFetchError";
  }
}

/** GET `url` and return the body as text. Throws SidebarFetchError on non-2xx, timeout or oversize body. */
export async function fetchSidebarText(url: string, accept: string, timeoutMs: number = SIDEBAR_FETCH_TIMEOUT_MS): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: accept, "User-Agent": SIDEBAR_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new SidebarFetchError(`Request failed (${reason})`, url);
  }
  if (!res.ok) throw new SidebarFetchError(`Unexpected status ${res.status}`, url);
  const body = await res.text();
  if (body.length > MAX_BODY_CHARS) throw new SidebarFetchError("Response body too large", url);
  return body;
}
