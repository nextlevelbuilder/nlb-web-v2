import type { LiveMeetingProviderName } from "../types";

/**
 * Hosted-meeting adapter contract (ADR "Meetings"). Implementations call the provider over an
 * injected `fetch`, keep credentials server-side and never surface host start URLs or host
 * credentials: only a meeting id and per-attendee registrant id + personal join URL come back.
 */
export interface MeetingEventInput {
  id: string;
  titleEn: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}

export interface MeetingAttendee {
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreatedMeeting {
  meetingId: string;
}

export interface RegisteredAttendee {
  registrantId: string;
  /** Personal join URL; store encrypted, return only to the ticket holder in the join window. */
  joinUrl: string;
}

export interface MeetingProvider {
  readonly name: LiveMeetingProviderName;
  /** False when credentials are missing; every call then throws `MeetingProviderUnavailableError`. */
  readonly available: boolean;
  createMeeting(event: MeetingEventInput): Promise<CreatedMeeting>;
  registerAttendee(meetingId: string, attendee: MeetingAttendee): Promise<RegisteredAttendee>;
  cancelRegistrant(meetingId: string, registrantId: string): Promise<void>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Provider not configured: callers fail closed with a "not ready" state. */
export class MeetingProviderUnavailableError extends Error {
  constructor(provider: LiveMeetingProviderName) {
    super(`${provider} meeting provider is not configured`);
    this.name = "MeetingProviderUnavailableError";
  }
}

/** Provider call failed. `message` carries only the HTTP status and provider error code. */
export class MeetingProviderError extends Error {
  constructor(
    readonly provider: LiveMeetingProviderName,
    readonly status: number | null,
    message: string
  ) {
    super(message);
    this.name = "MeetingProviderError";
  }
}

/**
 * The provider answered 404: the meeting or registrant no longer exists there. Cancelling a registrant
 * that is already gone is done, so the registrant sweep treats this as success.
 */
export class MeetingProviderNotFoundError extends MeetingProviderError {
  constructor(provider: LiveMeetingProviderName, message: string) {
    super(provider, 404, message);
    this.name = "MeetingProviderNotFoundError";
  }
}
