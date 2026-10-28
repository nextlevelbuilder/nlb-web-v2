import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";
import { operatorAuditLogs, platformOperators } from "@/lib/db/schema";
import {
  getOperatorCapabilities,
  grantOperatorCapability,
  revokeOperator,
  revokeOperatorCapability,
} from "@/lib/operators/operator-grants";
import { canonicalJson, hashOperatorArgs, recordOperatorAudit } from "@/lib/operators/operator-audit";
import { bootstrapGrantSql } from "@/lib/operators/operator-bootstrap-sql";
import type { OperatorCapability } from "@/lib/access/types";

let local: LocalD1;

beforeAll(async () => {
  local = await createLocalD1();
});

afterAll(async () => {
  await local?.dispose();
});

describe("operator grants", () => {
  it("adds capabilities without duplicates and reads only unrevoked rows", async () => {
    const { db } = local;
    await grantOperatorCapability(db, { userId: "g1", capability: "live:manage", grantedBy: "boot" });
    await grantOperatorCapability(db, { userId: "g1", capability: "live:manage", grantedBy: "boot" });
    await grantOperatorCapability(db, { userId: "g1", capability: "system:manage", grantedBy: "boot" });
    expect((await getOperatorCapabilities(db, "g1")).sort()).toEqual(["live:manage", "system:manage"]);

    expect(await revokeOperatorCapability(db, { userId: "g1", capability: "live:manage" })).toBe(true);
    expect(await revokeOperatorCapability(db, { userId: "g1", capability: "live:manage" })).toBe(false);
    expect(await getOperatorCapabilities(db, "g1")).toEqual(["system:manage"]);

    // Removing the last capability revokes the row.
    expect(await revokeOperatorCapability(db, { userId: "g1", capability: "system:manage" })).toBe(true);
    const [row] = await db.select().from(platformOperators).where(eq(platformOperators.userId, "g1"));
    expect(row.revokedAt).not.toBeNull();
    expect(await getOperatorCapabilities(db, "g1")).toEqual([]);

    // Re-granting a revoked operator restores only the new capability.
    await grantOperatorCapability(db, { userId: "g1", capability: "courses:manage", grantedBy: "boot" });
    expect(await getOperatorCapabilities(db, "g1")).toEqual(["courses:manage"]);
    expect(await revokeOperator(db, "g1")).toBe(true);
    expect(await revokeOperator(db, "g1")).toBe(false);
  });

  it("keeps both capabilities when two grants race", async () => {
    const { db } = local;
    await Promise.all([
      grantOperatorCapability(db, { userId: "g2", capability: "live:manage", grantedBy: "boot" }),
      grantOperatorCapability(db, { userId: "g2", capability: "users:manage", grantedBy: "boot" }),
      grantOperatorCapability(db, { userId: "g2", capability: "assets:manage", grantedBy: "boot" }),
    ]);
    expect((await getOperatorCapabilities(db, "g2")).sort()).toEqual(["assets:manage", "live:manage", "users:manage"]);
  });

  it("rejects wildcard and unknown capabilities", async () => {
    const bad = "*" as OperatorCapability;
    await expect(grantOperatorCapability(local.db, { userId: "g3", capability: bad, grantedBy: "boot" })).rejects.toThrow(/Unknown/);
    await expect(grantOperatorCapability(local.db, { userId: "g3", capability: "operator:*" as OperatorCapability, grantedBy: "boot" })).rejects.toThrow();
    // A stored unknown value is ignored rather than trusted.
    await local.db.insert(platformOperators).values({ userId: "g3", capabilities: ["*", "live:manage"] as OperatorCapability[], grantedBy: "x" });
    expect(await getOperatorCapabilities(local.db, "g3")).toEqual(["live:manage"]);
  });

  it("builds bootstrap SQL that the schema accepts and that refuses wildcards", async () => {
    const statement = bootstrapGrantSql({ userId: "boot_1", capabilities: ["live:manage"], grantedBy: "bootstrap", note: "first op's grant", nowMs: Date.now() });
    await local.d1.prepare(statement).run();
    await local.d1.prepare(statement).run();
    expect(await getOperatorCapabilities(local.db, "boot_1")).toEqual(["live:manage"]);
    expect(() => bootstrapGrantSql({ userId: "boot_1", capabilities: ["*"], grantedBy: "b", nowMs: 1 })).toThrow(/Unknown/);
    expect(() => bootstrapGrantSql({ userId: "x' OR 1=1 --", capabilities: ["live:manage"], grantedBy: "b", nowMs: 1 })).toThrow();
    expect(() => bootstrapGrantSql({ userId: "u", capabilities: [], grantedBy: "b", nowMs: 1 })).toThrow();
  });
});

describe("operator audit", () => {
  it("hashes canonical JSON independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: true, y: null }], c: "x" }, u: undefined })).toBe(
      '{"a":{"c":"x","d":[1,{"y":null,"z":true}]},"b":1}'
    );
    expect(hashOperatorArgs({ a: 1, b: [2, 3] })).toBe(hashOperatorArgs({ b: [2, 3], a: 1 }));
    expect(hashOperatorArgs({ a: 1, b: [2, 3] })).not.toBe(hashOperatorArgs({ a: 1, b: [3, 2] }));
    expect(hashOperatorArgs({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    expect(() => hashOperatorArgs({ a: Number.NaN })).toThrow();
    expect(() => hashOperatorArgs({ a: new Map() })).toThrow();
  });

  it("appends audit rows", async () => {
    const id = await recordOperatorAudit(local.db, {
      actorUserId: "g1",
      actorAuthType: "session",
      action: "live.event.create",
      resource: "live:event:e1",
      decision: "allow",
      argsHash: hashOperatorArgs({ id: "e1" }),
      details: { status: "draft" },
    });
    const [row] = await local.db.select().from(operatorAuditLogs).where(eq(operatorAuditLogs.id, id));
    expect(row).toMatchObject({ decision: "allow", action: "live.event.create", details: { status: "draft" } });
  });
});
