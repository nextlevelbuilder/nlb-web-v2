import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "./helpers/local-d1";
import { castVote } from "@/lib/domain/analytics";
import { createProductDraft, createProductRevision } from "@/lib/domain/catalog";
import { recordModerationDecision, submitRevisionForReview } from "@/lib/domain/moderation";
import { domainEvents, organizations, outboxEvents, products, productRevisions, users, votes } from "@/lib/db/schema";

vi.mock("@/lib/polar", () => ({ PRODUCT_IDS: {} }));

const document = {
  schemaVersion: 1 as const,
  title: "Echo SaaS",
  tagline: "Voice AI for solopreneurs",
  description: "Transform meetings into actionable insights in seconds.",
  websiteUrl: "https://echosaas.ai",
  categorySlugs: ["ai-tools"],
  tagSlugs: [],
  blocks: [],
};

describe("D1 batch replacements for Postgres transactions", () => {
  let local: LocalD1;

  beforeEach(async () => {
    local = await createLocalD1();
    await local.db.insert(organizations).values({ id: "org-1", name: "Org", slug: "org" });
    await local.db.insert(users).values({ id: "user-1", name: "U", email: "u@example.com" });
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await local.dispose();
  });

  it("counts one vote per user per UTC day and never bumps the counter on duplicates", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const product = await createProductDraft(
      { orgId: "org-1", slug: "echo", title: "Echo", tagline: "t", websiteUrl: "https://echo.ai" },
      local.db
    );
    await castVote({ productId: product.id, userId: "user-1" }, local.db);
    await expect(castVote({ productId: product.id, userId: "user-1" }, local.db)).rejects.toThrow("already voted");
    const [row] = await local.db.select().from(products).where(eq(products.id, product.id));
    expect(row.trustScore).toBe(1);
    expect(await local.db.select().from(votes)).toHaveLength(1);
  });

  it("creates a revision and advances the product pointer atomically", async () => {
    const product = await createProductDraft(
      { orgId: "org-1", slug: "echo", title: "Echo", tagline: "t", websiteUrl: "https://echo.ai" },
      local.db
    );
    const first = await createProductRevision({ productId: product.id, createdBy: "user-1", document }, local.db);
    const second = await createProductRevision({ productId: product.id, createdBy: "user-1", document }, local.db);
    expect(second.revisionNumber).toBe(first.revisionNumber + 1);
    expect(second.document).toEqual(expect.objectContaining({ title: "Echo SaaS" }));
    const [row] = await local.db.select().from(products).where(eq(products.id, product.id));
    expect(row.currentRevisionId).toBe(second.id);
    expect(row.title).toBe("Echo SaaS");
  });

  it("submits for review and publishes with a domain event + outbox row on approval", async () => {
    const product = await createProductDraft(
      { orgId: "org-1", slug: "echo", title: "Echo", tagline: "t", websiteUrl: "https://echo.ai" },
      local.db
    );
    const revision = await createProductRevision({ productId: product.id, createdBy: "user-1", document }, local.db);
    const { submission, modCase } = await submitRevisionForReview(
      { productId: product.id, revisionId: revision.id, submitterId: "user-1" },
      local.db
    );
    expect(modCase.submissionId).toBe(submission.id);
    const [submitted] = await local.db.select().from(products).where(eq(products.id, product.id));
    expect(submitted.status).toBe("submitted");

    const decision = await recordModerationDecision(
      { caseId: modCase.id, decision: "approved", reasonCodes: ["ok"], humanReviewerId: "user-1", reviewerRole: "admin" },
      local.db
    );
    expect(decision.decisionHash).toHaveLength(64);
    const [published] = await local.db.select().from(products).where(eq(products.id, product.id));
    expect(published).toMatchObject({ status: "published", currentRevisionId: revision.id });
    const [approvedRevision] = await local.db.select().from(productRevisions).where(eq(productRevisions.id, revision.id));
    expect(approvedRevision.status).toBe("approved");
    const [event] = await local.db.select().from(domainEvents);
    const [outbox] = await local.db.select().from(outboxEvents);
    expect(event.eventType).toBe("listing.published");
    expect(outbox.eventId).toBe(event.eventId);
  });

  it("rejects decisions without a human reviewer", async () => {
    await expect(
      recordModerationDecision(
        { caseId: "missing", decision: "approved", reasonCodes: ["ok"], humanReviewerId: "", reviewerRole: "admin" },
        local.db
      )
    ).rejects.toThrow("Human reviewer ID is required");
  });
});
