/**
 * Idempotent seed for the six NLB ecosystem tools (see ecosystem-products-data.ts).
 *
 * Each product goes through the same path as a real submission: draft, validated revision,
 * submission, automated checks (safe fetch + screening), then a recorded human approval by the
 * directory admin. Logos and screenshots are uploaded to the MEDIA_PUBLIC R2 bucket under
 * content-addressed keys and served by the app's /media route. Re-running skips products whose
 * published document is unchanged; a changed document becomes a new moderated revision.
 * No votes, trust scores or traffic are written.
 *
 * Run (hi@ account, pinned; never the project .env):
 *   env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=7ac87c90789159ae1b10b7d78f5dcc08 \
 *     node_modules/.bin/tsx scripts/seed-ecosystem-products/seed-ecosystem-products.ts \
 *     --env staging [--dry-run] [--media-origin https://nextlevelbuilder.io] [--only anymd]
 *
 * Take a D1 export first: wrangler d1 export DB --remote --env <env> --output <file>.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { and, desc, eq } from "drizzle-orm";
import { createDb, type AppDb } from "@/lib/db";
import { members, organizations, productRevisions, products, users } from "@/lib/db/schema";
import { createProductDraft, createProductRevision } from "@/lib/domain/catalog";
import { executeAutomatedChecks, recordModerationDecision, submitRevisionForReview } from "@/lib/domain/moderation";
import { ECOSYSTEM_PRODUCTS } from "./ecosystem-products-data";
import { parseSeedArgs, planProduct, type PlannedProduct, type SeedOptions } from "./ecosystem-seed-plan";

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets");
/** The organization that owns this published listing also owns the ecosystem tools. */
const OWNER_ANCHOR_SLUG = "agentkit";
const APPROVAL_NOTE = "Ecosystem listing approved by the directory admin on the owner's instruction after automated checks passed.";

interface R2BucketLike {
  head(key: string): Promise<unknown | null>;
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string; cacheControl: string } }): Promise<unknown>;
}

interface SeedActors {
  orgId: string;
  submitterId: string;
  reviewerId: string;
}

interface SeedResult {
  slug: string;
  productId: string | null;
  action: "created" | "revised" | "unchanged" | "planned" | "held";
  revisionId: string | null;
  uploaded: number;
  detail?: string;
}

/** Writes a throwaway wrangler config that binds only the remote D1 database and public bucket. */
function writeRemoteConfig(options: SeedOptions): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlb-seed-"));
  const configPath = path.join(dir, "wrangler.json");
  const { target } = options;
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      name: "nlb-ecosystem-seed",
      compatibility_date: "2025-09-01",
      compatibility_flags: ["nodejs_compat"],
      d1_databases: [{ binding: "DB", database_name: target.databaseName, database_id: target.databaseId, remote: true }],
      r2_buckets: [{ binding: "MEDIA_PUBLIC", bucket_name: target.bucketName, remote: true }],
    }),
  );
  return configPath;
}

/** Resolves the owner org, its owner (submitter) and the admin reviewer from live data. */
async function resolveActors(db: AppDb): Promise<SeedActors> {
  const [anchor] = await db.select({ orgId: products.orgId }).from(products).where(eq(products.slug, OWNER_ANCHOR_SLUG)).limit(1);
  if (!anchor) throw new Error(`Anchor product '${OWNER_ANCHOR_SLUG}' not found; cannot resolve the owner organization`);
  const [org] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, anchor.orgId)).limit(1);
  if (!org) throw new Error("Owner organization row is missing");
  const [owner] = await db.select({ userId: members.userId }).from(members).where(and(eq(members.organizationId, org.id), eq(members.role, "owner"))).limit(1);
  if (!owner) throw new Error(`Organization ${org.name} has no owner member`);
  const admins = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "admin"));
  if (admins.length === 0) throw new Error("No admin user exists to record the moderation decision");
  const reviewer = admins.find((admin) => admin.name === "NLB Founder") ?? admins[0];
  console.log(`owner org: ${org.name} (${org.id}); submitter ${owner.userId}; reviewer ${reviewer.name} (${reviewer.id})`);
  return { orgId: org.id, submitterId: owner.userId, reviewerId: reviewer.id };
}

async function uploadAssets(bucket: R2BucketLike, plan: PlannedProduct, dryRun: boolean): Promise<number> {
  let uploaded = 0;
  for (const item of plan.uploads) {
    if (await bucket.head(item.key)) continue;
    if (dryRun) {
      uploaded += 1;
      continue;
    }
    await bucket.put(item.key, item.bytes, { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
    // The remote proxy can drop a request silently; confirm the object landed before a document points at it.
    const stored = (await bucket.head(item.key)) as { size?: number } | null;
    if (stored?.size !== item.bytes.byteLength) throw new Error(`Upload of ${item.key} could not be confirmed`);
    uploaded += 1;
  }
  return uploaded;
}

async function seedProduct(db: AppDb, bucket: R2BucketLike, actors: SeedActors, plan: PlannedProduct, dryRun: boolean): Promise<SeedResult> {
  const { seed, document, contentHash } = plan;
  const [existing] = await db.select().from(products).where(eq(products.slug, seed.slug)).limit(1);
  if (existing && existing.orgId !== actors.orgId) {
    throw new Error(`Slug '${seed.slug}' already belongs to another organization (${existing.orgId}); refusing to touch it`);
  }
  if (existing?.status === "published") {
    const [approved] = await db
      .select({ contentHash: productRevisions.contentHash })
      .from(productRevisions)
      .where(and(eq(productRevisions.productId, existing.id), eq(productRevisions.status, "approved")))
      .orderBy(desc(productRevisions.revisionNumber))
      .limit(1);
    if (approved?.contentHash === contentHash) {
      return { slug: seed.slug, productId: existing.id, action: "unchanged", revisionId: existing.currentRevisionId, uploaded: 0 };
    }
  }

  const uploaded = await uploadAssets(bucket, plan, dryRun);
  if (dryRun) return { slug: seed.slug, productId: existing?.id ?? null, action: "planned", revisionId: null, uploaded, detail: `hash ${contentHash.slice(0, 12)}` };

  const product =
    existing ??
    (await createProductDraft({ orgId: actors.orgId, slug: seed.slug, title: document.title, tagline: document.tagline, websiteUrl: document.websiteUrl, logoUrl: document.logoUrl }, db));
  const revision = await createProductRevision({ productId: product.id, createdBy: actors.submitterId, document }, db);
  const { modCase } = await submitRevisionForReview(
    { productId: product.id, revisionId: revision.id, submitterId: actors.submitterId, submissionNotes: `Open-source ecosystem tool, source ${seed.githubUrl}` },
    db,
  );
  const { fetchCheck, aiReport } = await executeAutomatedChecks(
    { caseId: modCase.id, websiteUrl: document.websiteUrl, title: document.title, tagline: document.tagline, description: document.description },
    db,
  );
  if (!fetchCheck.ok || !aiReport.isClean) {
    // Leave the case in human review instead of approving over a failed check.
    const detail = `checks need review: fetch ${fetchCheck.ok ? "ok" : `failed (${fetchCheck.error ?? fetchCheck.status})`}, screening flags ${aiReport.flags.join(",") || "none"}`;
    return { slug: seed.slug, productId: product.id, action: "held", revisionId: revision.id, uploaded, detail };
  }
  await recordModerationDecision(
    { caseId: modCase.id, decision: "approved", reasonCodes: ["meets_listing_policy"], humanReviewerId: actors.reviewerId, reviewerRole: "admin", notes: APPROVAL_NOTE },
    db,
  );
  return { slug: seed.slug, productId: product.id, action: existing ? "revised" : "created", revisionId: revision.id, uploaded };
}

async function main() {
  const options = parseSeedArgs(process.argv.slice(2));
  const selected = ECOSYSTEM_PRODUCTS.filter((seed) => !options.only || options.only.includes(seed.slug));
  if (selected.length === 0) throw new Error("No products match --only");

  // Validate every document locally before touching remote resources.
  const plans = selected.map((seed) => planProduct(seed, (file) => fs.readFileSync(path.join(ASSETS_DIR, seed.slug, file)), options.mediaOrigin));
  console.log(`${options.dryRun ? "[dry run] " : ""}seeding ${plans.length} products into ${options.target.env} (media origin ${options.mediaOrigin})`);

  if (process.env.CLOUDFLARE_API_TOKEN) throw new Error("Unset CLOUDFLARE_API_TOKEN; the seed must use the pinned wrangler OAuth login");
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("Set CLOUDFLARE_ACCOUNT_ID to the pinned account");

  const configPath = writeRemoteConfig(options);
  // Run wrangler from the temp dir so no project .env is read.
  process.chdir(path.dirname(configPath));
  const { getPlatformProxy } = await import("wrangler");
  const proxy = await getPlatformProxy<{ DB: D1Database; MEDIA_PUBLIC: R2BucketLike }>({ configPath, envFiles: [], persist: false, remoteBindings: true });
  const results: SeedResult[] = [];
  try {
    const db = createDb(proxy.env.DB);
    const actors = await resolveActors(db);
    for (const plan of plans) {
      const result = await seedProduct(db, proxy.env.MEDIA_PUBLIC, actors, plan, options.dryRun);
      results.push(result);
      console.log(`${result.slug}: ${result.action}${result.productId ? ` id=${result.productId}` : ""}${result.revisionId ? ` revision=${result.revisionId}` : ""} uploads=${result.uploaded}${result.detail ? ` (${result.detail})` : ""}`);
    }
  } finally {
    await proxy.dispose();
  }
  console.log(JSON.stringify({ env: options.target.env, dryRun: options.dryRun, results }, null, 2));
  if (results.some((result) => result.action === "held")) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
