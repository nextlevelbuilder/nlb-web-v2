import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as getSpec } from "@/app/api/openapi.json/route";
import { livePaths, liveSchemas } from "@/lib/live/openapi";
import { getDb } from "@/lib/db";
import { liveTicketReservations } from "@/lib/db/schema";
import { holdSeat } from "@/lib/live/seats";
import { LIVE_SEAT_HOLD_MS } from "@/lib/live/types";
import { LIVE_CRON, runLiveSweeps } from "@/lib/live/live-cron";
import { seedOnSaleEvent, seedUser } from "./live-api-fixtures";

type Operation = { operationId?: string; security?: unknown; tags?: string[] };
type Spec = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, unknown> } };

describe("Live OpenAPI module", () => {
  it("documents the member and operator paths, ready to merge without replacing any existing path or schema", async () => {
    const spec = (await (await getSpec()).json()) as Spec;
    const liveKeys = Object.keys(livePaths);
    expect(liveKeys).toEqual(
      expect.arrayContaining([
        "/api/v1/live/events",
        "/api/v1/live/events/{slug}",
        "/api/v1/live/events/{slug}/checkout",
        "/api/v1/live/events/{slug}/ticket",
        "/api/v1/live/events/{slug}/join",
        "/api/v1/live/polls/current",
        "/api/v1/live/polls/{roundId}/vote",
        "/api/v1/live-admin/approvals",
        "/api/v1/live-admin/approvals/{id}",
        "/api/v1/live-admin/approvals/{id}/decision",
        "/api/v1/live-admin/tickets/{id}/refund",
        "/api/v1/live-admin/events/{id}/cancel",
        "/api/v1/live-admin/rounds/{id}/override",
        "/api/v1/live-admin/audit",
      ])
    );
    // Live paths live under their own prefixes and schemas under their own names, so merging the
    // module at launch can never shadow an existing path or schema...
    for (const key of liveKeys) {
      expect(key).toMatch(/^\/api\/v1\/live(-admin)?\//);
      expect(spec.paths[key]).toBeUndefined();
    }
    for (const key of Object.keys(liveSchemas)) {
      expect(key).toMatch(/^Live/);
      expect(spec.components.schemas[key]).toBeUndefined();
    }
    // ...and operation ids stay unique across the merged document.
    const merged = { ...spec.paths, ...(JSON.parse(JSON.stringify(livePaths)) as Spec["paths"]) };
    const ids = Object.values(merged).flatMap((methods) => Object.values(methods).map((op) => op.operationId).filter(Boolean));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps Live out of the public document until launch", async () => {
    const spec = (await (await getSpec()).json()) as Spec;
    expect(Object.keys(spec.paths).filter((key) => key.startsWith("/api/v1/live"))).toEqual([]);
    expect(Object.keys(spec.components.schemas).filter((key) => key.startsWith("Live"))).toEqual([]);
    const tags = Object.values(spec.paths).flatMap((methods) => Object.values(methods).flatMap((op) => op.tags ?? []));
    expect(tags.some((tag) => tag.startsWith("NLB Live"))).toBe(false);

    // Existing contract spot checks.
    expect(spec.paths["/api/v1/votes"].post.security).toEqual([{ SessionAuth: [] }]);
    expect(spec.paths["/api/v1/products/{slug}/pulse"]).toBeDefined();
    expect(spec.components.schemas.PulseSummary).toBeDefined();
  });
});

describe("Live sweeps", () => {
  it("reuses the existing every-minute trigger", () => {
    expect(LIVE_CRON).toBe("* * * * *");
  });

  it("returns expired holds to the pool and tolerates a missing meeting provider", async () => {
    const event = await seedOnSaleEvent({ capacity: 2 });
    const user = await seedUser("sweep");
    const heldAt = new Date();
    const { reservation } = await holdSeat({ eventId: event.id, userId: user.id, now: heldAt, recordingConsent: true }, getDb());

    const before = await runLiveSweeps(getDb(), heldAt, null);
    expect(before.errors).toEqual([]);
    const later = await runLiveSweeps(getDb(), new Date(heldAt.getTime() + LIVE_SEAT_HOLD_MS + 1000), null);
    expect(later.errors).toEqual([]);
    expect(later.seatsReleased).toBeGreaterThanOrEqual(1);
    const [row] = await getDb().select().from(liveTicketReservations).where(eq(liveTicketReservations.id, reservation.id));
    expect(row.status).toBe("expired");
  });
});
