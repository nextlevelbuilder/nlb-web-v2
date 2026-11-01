import { describe, expect, it } from "vitest";
import { GET as getSpec } from "@/app/api/openapi.json/route";
import { memberPaths, memberSchemas } from "@/lib/access/http/member-openapi";

type Spec = { paths: Record<string, Record<string, { tags?: string[] }>>; components: { schemas: Record<string, unknown> } };

describe("member access OpenAPI", () => {
  it("publishes every member path and schema in the public document", async () => {
    const spec = (await (await getSpec()).json()) as Spec;
    expect(Object.keys(memberPaths).sort()).toEqual(
      ["/api/v1/assets", "/api/v1/assets/{id}", "/api/v1/courses/library", "/api/v1/courses/videos/{slug}", "/api/v1/directory/mine", "/api/v1/leaderboards"].sort()
    );
    for (const [path, methods] of Object.entries(memberPaths)) {
      expect(spec.paths[path]).toEqual(JSON.parse(JSON.stringify(methods)));
      for (const operation of Object.values(spec.paths[path])) expect(operation.tags).toEqual(["Member access"]);
    }
    for (const name of Object.keys(memberSchemas)) expect(spec.components.schemas[name]).toBeDefined();
  });
});
