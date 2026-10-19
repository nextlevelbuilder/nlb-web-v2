import { describe, expect, it } from "vitest";
import { GET as getDocs } from "@/app/api-docs/route";
import { GET as getLegacyDocs } from "@/app/api/docs/route";
import { GET as getSpec } from "@/app/api/openapi.json/route";
import { BlockSchema } from "@/packages/contracts/src/blocks";

describe("interactive API documentation", () => {
  it("serves a readable index and pinned interactive reference at the requested URL", async () => {
    const response = await getDocs();
    const html = await response.text();
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(html).toContain("Scalar.createApiReference");
    expect(html).toContain("@scalar/api-reference@1.68.0");
    expect(html).toContain('"persistAuth":false');
    expect(html).not.toContain("proxy.scalar.com");
    expect(html).toContain("/api/v1/products/{slug}/pulse");
    expect(html).toContain("/api/v1/products/{slug}/traffic");
    expect(html).toContain("https://nextlevelbuilder.io/mcp");
    expect(html).toContain('href="/api-docs.md"');
  });

  it("retains the old documentation URL through a permanent redirect", () => {
    const response = getLegacyDocs(new Request("https://nextlevelbuilder.io/api/docs"));
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("https://nextlevelbuilder.io/api-docs");
  });

  it("derives every block and the actual document envelope from the runtime schema", async () => {
    const spec = await (await getSpec()).json();
    const document = spec.components.schemas.ProductDocument;
    expect(document.properties.schemaVersion.type).toBe("number");
    expect(document.properties.schemaVersion.const).toBe(1);
    expect(document.required).toEqual(expect.arrayContaining(["title", "tagline", "description", "websiteUrl", "categorySlugs"]));
    expect(document.properties.metadata).toBeUndefined();
    const documentedTypes = document.properties.blocks.items.anyOf.map((block: { properties: { type: { const: string } } }) => block.properties.type.const);
    expect(documentedTypes.sort()).toEqual(BlockSchema.options.map(block => block.shape.type.value).sort());
    expect(spec.components.securitySchemes.BearerAuth.bearerFormat).toBe("nlb_live_...");
    expect(spec.paths["/api/v1/votes"].post.security).toEqual([{ SessionAuth: [] }]);
    expect(spec.paths["/api/v1/products/{slug}/submit"].post.responses["402"]).toBeDefined();
  });

  it("documents the real on-view health semantics and null values", async () => {
    const spec = await (await getSpec()).json();
    const pulse = spec.components.schemas.PulseSummary.properties;
    expect(pulse.status.enum).toEqual(["up", "down", "unknown", "stale"]);
    expect(pulse.sampleUptimePercent.type).toContain("null");
    expect(pulse.sampling.const).toBe("on-view");
    expect(spec.paths["/api/v1/products/{slug}/pulse"].post.requestBody).toBeUndefined();
  });

  it("documents public aggregate opt-in and all private traffic authentication methods", async () => {
    const spec = await (await getSpec()).json();
    expect(spec.paths["/api/v1/products/{slug}/traffic"].get.security).toEqual([{ BearerAuth: [] }, { ApiKeyAuth: [] }, { SessionAuth: [] }]);
    expect(spec.paths["/api/v1/products/{slug}/traffic/public"].get.description).toContain("Draft changes do not change this opt-in");
    expect(spec.components.schemas.TrafficSummary.properties.referrers).toBeDefined();
    expect(spec.components.schemas.PublicTrafficSummary.properties.referrers).toBeUndefined();
  });
});
