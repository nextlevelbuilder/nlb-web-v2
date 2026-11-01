import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-api-key", async () => (await import("../live-api/live-api-fixtures")).authApiKeyMock);

import { getDb } from "@/lib/db";
import { assets, courseVideos, entitlements, members, organizations, products, rankingSnapshots } from "@/lib/db/schema";
import { GET as getLibrary } from "@/app/api/v1/courses/library/route";
import { GET as getVideo } from "@/app/api/v1/courses/videos/[slug]/route";
import { GET as listAssets } from "@/app/api/v1/assets/route";
import { GET as getAssetRoute } from "@/app/api/v1/assets/[id]/route";
import { GET as myDirectory } from "@/app/api/v1/directory/mine/route";
import { GET as getLeaderboard } from "@/app/api/v1/leaderboards/route";
import { asCaller, getRequest, nextSeq, params, readJson, seedUser, setCaller, type SeededUser } from "../live-api/live-api-fixtures";

beforeEach(() => setCaller(null));

async function seedVideo(status: "draft" | "published" | "archived" = "published") {
  const n = nextSeq();
  const [video] = await getDb()
    .insert(courseVideos)
    .values({ slug: `member-video-${n}`, title: `Week ${n}`, priceCents: 1900, status, polarProductId: `prod-video-${n}`, publishedAt: status === "draft" ? null : new Date() })
    .returning();
  return video;
}

async function seedOrg(member: SeededUser) {
  const n = nextSeq();
  const orgId = `org-${n}`;
  await getDb().insert(organizations).values({ id: orgId, name: `Org ${n}`, slug: `org-${n}` });
  await getDb().insert(members).values({ id: `m-${n}`, organizationId: orgId, userId: member.id });
  const asset = (status: string, publicUrl: string | null) => ({
    id: `asset-${status}-${n}`,
    orgId,
    storageKey: `staging/${orgId}/${status}.png`,
    mimeType: "image/png",
    sizeBytes: 10,
    checksumSha256: "x",
    status,
    publicUrl,
  });
  await getDb().insert(assets).values([asset("staging", null), asset("approved", "https://cdn.test/a.png")]);
  await getDb().insert(products).values({ id: `prod-${n}`, orgId, slug: `product-${n}`, title: "Tool", tagline: "Does things", websiteUrl: "https://tool.test", status: "draft" });
  return { orgId, stagingId: `asset-staging-${n}`, publicId: `asset-approved-${n}`, productId: `prod-${n}` };
}

describe("courses member API", () => {
  it("lists the library with canWatch from the shared policy and hides it from anonymous callers", async () => {
    const buyer = await seedUser("buyer");
    const bought = await seedVideo();
    const other = await seedVideo();
    await getDb().insert(entitlements).values({ userId: buyer.id, featureKey: `video:${bought.id}` });

    expect((await getLibrary(getRequest("/api/v1/courses/library"))).status).toBe(401);
    setCaller(asCaller(buyer, "session"));
    const library = await readJson(await getLibrary(getRequest("/api/v1/courses/library")));
    const bySlug = Object.fromEntries((library.data as { slug: string; canWatch: boolean }[]).map((item) => [item.slug, item.canWatch]));
    expect(bySlug[bought.slug]).toBe(true);
    expect(bySlug[other.slug]).toBe(false);
    const owned = await readJson(await getLibrary(getRequest("/api/v1/courses/library?owned=true")));
    expect((owned.data as { slug: string }[]).map((item) => item.slug)).toEqual([bought.slug]);
    expect(JSON.stringify(library.data)).not.toContain("prod-video");
  });

  it("returns one video with canWatch, never a draft, and refuses a banned caller", async () => {
    const buyer = await seedUser("buyer");
    const banned = await seedUser("banned", { banned: true });
    const video = await seedVideo("archived");
    const draft = await seedVideo("draft");
    await getDb().insert(entitlements).values({ userId: buyer.id, featureKey: `video:${video.id}` });
    const read = (slug: string) => getVideo(getRequest(`/api/v1/courses/videos/${slug}`), params({ slug }));

    expect((await readJson(await read(video.slug))).data).toMatchObject({ slug: video.slug, status: "archived", canWatch: false });
    expect((await read(draft.slug)).status).toBe(404);
    setCaller(asCaller(buyer, "session"));
    expect((await readJson(await read(video.slug))).data).toMatchObject({ canWatch: true });
    // An MCP delegation signed for mcp:read reads on the member's behalf.
    setCaller(asCaller(buyer, "delegation"), "mcp:read");
    expect((await readJson(await read(video.slug))).data).toMatchObject({ canWatch: true });
    setCaller(asCaller(banned, "session"));
    expect((await readJson(await read(video.slug))).data).toMatchObject({ canWatch: false });
  });
});

describe("assets member API", () => {
  it("lists an organization's assets only for its members, without storage keys", async () => {
    const owner = await seedUser("owner");
    const stranger = await seedUser("stranger");
    const org = await seedOrg(owner);

    expect((await listAssets(getRequest(`/api/v1/assets?orgId=${org.orgId}`))).status).toBe(401);
    setCaller(asCaller(owner, "session"));
    expect((await listAssets(getRequest("/api/v1/assets"))).status).toBe(400);
    const list = await readJson(await listAssets(getRequest(`/api/v1/assets?orgId=${org.orgId}`)));
    expect((list.data as { id: string }[]).map((row) => row.id).sort()).toEqual([org.publicId, org.stagingId].sort());
    expect(JSON.stringify(list.data)).not.toContain("storageKey");
    setCaller(asCaller(stranger, "api_key"));
    const denied = await listAssets(getRequest(`/api/v1/assets?orgId=${org.orgId}`));
    expect(denied.status).toBe(403);
    expect((await readJson(denied)).error?.code).toBe("no_entitlement");
  });

  it("serves promoted assets to anyone and unpromoted ones to organization members only", async () => {
    const owner = await seedUser("owner");
    const stranger = await seedUser("stranger");
    const org = await seedOrg(owner);
    const read = (id: string) => getAssetRoute(getRequest(`/api/v1/assets/${id}`), params({ id }));

    expect((await readJson(await read(org.publicId))).data).toMatchObject({ id: org.publicId, publicUrl: "https://cdn.test/a.png" });
    expect((await read(org.stagingId)).status).toBe(401);
    setCaller(asCaller(stranger, "session"));
    expect((await readJson(await read(org.stagingId))).error?.code).toBe("no_entitlement");
    expect((await readJson(await read("missing-asset"))).error?.code).toBe("not_available");
    setCaller(asCaller(owner, "delegation"), "mcp:read");
    expect((await readJson(await read(org.stagingId))).data).toMatchObject({ id: org.stagingId, status: "staging" });
  });
});

describe("directory and leaderboards member API", () => {
  it("lists the caller's own products across their organizations", async () => {
    const owner = await seedUser("owner");
    const stranger = await seedUser("stranger");
    const org = await seedOrg(owner);

    expect((await myDirectory(getRequest("/api/v1/directory/mine"))).status).toBe(401);
    setCaller(asCaller(owner, "session"));
    const mine = await readJson(await myDirectory(getRequest("/api/v1/directory/mine")));
    expect(mine.data.organizations).toMatchObject([{ orgId: org.orgId, role: "member" }]);
    expect(mine.data.products).toMatchObject([{ id: org.productId, status: "draft" }]);
    expect((await readJson(await myDirectory(getRequest("/api/v1/directory/mine?status=published")))).data.products).toEqual([]);
    setCaller(asCaller(stranger, "session"));
    expect((await readJson(await myDirectory(getRequest("/api/v1/directory/mine")))).data).toEqual({ organizations: [], products: [] });
  });

  it("reads the latest frozen directory leaderboard publicly and validates the board and window", async () => {
    expect((await readJson(await getLeaderboard(getRequest("/api/v1/leaderboards?window=weekly")))).data).toBeNull();
    await getDb().insert(rankingSnapshots).values({ windowType: "weekly", windowDate: "2026-10-26", ranks: [], snapshotHash: "h" });
    expect((await readJson(await getLeaderboard(getRequest("/api/v1/leaderboards?window=weekly")))).data).toMatchObject({ windowType: "weekly" });
    expect((await getLeaderboard(getRequest("/api/v1/leaderboards?board=builder"))).status).toBe(400);
    expect((await getLeaderboard(getRequest("/api/v1/leaderboards?window=yearly"))).status).toBe(400);
  });
});
