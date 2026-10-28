import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { authorize, subjectFromCaller } from "@/lib/access/authorize";
import type { AccessSubject } from "@/lib/access/types";
import type { ResolvedCaller } from "@/lib/auth-api-key";
import { grantOperatorCapability, revokeOperator } from "@/lib/operators/operator-grants";
import { apiKey, delegation, seedUsers, session } from "./access-fixtures";

let local: LocalD1;

beforeAll(async () => {
  local = await createLocalD1();
  await seedUsers(local.db, [{ id: "op" }, { id: "op-courses" }, { id: "op-revoked" }, { id: "member" }]);
  await grantOperatorCapability(local.db, { userId: "op", capability: "live:manage", grantedBy: "bootstrap" });
  await grantOperatorCapability(local.db, { userId: "op-courses", capability: "courses:manage", grantedBy: "bootstrap" });
  await grantOperatorCapability(local.db, { userId: "op-revoked", capability: "live:manage", grantedBy: "bootstrap" });
  await revokeOperator(local.db, "op-revoked");
});

afterAll(async () => {
  await local?.dispose();
});

const manageLive = (subject: AccessSubject) =>
  authorize({ subject, action: "manage", resource: { kind: "operator", domain: "live" } }, { db: local.db });

describe("authorize: operator manage", () => {
  it("allows a session operator with the exact capability", async () => {
    expect(await manageLive(session("op"))).toEqual({ allow: true, basis: ["operator_capability"] });
  });

  it("allows a delegation only when it carries mcp:operator", async () => {
    expect(await manageLive(delegation("op", ["mcp:operator"]))).toMatchObject({ allow: true });
    expect(await manageLive(delegation("op", ["mcp:write", "mcp:read"]))).toEqual({ allow: false, reason: "insufficient_scope" });
    expect(await manageLive({ userId: "op", authType: "delegation" })).toEqual({ allow: false, reason: "insufficient_scope" });
  });

  it("never accepts an API key or a direct OAuth token, whatever its scopes", async () => {
    expect(await manageLive(apiKey("op", ["mcp:operator", "api:write"]))).toEqual({ allow: false, reason: "credential_not_allowed" });
    expect(await manageLive({ userId: "op", authType: "oauth", scopes: ["mcp:operator"] })).toEqual({
      allow: false,
      reason: "credential_not_allowed",
    });
  });

  it("denies non-operators, revoked operators and other domains", async () => {
    expect(await manageLive(session("member"))).toEqual({ allow: false, reason: "not_operator" });
    expect(await manageLive(session("op-revoked"))).toEqual({ allow: false, reason: "not_operator" });
    expect(await manageLive(session("op-courses"))).toEqual({ allow: false, reason: "missing_capability" });
    expect(await manageLive({ userId: null, authType: "anonymous" })).toEqual({ allow: false, reason: "unauthenticated" });
  });
});

describe("subjectFromCaller", () => {
  const user = { id: "u1", name: "U", email: "u@example.com", emailVerified: true };

  it("maps each credential to its scopes", () => {
    expect(subjectFromCaller(null)).toEqual({ userId: null, authType: "anonymous" });
    expect(subjectFromCaller({ user, authType: "session" } as ResolvedCaller)).toEqual({
      userId: "u1",
      authType: "session",
      scopes: undefined,
    });
    expect(subjectFromCaller({ user, authType: "api_key" } as ResolvedCaller)).toEqual({
      userId: "u1",
      authType: "api_key",
      scopes: ["api:read", "api:write"],
    });
    expect(subjectFromCaller({ user, authType: "delegation" } as ResolvedCaller)).toEqual({
      userId: "u1",
      authType: "delegation",
      clientId: null,
      scopes: [],
    });
    expect(
      subjectFromCaller({ user, authType: "delegation" } as ResolvedCaller, { scopes: ["mcp:operator"], clientId: "c1" })
    ).toEqual({ userId: "u1", authType: "delegation", clientId: "c1", scopes: ["mcp:operator"] });
  });
});
