import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth-api-key", async () => (await import("../live-api/live-api-fixtures")).authApiKeyMock);

import { getDb } from "@/lib/db";
import { assets, moderationCases, moderationDecisions, operatorAuditLogs, organizations, productRevisions, products, submissions } from "@/lib/db/schema";
import { GET as listVideos, POST as createVideo } from "@/app/api/v1/operator/courses/videos/route";
import { GET as getVideo, PATCH as patchVideo } from "@/app/api/v1/operator/courses/videos/[slug]/route";
import { POST as publishVideo } from "@/app/api/v1/operator/courses/videos/[slug]/publish/route";
import { POST as archiveVideo } from "@/app/api/v1/operator/courses/videos/[slug]/archive/route";
import { GET as listAssets } from "@/app/api/v1/operator/assets/route";
import { POST as promoteAsset } from "@/app/api/v1/operator/assets/[id]/promote/route";
import { POST as rejectAsset } from "@/app/api/v1/operator/assets/[id]/reject/route";
import { GET as listProducts } from "@/app/api/v1/operator/directory/products/route";
import { GET as moderationQueue } from "@/app/api/v1/operator/directory/moderation/route";
import { POST as decideCase } from "@/app/api/v1/operator/directory/moderation/[caseId]/decision/route";
import { POST as computeRanking } from "@/app/api/v1/operator/directory/rankings/route";
import { asCaller, getRequest, jsonRequest, nextSeq, params, readJson, seedOperator, seedUser, setCaller } from "../live-api/live-api-fixtures";
import { approvedBy, requestVia } from "./operator-api-fixtures";

const auditRows = (actorUserId: string, action: string) =>
  getDb().select().from(operatorAuditLogs).where(and(eq(operatorAuditLogs.actorUserId, actorUserId), eq(operatorAuditLogs.action, action)));

const videoPath = (slug: string) => `/api/v1/operator/courses/videos/${slug}`;

async function seedAsset(status = "staging") {
  const n = nextSeq();
  const [row] = await getDb()
    .insert(assets)
    .values({ orgId: `org-${n}`, storageKey: `staging/${n}.png`, mimeType: "image/png", sizeBytes: 10, checksumSha256: `sum-${n}`, status })
    .returning();
  return row;
}

async function seedModerationCase() {
  const n = nextSeq();
  const db = getDb();
  await db.insert(organizations).values({ id: `org-mod-${n}`, name: "Org", slug: `org-mod-${n}` });
  const [product] = await db
    .insert(products)
    .values({ orgId: `org-mod-${n}`, slug: `tool-${n}`, title: "Tool", tagline: "Does things", websiteUrl: "https://tool.example", status: "in_review" })
    .returning();
  const [revision] = await db
    .insert(productRevisions)
    .values({ productId: product.id, contentHash: `hash-${n}`, title: "Tool", tagline: "Does things", description: "A tool", document: {}, createdBy: "maker" })
    .returning();
  const [submission] = await db.insert(submissions).values({ productId: product.id, revisionId: revision.id, submitterId: "maker" }).returning();
  const [modCase] = await db.insert(moderationCases).values({ submissionId: submission.id, status: "in_review" }).returning();
  return { product, modCase };
}

beforeEach(() => setCaller(null));

describe("content operators: access", () => {
  it("refuses members, operators of another domain and API keys, and audits each deny", async () => {
    const member = await seedUser("member");
    const assetsOperator = await seedOperator(["assets:manage"]);
    const keyOperator = await seedOperator(["courses:manage"]);
    expect((await listVideos(getRequest("/api/v1/operator/courses/videos"))).status).toBe(401);

    const cases: [typeof member, "session" | "api_key", string][] = [
      [member, "session", "not_operator"],
      [assetsOperator, "session", "missing_capability"],
      [keyOperator, "api_key", "credential_not_allowed"],
    ];
    for (const [user, authType, code] of cases) {
      setCaller(asCaller(user, authType));
      const response = await createVideo(jsonRequest("/api/v1/operator/courses/videos", "POST", { junk: true }));
      expect(response.status).toBe(403);
      expect((await readJson(response)).error?.code).toBe(code);
      expect(await auditRows(user.id, "courses.video.create")).toMatchObject([{ decision: "deny", reason: code, resource: "operator:courses" }]);
    }

    // A courses operator still cannot touch assets or the directory.
    setCaller(asCaller(keyOperator, "session"));
    expect((await listAssets(getRequest("/api/v1/operator/assets"))).status).toBe(403);
    expect((await moderationQueue(getRequest("/api/v1/operator/directory/moderation"))).status).toBe(403);
  });
});

describe("content operators: Courses", () => {
  it("creates, lists every status, reads and patches a video through the Courses domain", async () => {
    const operator = await seedOperator(["courses:manage"]);
    setCaller(asCaller(operator, "session"));
    const slug = `ops-video-${nextSeq()}`;
    const created = await createVideo(jsonRequest("/api/v1/operator/courses/videos", "POST", { slug, title: "Ops video", priceCents: 1900 }));
    expect(created.status).toBe(201);
    const videoId = (await readJson(created)).data.id as string;
    expect((await readJson(await getVideo(getRequest(videoPath(slug)), params({ slug })))).data).toMatchObject({ id: videoId, slug, status: "draft", streamUid: null, polarProductId: null });
    const duplicate = await createVideo(jsonRequest("/api/v1/operator/courses/videos", "POST", { slug, title: "Ops video", priceCents: 1900 }));
    expect((await readJson(duplicate)).error?.code).toBe("slug_taken");

    const drafts = await readJson(await listVideos(getRequest("/api/v1/operator/courses/videos?status=draft")));
    expect(drafts.data.map((video: { slug: string }) => video.slug)).toContain(slug);
    expect((await listVideos(getRequest("/api/v1/operator/courses/videos?status=nope"))).status).toBe(400);

    const read = await getVideo(getRequest(videoPath(slug)), params({ slug }));
    expect((await readJson(read)).data).toMatchObject({ slug, status: "draft" });
    expect((await getVideo(getRequest(videoPath("missing")), params({ slug: "missing" }))).status).toBe(404);

    const patched = await patchVideo(jsonRequest(videoPath(slug), "PATCH", { title: "Renamed video" }), params({ slug }));
    expect((await readJson(patched)).data).toMatchObject({ title: "Renamed video" });
    // Archiving is sensitive and never goes through a plain patch.
    const archivedByPatch = await patchVideo(jsonRequest(videoPath(slug), "PATCH", { status: "archived" }), params({ slug }));
    expect(archivedByPatch.status).toBe(400);

    // Domain refusals keep their status and code.
    const publish = await publishVideo(jsonRequest(`${videoPath(slug)}/publish`, "POST"), params({ slug }));
    expect(publish.status).toBe(422);
    expect((await readJson(publish)).error?.code).toBe("stream_uid_required");

    expect(await auditRows(operator.id, "courses.video.update")).toEqual(
      expect.arrayContaining([expect.objectContaining({ decision: "allow", resource: `video:${videoId}` })])
    );
  });

  it("archives a video only with an approval from a different operator bound to its slug", async () => {
    const requester = await seedOperator(["courses:manage"]);
    const approver = await seedOperator(["courses:manage"]);
    setCaller(asCaller(requester, "session"));
    const slug = `ops-archive-${nextSeq()}`;
    const other = `ops-archive-${nextSeq()}`;
    for (const value of [slug, other]) {
      expect((await createVideo(jsonRequest("/api/v1/operator/courses/videos", "POST", { slug: value, title: "Archive me", priceCents: 1900 }))).status).toBe(201);
    }
    const archive = (target: string, approvalId: string) => archiveVideo(jsonRequest(`${videoPath(target)}/archive`, "POST", { approvalId }), params({ slug: target }));

    expect((await readJson(await archive(slug, "nope"))).error?.code).toBe("approval_not_found");
    expect(await requestVia(requester, "courses", "courses.video.archive", { slug: "missing" }, 404)).toBe("not_found");

    const approvalId = await approvedBy(requester, approver, "courses", "courses.video.archive", { slug });
    // The approval is bound to one video: using it for another is refused.
    expect((await readJson(await archive(other, approvalId))).error?.code).toBe("approval_mismatch");
    const archived = await archive(slug, approvalId);
    expect(archived.status).toBe(200);
    const body = await readJson(archived);
    expect(body.data).toMatchObject({ slug, status: "archived" });
    expect((await readJson(await archive(slug, approvalId))).error?.code).toBe("approval_already_used");
    expect(await auditRows(requester.id, "courses.video.archive")).toEqual(
      expect.arrayContaining([expect.objectContaining({ decision: "allow", resource: `video:${body.data.id}`, approvalId })])
    );
  });
});

describe("content operators: assets", () => {
  it("lists, promotes and rejects staging assets through the media domain", async () => {
    const operator = await seedOperator(["assets:manage"]);
    setCaller(asCaller(operator, "session"));
    const toPromote = await seedAsset();
    const toReject = await seedAsset();

    const staging = await readJson(await listAssets(getRequest(`/api/v1/operator/assets?status=staging&orgId=${toPromote.orgId}`)));
    expect(staging.data).toEqual([expect.objectContaining({ id: toPromote.id, status: "staging", storageKey: toPromote.storageKey })]);
    expect((await listAssets(getRequest("/api/v1/operator/assets?status=nope"))).status).toBe(400);

    const promoted = await promoteAsset(jsonRequest(`/api/v1/operator/assets/${toPromote.id}/promote`, "POST"), params({ id: toPromote.id }));
    expect(promoted.status).toBe(200);
    expect((await readJson(promoted)).data).toMatchObject({ id: toPromote.id, status: "approved", publicUrl: expect.stringMatching(/\/media\/\d+\.png$/) });
    const again = await promoteAsset(jsonRequest(`/api/v1/operator/assets/${toPromote.id}/promote`, "POST"), params({ id: toPromote.id }));
    expect((await readJson(again)).error?.code).toBe("asset_not_staging");

    const reject = (id: string, body: unknown) => rejectAsset(jsonRequest(`/api/v1/operator/assets/${id}/reject`, "POST", body), params({ id }));
    expect((await reject(toReject.id, {})).status).toBe(400);
    const rejected = await reject(toReject.id, { reason: "Logo is blurry" });
    expect((await readJson(rejected)).data).toMatchObject({ id: toReject.id, status: "rejected", publicUrl: null });
    expect((await readJson(await reject(toPromote.id, { reason: "Too late" }))).error?.code).toBe("asset_not_staging");
    expect((await reject("missing", { reason: "x" })).status).toBe(404);

    expect(await auditRows(operator.id, "assets.asset.promote")).toEqual(
      expect.arrayContaining([expect.objectContaining({ decision: "allow", resource: `asset:${toPromote.id}` })])
    );
  });
});

describe("content operators: directory", () => {
  it("decides a moderation case as a named human, from a session only, and publishes the product", async () => {
    const operator = await seedOperator(["directory:manage"]);
    const { product, modCase } = await seedModerationCase();
    const decide = (body: unknown) => decideCase(jsonRequest(`/api/v1/operator/directory/moderation/${modCase.id}/decision`, "POST", body), params({ caseId: modCase.id }));

    setCaller(asCaller(operator, "delegation"), "mcp:operator");
    const queue = await readJson(await moderationQueue(getRequest("/api/v1/operator/directory/moderation")));
    expect(queue.data.map((row: { caseId: string }) => row.caseId)).toContain(modCase.id);
    const byAgent = await decide({ decision: "approved", reasonCodes: ["meets_policy"] });
    expect(byAgent.status).toBe(403);
    expect((await readJson(byAgent)).error?.code).toBe("session_required");

    setCaller(asCaller(operator, "session"));
    expect((await decide({ decision: "approved", reasonCodes: [] })).status).toBe(400);
    const decided = await decide({ decision: "approved", reasonCodes: ["meets_policy"], notes: "Looks good" });
    expect(decided.status).toBe(200);
    const [decision] = await getDb().select().from(moderationDecisions).where(eq(moderationDecisions.caseId, modCase.id));
    expect(decision).toMatchObject({ decision: "approved", humanReviewerId: operator.id, reviewerRole: "operator:directory" });
    const [published] = await getDb().select().from(products).where(eq(products.id, product.id));
    expect(published.status).toBe("published");
    expect((await readJson(await decide({ decision: "rejected", reasonCodes: ["late"] }))).error?.code).toBe("case_decided");

    const listed = await readJson(await listProducts(getRequest("/api/v1/operator/directory/products?status=published")));
    expect(listed.data.map((row: { id: string }) => row.id)).toContain(product.id);
    expect(await auditRows(operator.id, "directory.moderation.decide")).toEqual(
      expect.arrayContaining([expect.objectContaining({ decision: "allow", resource: `moderation_case:${modCase.id}` })])
    );
  });

  it("computes a leaderboard snapshot", async () => {
    const operator = await seedOperator(["directory:manage"]);
    setCaller(asCaller(operator, "session"));
    expect((await computeRanking(jsonRequest("/api/v1/operator/directory/rankings", "POST", { windowType: "hourly" }))).status).toBe(400);
    const computed = await computeRanking(jsonRequest("/api/v1/operator/directory/rankings", "POST", { windowType: "weekly", windowDate: "2026-10-31" }));
    expect(computed.status).toBe(201);
    expect((await readJson(computed)).data).toMatchObject({ windowType: "weekly" });
  });
});
