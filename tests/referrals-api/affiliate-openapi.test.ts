import { describe, expect, it } from "vitest";
import { GET as getSpec } from "@/app/api/openapi.json/route";
import { affiliatePaths, affiliateSchemas } from "@/lib/referrals/openapi";

type Operation = { operationId?: string; security?: unknown; tags?: string[]; responses?: Record<string, unknown> };
type Spec = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, unknown> } };

const MEMBER_PATHS = [
  "/api/v1/affiliates/program",
  "/api/v1/affiliates/me",
  "/api/v1/affiliates/preview",
  "/api/v1/affiliates/links",
  "/api/v1/affiliates/links/{id}",
  "/api/v1/affiliates/conversions",
  "/api/v1/affiliates/commissions",
  "/api/v1/affiliates/payouts",
  "/api/v1/affiliates/payout-method",
];

const OPERATOR_PATHS = [
  "/api/v1/affiliate-admin/rules",
  "/api/v1/affiliate-admin/rules/preview",
  "/api/v1/affiliate-admin/affiliates",
  "/api/v1/affiliate-admin/affiliates/{id}/suspend",
  "/api/v1/affiliate-admin/affiliates/{id}/reinstate",
  "/api/v1/affiliate-admin/conversions",
  "/api/v1/affiliate-admin/conversions/{id}/hold",
  "/api/v1/affiliate-admin/conversions/{id}/release",
  "/api/v1/affiliate-admin/payouts/preview",
  "/api/v1/affiliate-admin/payouts/batches",
  "/api/v1/affiliate-admin/payouts/batches/{id}",
  "/api/v1/affiliate-admin/payouts/batches/{id}/approve",
  "/api/v1/affiliate-admin/payouts/batches/{id}/cancel",
  "/api/v1/affiliate-admin/payouts/items/{id}/mark-paid",
  "/api/v1/affiliate-admin/payouts/items/{id}/details",
  "/api/v1/affiliate-admin/ledger/adjustments",
  "/api/v1/affiliate-admin/reconciliation",
  "/api/v1/affiliate-admin/approvals",
  "/api/v1/affiliate-admin/approvals/{id}",
  "/api/v1/affiliate-admin/approvals/{id}/decision",
];

describe("affiliate OpenAPI module", () => {
  it("documents every member and operator path, ready to merge without replacing any existing path or schema", async () => {
    const spec = (await (await getSpec()).json()) as Spec;
    const keys = Object.keys(affiliatePaths);
    expect(keys.sort()).toEqual([...MEMBER_PATHS, ...OPERATOR_PATHS].sort());
    for (const key of keys) {
      expect(key).toMatch(/^\/api\/v1\/affiliate(s|-admin)\//);
      expect(spec.paths[key]).toBeUndefined();
    }
    for (const key of Object.keys(affiliateSchemas)) {
      expect(key).toMatch(/^Affiliate/);
      expect(spec.components.schemas[key]).toBeUndefined();
    }
    const merged = { ...spec.paths, ...(JSON.parse(JSON.stringify(affiliatePaths)) as Spec["paths"]) };
    const ids = Object.values(merged).flatMap((methods) => Object.values(methods).map((op) => op.operationId).filter(Boolean));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references only schemas the module defines and documents session-only payout routes", () => {
    const serialized = JSON.stringify(affiliatePaths) + JSON.stringify(affiliateSchemas);
    const refs = [...serialized.matchAll(/#\/components\/schemas\/([A-Za-z]+)/g)].map((match) => match[1]);
    for (const name of new Set(refs)) expect(affiliateSchemas[name], name).toBeDefined();

    const paths = affiliatePaths as Spec["paths"];
    expect(paths["/api/v1/affiliates/payout-method"].get.security).toEqual([{ SessionAuth: [] }]);
    expect(paths["/api/v1/affiliates/payout-method"].put.security).toEqual([{ SessionAuth: [] }]);
    for (const [path, methods] of Object.entries(paths)) {
      for (const op of Object.values(methods)) {
        expect(op.operationId, path).toMatch(/^affiliate/);
        expect(op.tags?.[0], path).toMatch(/^NLB Affiliates/);
      }
    }
  });

  it("keeps the affiliate API out of the public document until launch", async () => {
    const spec = (await (await getSpec()).json()) as Spec;
    expect(Object.keys(spec.paths).filter((key) => key.startsWith("/api/v1/affiliate"))).toEqual([]);
    expect(Object.keys(spec.components.schemas).filter((key) => key.startsWith("Affiliate"))).toEqual([]);
    const tags = Object.values(spec.paths).flatMap((methods) => Object.values(methods).flatMap((op) => op.tags ?? []));
    expect(tags.some((tag) => tag.startsWith("NLB Affiliates"))).toBe(false);
  });
});
