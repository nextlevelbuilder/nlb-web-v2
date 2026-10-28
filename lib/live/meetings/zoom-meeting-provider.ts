import { getLiveBinding } from "../live-env";
import {
  MeetingProviderError,
  MeetingProviderUnavailableError,
  type CreatedMeeting,
  type FetchLike,
  type MeetingAttendee,
  type MeetingEventInput,
  type MeetingProvider,
  type RegisteredAttendee,
} from "./meeting-provider";

/**
 * Zoom adapter over Server-to-Server OAuth. Meetings are created with registration required and
 * automatic approval, so each attendee gets a personal join URL from `POST /registrants`. Only the
 * meeting id, registrant id and join URL are read from responses; `start_url` (host link) and the
 * access token never leave this module.
 */
export interface ZoomCredentials {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

export interface ZoomProviderOptions {
  credentials: ZoomCredentials | null;
  fetch?: FetchLike;
  apiBase?: string;
  oauthBase?: string;
  /** Clock for token expiry; injectable for tests. */
  now?: () => number;
}

const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/** Zoom credentials from runtime bindings, or null when any is missing (provider unavailable). */
export function zoomCredentialsFromEnv(): ZoomCredentials | null {
  const accountId = getLiveBinding("ZOOM_ACCOUNT_ID")?.trim();
  const clientId = getLiveBinding("ZOOM_CLIENT_ID")?.trim();
  const clientSecret = getLiveBinding("ZOOM_CLIENT_SECRET")?.trim();
  return accountId && clientId && clientSecret ? { accountId, clientId, clientSecret } : null;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function failure(res: Response, what: string): Promise<MeetingProviderError> {
  const body = await readJson(res);
  const code = typeof body.code === "number" || typeof body.code === "string" ? ` (code ${body.code})` : "";
  return new MeetingProviderError("zoom", res.status, `Zoom ${what} failed with HTTP ${res.status}${code}`);
}

/** Zoom wants `yyyy-MM-ddTHH:mm:ssZ` for a UTC start time. */
function zoomStartTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function createZoomMeetingProvider(options: ZoomProviderOptions): MeetingProvider {
  const credentials = options.credentials;
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const apiBase = options.apiBase ?? "https://api.zoom.us/v2";
  const oauthBase = options.oauthBase ?? "https://zoom.us/oauth/token";
  const clock = options.now ?? Date.now;
  let token: { value: string; expiresAt: number } | null = null;

  function requireCredentials(): ZoomCredentials {
    if (!credentials) throw new MeetingProviderUnavailableError("zoom");
    return credentials;
  }

  async function accessToken(): Promise<string> {
    const creds = requireCredentials();
    if (token && token.expiresAt > clock()) return token.value;
    const url = `${oauthBase}?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`;
    const res = await doFetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}` },
    });
    if (!res.ok) throw await failure(res, "token request");
    const body = await readJson(res);
    if (typeof body.access_token !== "string" || !body.access_token) {
      throw new MeetingProviderError("zoom", res.status, "Zoom token response had no access token");
    }
    const ttlMs = (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1000;
    token = { value: body.access_token, expiresAt: clock() + Math.max(ttlMs - TOKEN_EXPIRY_MARGIN_MS, 0) };
    return token.value;
  }

  async function call(path: string, method: string, what: string, payload: unknown): Promise<Response> {
    const res = await doFetch(`${apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) token = null;
    if (!res.ok) throw await failure(res, what);
    return res;
  }

  return {
    name: "zoom",
    available: credentials !== null,

    async createMeeting(event: MeetingEventInput): Promise<CreatedMeeting> {
      const duration = Math.max(1, Math.ceil((event.endsAt.getTime() - event.startsAt.getTime()) / 60_000));
      const res = await call("/users/me/meetings", "POST", "meeting creation", {
        topic: event.titleEn.slice(0, 200),
        type: 2,
        start_time: zoomStartTime(event.startsAt),
        duration,
        timezone: event.timezone,
        settings: { approval_type: 0, registration_type: 1, join_before_host: false },
      });
      const body = await readJson(res);
      const id = typeof body.id === "number" || typeof body.id === "string" ? String(body.id) : "";
      if (!id) throw new MeetingProviderError("zoom", res.status, "Zoom meeting response had no id");
      return { meetingId: id };
    },

    async registerAttendee(meetingId: string, attendee: MeetingAttendee): Promise<RegisteredAttendee> {
      const res = await call(`/meetings/${encodeURIComponent(meetingId)}/registrants`, "POST", "registration", {
        email: attendee.email,
        first_name: attendee.firstName.slice(0, 64) || "NLB",
        last_name: attendee.lastName.slice(0, 64),
      });
      const body = await readJson(res);
      const registrantId = typeof body.registrant_id === "string" ? body.registrant_id : "";
      const joinUrl = typeof body.join_url === "string" ? body.join_url : "";
      if (!registrantId || !joinUrl.startsWith("https://")) {
        throw new MeetingProviderError("zoom", res.status, "Zoom registration response had no registrant or join URL");
      }
      return { registrantId, joinUrl };
    },

    async cancelRegistrant(meetingId: string, registrantId: string): Promise<void> {
      await call(`/meetings/${encodeURIComponent(meetingId)}/registrants/status`, "PUT", "registrant cancellation", {
        action: "cancel",
        registrants: [{ id: registrantId }],
      });
    },
  };
}

/** Zoom provider from runtime credentials; `available` is false (fail closed) when any is missing. */
export function createZoomMeetingProviderFromEnv(fetchImpl?: FetchLike): MeetingProvider {
  return createZoomMeetingProvider({ credentials: zoomCredentialsFromEnv(), fetch: fetchImpl });
}
