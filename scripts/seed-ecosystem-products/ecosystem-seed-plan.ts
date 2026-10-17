/**
 * Pure planning helpers for the ecosystem product seed: argument parsing, content-addressed R2 keys
 * and validated product documents. Kept free of wrangler and D1 so it can be unit tested.
 */
import crypto from "crypto";
import { ProductDocumentSchema, computeContentHash, type ProductDocument } from "@/packages/contracts/src";
import { publicMediaUrl } from "@/lib/media/public-media-url";
import { galleryBlock, type EcosystemProductSeed } from "./ecosystem-products-data";

export type SeedEnvironment = "staging" | "production";

export interface SeedTarget {
  env: SeedEnvironment;
  /** Wrangler env flag value: "staging" or "" for the top-level production config. */
  wranglerEnv: string;
  databaseName: string;
  databaseId: string;
  bucketName: string;
  /** Origin whose /media route serves MEDIA_PUBLIC, and which hosts /img/founders avatars. */
  defaultMediaOrigin: string;
}

/** Mirrors wrangler.jsonc; the seed writes to these resources only. */
export const SEED_TARGETS: Record<SeedEnvironment, SeedTarget> = {
  staging: {
    env: "staging",
    wranglerEnv: "staging",
    databaseName: "nlb-staging",
    databaseId: "e5ae18de-8fb3-468e-a9b4-53618b2f0748",
    bucketName: "nlb-media-staging-public",
    defaultMediaOrigin: "https://nextlevelbuilder-web-staging.hi-7ac.workers.dev",
  },
  production: {
    env: "production",
    wranglerEnv: "",
    databaseName: "nlb-prod",
    databaseId: "26d63f67-6c10-43bc-9e92-62062b8e8f79",
    bucketName: "nlb-media-public",
    defaultMediaOrigin: "https://nextlevelbuilder-web.hi-7ac.workers.dev",
  },
};

export interface SeedOptions {
  target: SeedTarget;
  dryRun: boolean;
  mediaOrigin: string;
  only: string[] | null;
}

/** Parses `--env staging|production [--dry-run] [--media-origin https://…] [--only slug,slug]`. */
export function parseSeedArgs(argv: string[]): SeedOptions {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`${flag} needs a value`);
    return next;
  };
  const env = value("--env");
  if (env !== "staging" && env !== "production") throw new Error("--env must be staging or production");
  const target = SEED_TARGETS[env];
  const origin = value("--media-origin") ?? target.defaultMediaOrigin;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`--media-origin is not a URL: ${origin}`);
  }
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search) throw new Error("--media-origin must be a bare https origin");
  const only = value("--only")?.split(",").map((slug) => slug.trim()).filter(Boolean) ?? null;
  return { target, dryRun: argv.includes("--dry-run"), mediaOrigin: parsed.origin, only };
}

/** Content-addressed key, so a changed file gets a new URL and immutable caching stays correct. */
export function mediaStorageKey(slug: string, file: string, bytes: Uint8Array): string {
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  const dot = file.lastIndexOf(".");
  return `public/products/${slug}/${file.slice(0, dot)}-${hash}${file.slice(dot)}`;
}

export interface PlannedProduct {
  seed: EcosystemProductSeed;
  /** Every file to upload: R2 key, local file name and bytes. */
  uploads: Array<{ key: string; file: string; bytes: Uint8Array }>;
  document: ProductDocument;
  contentHash: string;
}

/** Builds the upload list and the validated document for one product from its local asset bytes. */
export function planProduct(seed: EcosystemProductSeed, readAsset: (file: string) => Uint8Array, mediaOrigin: string): PlannedProduct {
  const upload = (file: string) => {
    const bytes = readAsset(file);
    return { key: mediaStorageKey(seed.slug, file, bytes), file, bytes };
  };
  const logo = upload(seed.logoFile);
  const media = seed.media.map((item) => upload(item.file));
  const document = ProductDocumentSchema.parse(
    seed.document({
      logo: publicMediaUrl(logo.key, mediaOrigin),
      avatar: `${mediaOrigin}/img/founders/${seed.maker}.webp`,
      gallery: galleryBlock(seed.media, media.map((item) => publicMediaUrl(item.key, mediaOrigin))),
    }),
  );
  return { seed, uploads: [logo, ...media], document, contentHash: computeContentHash(document) };
}
