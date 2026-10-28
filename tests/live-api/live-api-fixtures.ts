/**
 * Shared helpers for the Live REST tests. Only network clients are faked (the Polar SDK object and the
 * Zoom HTTP API behind `fetch`); the database is the real local D1 from tests/setup and every policy,
 * guard and domain module runs unmodified.
 *
 * Caller resolution is replaced by a faithful stand-in for `resolveCaller`: a delegation caller is
 * returned only when the route asks for the scope its assertion was signed with, exactly like
 * `verifyMcpDelegation`, so scope checks are exercised end to end.
 */
import { vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { ResolvedCaller } from "@/lib/auth-api-key";
import type { McpDelegationContext } from "@/lib/auth-mcp-delegation";
import { getDb } from "@/lib/db";
import { operatorAuditLogs, users } from "@/lib/db/schema";
import { grantOperatorCapability } from "@/lib/operators/operator-grants";
import type { OperatorCapability } from "@/lib/access/types";
import { syncLiveTicketFromOrder } from "@/lib/live/live-webhook-tickets";
import { holdSeat } from "@/lib/live/seats";
import { createEventDraft, openSales, type LiveEventRow } from "@/lib/live/events";
import { transitionEvent } from "@/lib/live/event-lifecycle";
import { ensureLiveTicketPolarProduct, type LivePolarProductsClient } from "@/lib/live/live-polar-product";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

let seq = 0;
export const nextSeq = () => ++seq;

// ---------------------------------------------------------------------------
// Callers
// ---------------------------------------------------------------------------

interface CallerState {
  caller: ResolvedCaller | null;
  /** Scope the delegation assertion was signed with (delegations only). */
  assertionScope?: McpDelegationContext["scope"];
}

const callerState: CallerState = { caller: null };
export const resolveCallerCalls: McpDelegationContext[] = [];

export function setCaller(caller: ResolvedCaller | null, assertionScope?: McpDelegationContext["scope"]): void {
  callerState.caller = caller;
  callerState.assertionScope = assertionScope;
}

/** Module mock for `@/lib/auth-api-key` (`vi.mock("@/lib/auth-api-key", () => import("./live-api-fixtures").then((m) => m.authApiKeyMock))`). */
export const authApiKeyMock = {
  resolveCaller: async (_headers: Headers, _db: unknown, delegation?: McpDelegationContext): Promise<ResolvedCaller | null> => {
    if (delegation) resolveCallerCalls.push(delegation);
    const { caller, assertionScope } = callerState;
    if (caller?.authType === "delegation" && (!delegation || delegation.scope !== assertionScope)) return null;
    return caller;
  },
};

export interface SeededUser {
  id: string;
  email: string;
}

export async function seedUser(prefix: string, options: { emailVerified?: boolean; banned?: boolean } = {}): Promise<SeededUser> {
  const n = nextSeq();
  const id = `${prefix}-${n}`;
  const email = `${prefix}${n}@example.com`;
  await getDb().insert(users).values({ id, name: `Live ${prefix}`, email, emailVerified: options.emailVerified ?? true, banned: options.banned ?? false });
  return { id, email };
}

export function asCaller(user: SeededUser, authType: ResolvedCaller["authType"], emailVerified = true): ResolvedCaller {
  return { user: { id: user.id, name: "Live", email: user.email, emailVerified }, authType };
}

export async function seedOperator(capabilities: OperatorCapability[] = ["live:manage"]): Promise<SeededUser> {
  const user = await seedUser("operator");
  for (const capability of capabilities) await grantOperatorCapability(getDb(), { userId: user.id, capability, grantedBy: "bootstrap" });
  return user;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const BASE = "https://nlb.test";

export function jsonRequest(path: string, method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export const getRequest = (path: string) => new Request(`${BASE}${path}`);
export const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

/** Envelope as read by the tests; `data` is loose because payloads are asserted field by field. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
export type TestEnvelope = { data?: any; error?: { code: string; message: string } };

export async function readJson(response: Response): Promise<TestEnvelope> {
  return response.json() as Promise<TestEnvelope>;
}

// ---------------------------------------------------------------------------
// Live seeds
// ---------------------------------------------------------------------------

const fakeProducts = (productId: string): LivePolarProductsClient =>
  ({ products: { create: async () => ({ id: productId }), update: async () => ({ id: productId }) } }) as unknown as LivePolarProductsClient;

/** An event taken through product creation, scheduling and opening sales, starting `startsInMs` from now. */
export async function seedOnSaleEvent(options: { startsInMs?: number; capacity?: number } = {}): Promise<LiveEventRow> {
  const n = nextSeq();
  const startsAt = new Date(Date.now() + (options.startsInMs ?? 7 * 24 * HOUR));
  const draft = await createEventDraft(
    {
      slug: `api-event-${n}`,
      titleEn: `Live ${n}`,
      titleVi: `Trực tiếp ${n}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * HOUR),
      hostName: "Host",
      capacity: options.capacity ?? 5,
      priceCents: 1900,
      recordingNoticeEn: "This session is recorded.",
      recordingNoticeVi: "Buổi này được ghi hình.",
      createdBy: "op",
    },
    getDb()
  );
  await ensureLiveTicketPolarProduct(draft, getDb(), fakeProducts(`polar-api-${draft.slug}`));
  await transitionEvent(draft.id, "scheduled", getDb());
  return (await openSales(draft.id, getDb())).event;
}

/** Gives `user` an active ticket through the real hold + `order.paid` webhook path. Returns the order id. */
export async function seedTicketHolder(event: LiveEventRow, user: SeededUser): Promise<string> {
  const now = new Date();
  const { reservation } = await holdSeat({ eventId: event.id, userId: user.id, now, recordingConsent: true }, getDb());
  const orderId = `ord-${nextSeq()}`;
  const outcome = await syncLiveTicketFromOrder(
    {
      type: "order.paid",
      data: { id: orderId, status: "paid", product_id: event.polarProductId ?? "", customer_email: user.email, metadata: { userId: user.id, reservationId: reservation.id } },
    },
    getDb(),
    now
  );
  if (outcome !== "ticketed") throw new Error(`expected a ticket, got ${outcome}`);
  return orderId;
}

export async function refundOrder(event: LiveEventRow, orderId: string, user: SeededUser): Promise<void> {
  await syncLiveTicketFromOrder(
    { type: "order.refunded", data: { id: orderId, status: "refunded", product_id: event.polarProductId ?? "", metadata: { userId: user.id } } },
    getDb()
  );
}

export async function auditRows(action: string, decision?: "allow" | "deny") {
  return getDb()
    .select()
    .from(operatorAuditLogs)
    .where(decision ? and(eq(operatorAuditLogs.action, action), eq(operatorAuditLogs.decision, decision)) : eq(operatorAuditLogs.action, action));
}

// ---------------------------------------------------------------------------
// Zoom HTTP API stand-in (behind global fetch)
// ---------------------------------------------------------------------------

/** 32 bytes, base64: seals join URLs during tests. */
export const TEST_ENCRYPTION_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)));

export function installZoomFetch() {
  const calls: { method: string; url: string }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    calls.push({ method, url });
    if (url.startsWith("https://zoom.us/oauth/token")) return Response.json({ access_token: "zoom-token", expires_in: 3600 });
    if (url.endsWith("/users/me/meetings")) return Response.json({ id: 987654321 });
    if (url.endsWith("/registrants") && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { email?: string };
      return Response.json({ registrant_id: `reg-${body.email}`, join_url: `https://zoom.us/w/987654321?tk=${encodeURIComponent(body.email ?? "")}` });
    }
    if (url.endsWith("/registrants/status")) return new Response(null, { status: 204 });
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

export function setZoomCredentials(enabled: boolean): void {
  for (const [key, value] of Object.entries({ ZOOM_ACCOUNT_ID: "acct", ZOOM_CLIENT_ID: "client", ZOOM_CLIENT_SECRET: "secret" })) {
    if (enabled) process.env[key] = value;
    else delete process.env[key];
  }
}
