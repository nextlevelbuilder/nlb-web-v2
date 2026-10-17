import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaKeyFromSegments, publicMediaUrl } from "@/lib/media/public-media-url";
import { ECOSYSTEM_PRODUCTS } from "@/scripts/seed-ecosystem-products/ecosystem-products-data";
import { mediaStorageKey, parseSeedArgs, planProduct } from "@/scripts/seed-ecosystem-products/ecosystem-seed-plan";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test");
});

describe("public media paths", () => {
  it("maps safe /media paths to R2 keys with a content type", () => {
    expect(mediaKeyFromSegments(["products", "anymd", "logo-1a2b3c4d.webp"])).toEqual({ key: "public/products/anymd/logo-1a2b3c4d.webp", contentType: "image/webp" });
    expect(mediaKeyFromSegments(["uploads", "a.svg"])?.contentType).toBe("image/svg+xml");
  });

  it("rejects traversal, unknown extensions and odd depths", () => {
    expect(mediaKeyFromSegments(["..", "secret.webp"])).toBeNull();
    expect(mediaKeyFromSegments(["uploads", "a..b.webp"])).toBeNull();
    expect(mediaKeyFromSegments(["uploads", "script.js"])).toBeNull();
    expect(mediaKeyFromSegments(["logo.webp"])).toBeNull();
    expect(mediaKeyFromSegments(["a", "b", "c", "d", "e", "f", "g.webp"])).toBeNull();
    expect(mediaKeyFromSegments(["uploads", ".hidden.webp"])).toBeNull();
  });

  it("builds URLs on the site or a given origin", () => {
    expect(publicMediaUrl("public/uploads/x.png")).toBe("https://example.test/media/uploads/x.png");
    expect(publicMediaUrl("public/uploads/x.png", "https://worker.test/")).toBe("https://worker.test/media/uploads/x.png");
  });
});

describe("ecosystem product seed", () => {
  it("parses arguments and refuses unsafe origins", () => {
    const options = parseSeedArgs(["--env", "staging", "--dry-run", "--only", "anymd, ak-render"]);
    expect(options.target.databaseName).toBe("nlb-staging");
    expect(options.dryRun).toBe(true);
    expect(options.only).toEqual(["anymd", "ak-render"]);
    expect(options.mediaOrigin).toBe("https://nextlevelbuilder-web-staging.hi-7ac.workers.dev");
    expect(parseSeedArgs(["--env", "production", "--media-origin", "https://nextlevelbuilder.io"]).mediaOrigin).toBe("https://nextlevelbuilder.io");
    expect(() => parseSeedArgs([])).toThrow(/--env/);
    expect(() => parseSeedArgs(["--env", "prod"])).toThrow(/--env/);
    expect(() => parseSeedArgs(["--env", "staging", "--media-origin", "http://insecure.test"])).toThrow(/https/);
    expect(() => parseSeedArgs(["--env", "staging", "--media-origin", "https://x.test/path"])).toThrow(/bare/);
  });

  it("keys media by content so changed files get new URLs", () => {
    const a = mediaStorageKey("anymd", "logo.webp", new Uint8Array([1, 2, 3]));
    expect(a).toMatch(/^public\/products\/anymd\/logo-[0-9a-f]{8}\.webp$/);
    expect(mediaStorageKey("anymd", "logo.webp", new Uint8Array([1, 2, 3]))).toBe(a);
    expect(mediaStorageKey("anymd", "logo.webp", new Uint8Array([3, 2, 1]))).not.toBe(a);
  });

  it("builds a schema-valid document for every product from the committed assets", () => {
    const assets = path.join(process.cwd(), "scripts/seed-ecosystem-products/assets");
    expect(ECOSYSTEM_PRODUCTS.map((seed) => seed.slug)).toEqual(["multix-cli", "cloud-harness-mcp", "design-studio-ai", "ak-render", "3dviz-pro-max", "anymd"]);
    for (const seed of ECOSYSTEM_PRODUCTS) {
      const plan = planProduct(seed, (file) => fs.readFileSync(path.join(assets, seed.slug, file)), "https://worker.test");
      expect(plan.uploads).toHaveLength(seed.media.length + 1);
      expect(plan.document.logoUrl).toBe(`https://worker.test/media/${plan.uploads[0].key.replace("public/", "")}`);
      const gallery = plan.document.blocks.find((block) => block.type === "mediaGallery");
      expect(gallery).toBeTruthy();
      const founder = plan.document.blocks.find((block) => block.type === "founder") as { props: { name: string } } | undefined;
      expect(founder?.props.name).toBe(seed.maker === "viet" ? "Viet Tran" : "Duy Nguyen");
      expect(plan.contentHash).toMatch(/^[0-9a-f]{16,}$/);
    }
  });
});
