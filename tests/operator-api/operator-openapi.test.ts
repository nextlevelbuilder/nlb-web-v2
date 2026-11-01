import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { GET as getSpec } from "@/app/api/openapi.json/route";
import { operatorPaths, operatorSchemas } from "@/lib/operators/openapi";
import { OPERATOR_APPROVAL_ACTIONS } from "@/lib/operators/http/operator-sensitive-targets";

type Operation = { security?: unknown; tags?: string[]; parameters?: { name: string }[]; requestBody?: { content: Record<string, { schema: { properties?: Record<string, { enum?: string[] }> } }> } };
type Spec = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, unknown> } };

describe("operator OpenAPI", () => {
  it("publishes every operator path and schema in the public document, session-only and tagged", async () => {
    const spec = (await (await getSpec()).json()) as Spec;
    for (const [path, methods] of Object.entries(operatorPaths)) {
      expect(path).toMatch(/^\/api\/v1\/operator\//);
      expect(spec.paths[path]).toEqual(JSON.parse(JSON.stringify(methods)));
      for (const operation of Object.values(spec.paths[path])) {
        expect(operation.security).toEqual([{ SessionAuth: [] }]);
        expect(operation.tags).toEqual(["Platform operators"]);
      }
    }
    for (const name of Object.keys(operatorSchemas)) {
      expect(name).toMatch(/^Operator/);
      expect(spec.components.schemas[name]).toBeDefined();
    }
  });

  it("documents every sensitive action the generic approval routes accept, and requires ?domain=", async () => {
    const spec = (await (await getSpec()).json()) as Spec;
    const request = spec.paths["/api/v1/operator/approvals"].post;
    expect(request.requestBody?.content["application/json"].schema.properties?.action.enum?.sort()).toEqual([...OPERATOR_APPROVAL_ACTIONS].sort());
    for (const path of ["/api/v1/operator/approvals", "/api/v1/operator/approvals/{id}", "/api/v1/operator/approvals/{id}/decision"]) {
      for (const operation of Object.values(spec.paths[path])) expect(operation.parameters?.map((param) => param.name)).toContain("domain");
    }
  });

  it("documents every route under app/api/v1/operator with each exported method", async () => {
    const root = join(process.cwd(), "app", "api", "v1", "operator");
    const routes = (readdirSync(root, { recursive: true }) as string[]).filter((file) => file.endsWith(`${sep}route.ts`) || file === "route.ts");
    expect(routes.length).toBeGreaterThan(10);
    for (const file of routes) {
      const dir = relative(root, join(root, file, "..")).split(sep).filter(Boolean);
      const path = ["/api/v1/operator", ...dir.map((part) => part.replace(/^\[(.+)\]$/, "{$1}"))].join("/");
      const routeModule = (await import(/* @vite-ignore */ join(root, file))) as Record<string, unknown>;
      const methods = ["GET", "POST", "PATCH", "PUT", "DELETE"].filter((method) => typeof routeModule[method] === "function");
      expect(Object.keys((operatorPaths[path] ?? {}) as object).sort(), path).toEqual(methods.map((method) => method.toLowerCase()).sort());
    }
  });
});
