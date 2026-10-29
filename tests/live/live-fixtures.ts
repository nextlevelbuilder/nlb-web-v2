import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createEventDraft, openSales, type LiveEventRow } from "@/lib/live/events";
import { transitionEvent } from "@/lib/live/event-lifecycle";
import { ensureLiveTicketPolarProduct, type LivePolarProductsClient } from "@/lib/live/live-polar-product";
import { createTopic, createTopicGroup } from "@/lib/live/topics";

/** Shared seeds for the Live domain tests (each test file runs on its own in-memory D1). */
let seq = 0;
export const nextSeq = () => ++seq;

export const HOUR = 60 * 60 * 1000;

export async function seedUser(prefix = "user"): Promise<{ id: string; email: string }> {
  const n = nextSeq();
  const id = `${prefix}-${n}`;
  const email = `${prefix}${n}@example.com`;
  await getDb().insert(users).values({ id, name: `Live ${prefix} ${n}`, email, emailVerified: true });
  return { id, email };
}

export async function seedTopics(count: number): Promise<string[]> {
  const n = nextSeq();
  const group = await createTopicGroup({ slug: `group-${n}`, titleEn: "Group", titleVi: "Nhóm" }, getDb());
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const topic = await createTopic(
      { groupId: group.id, slug: `topic-${n}-${i}`, titleEn: `Topic ${i}`, titleVi: `Chủ đề ${i}`, createdBy: "op" },
      getDb()
    );
    ids.push(topic.id);
  }
  return ids;
}

export function fakePolarProducts(productId: string): LivePolarProductsClient {
  return {
    products: {
      create: async () => ({ id: productId }),
      update: async () => ({ id: productId }),
    },
  } as unknown as LivePolarProductsClient;
}

export async function seedDraftEvent(overrides: Partial<Parameters<typeof createEventDraft>[0]> = {}): Promise<LiveEventRow> {
  const n = nextSeq();
  const startsAt = new Date(Date.UTC(2030, 0, 10, 12, 0));
  return createEventDraft(
    {
      slug: `event-${n}`,
      titleEn: `Live ${n}`,
      titleVi: `Trực tiếp ${n}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * HOUR),
      hostName: "Host",
      capacity: 10,
      priceCents: 1900,
      recordingNoticeEn: "This session is recorded.",
      recordingNoticeVi: "Buổi này được ghi hình.",
      createdBy: "op",
      ...overrides,
    },
    getDb()
  );
}

/** A draft taken through product creation, scheduling and opening sales. */
export async function seedOnSaleEvent(overrides: Partial<Parameters<typeof createEventDraft>[0]> = {}): Promise<LiveEventRow> {
  const draft = await seedDraftEvent(overrides);
  await ensureLiveTicketPolarProduct(draft, getDb(), fakePolarProducts(`polar-live-${draft.slug}`));
  await transitionEvent(draft.id, "scheduled", getDb());
  const { event } = await openSales(draft.id, getDb());
  return event;
}

/** Base64 of 32 bytes, for sealing join URLs in tests. */
export const TEST_ENCRYPTION_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)));
