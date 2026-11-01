/**
 * Granting and revoking operator capabilities over REST (`/api/v1/operator/system/operators`). Both are
 * sensitive (`operator.grant` / `operator.revoke`): they need `system:manage`, an approval decided by a
 * different operator and a signed-in session; an MCP agent can never change who is an operator.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ok } from "@/lib/builder-league/http";
import { users } from "@/lib/db/schema";
import type { AppDb } from "@/lib/db";
import type { OperatorCapability } from "@/lib/access/types";
import { grantOperatorCapability, revokeOperatorCapability } from "@/lib/operators/operator-grants";
import { operatorConflict, operatorNotFound } from "@/lib/operators/operator-service-error";
import { readJsonObject, runOperatorRoute } from "./operator-route";
import { operatorCapabilitySchema, operatorGrantTarget, id } from "./operator-sensitive-targets";

const approvalId = z.string().trim().min(1).max(200);

const grantSchema = z.object({ userId: id, capability: operatorCapabilitySchema, approvalId, note: z.string().trim().max(500).optional() }).strict();
const revokeSchema = z.object({ userId: id, capability: operatorCapabilitySchema, approvalId }).strict();

async function assertUserExists(db: AppDb, userId: string): Promise<void> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw operatorNotFound("User");
}

export function grantCapabilityRoute(request: Request): Promise<Response> {
  return runOperatorRoute({
    request,
    domain: "system",
    action: "operator.grant",
    sessionOnly: true,
    prepare: async ({ db }) => {
      const input = grantSchema.parse((await readJsonObject(request)).body);
      await assertUserExists(db, input.userId);
      return { ...operatorGrantTarget(input.userId, input.capability), approvalId: input.approvalId, details: { capability: input.capability }, input };
    },
    run: async ({ db, now }, { input }, grant) => {
      await grantOperatorCapability(db, {
        userId: input.userId,
        capability: input.capability as OperatorCapability,
        grantedBy: grant.actorUserId,
        note: input.note ?? null,
        now,
      });
      return ok({ userId: input.userId, capability: input.capability, granted: true }, undefined, 201);
    },
  });
}

export function revokeCapabilityRoute(request: Request): Promise<Response> {
  return runOperatorRoute({
    request,
    domain: "system",
    action: "operator.revoke",
    sessionOnly: true,
    prepare: async () => {
      const input = revokeSchema.parse((await readJsonObject(request)).body);
      return { ...operatorGrantTarget(input.userId, input.capability), approvalId: input.approvalId, details: { capability: input.capability }, input };
    },
    run: async ({ db, now }, { input }) => {
      const revoked = await revokeOperatorCapability(db, { userId: input.userId, capability: input.capability as OperatorCapability, now });
      if (!revoked) throw operatorConflict("not_granted", "The user does not hold this capability");
      return ok({ userId: input.userId, capability: input.capability, revoked: true });
    },
  });
}
