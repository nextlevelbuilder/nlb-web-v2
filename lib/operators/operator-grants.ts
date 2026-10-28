import { and, eq, isNull, sql } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { platformOperators } from "@/lib/db/schema";
import { OPERATOR_DOMAINS, type OperatorCapability } from "@/lib/access/types";

/**
 * Platform operator capabilities (`platform_operators`). These are domain functions: REST and MCP
 * layers wrap grant/revoke in a second-operator approval (`operator.grant` / `operator.revoke`).
 * There is no wildcard capability; every capability is one exact `<domain>:manage` string.
 */

const CAPABILITIES: ReadonlySet<string> = new Set(OPERATOR_DOMAINS.map((domain) => `${domain}:manage`));

export function isOperatorCapability(value: unknown): value is OperatorCapability {
  return typeof value === "string" && CAPABILITIES.has(value);
}

function assertCapability(capability: string): asserts capability is OperatorCapability {
  if (!isOperatorCapability(capability)) throw new Error(`Unknown operator capability: ${capability}`);
}

function assertUserId(userId: string, field: string): void {
  if (typeof userId !== "string" || !userId.trim()) throw new Error(`${field} is required`);
}

/** Capabilities of an unrevoked operator row; empty when there is none. Unknown stored values are dropped. */
export async function getOperatorCapabilities(db: AppDb, userId: string): Promise<OperatorCapability[]> {
  const [row] = await db
    .select({ capabilities: platformOperators.capabilities })
    .from(platformOperators)
    .where(and(eq(platformOperators.userId, userId), isNull(platformOperators.revokedAt)))
    .limit(1);
  if (!row || !Array.isArray(row.capabilities)) return [];
  return row.capabilities.filter(isOperatorCapability);
}

export interface GrantOperatorCapabilityInput {
  userId: string;
  capability: OperatorCapability;
  grantedBy: string;
  note?: string | null;
  now?: Date;
}

/**
 * Adds one capability. A revoked row is reactivated with only this capability, so old grants never come
 * back implicitly. One upsert statement, so concurrent grants cannot lose each other's capability.
 */
export async function grantOperatorCapability(db: AppDb, input: GrantOperatorCapabilityInput): Promise<void> {
  assertUserId(input.userId, "userId");
  assertUserId(input.grantedBy, "grantedBy");
  assertCapability(input.capability);
  const now = input.now ?? new Date();
  const capability = input.capability;
  await db
    .insert(platformOperators)
    .values({
      userId: input.userId,
      capabilities: [capability],
      grantedBy: input.grantedBy,
      note: input.note ?? null,
      grantedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: platformOperators.userId,
      set: {
        capabilities: sql`case
          when ${platformOperators.revokedAt} is not null then excluded.capabilities
          when exists (select 1 from json_each(${platformOperators.capabilities}) where value = ${capability})
            then ${platformOperators.capabilities}
          else json_insert(${platformOperators.capabilities}, '$[#]', ${capability})
        end`,
        grantedBy: sql`excluded.granted_by`,
        note: sql`coalesce(excluded.note, ${platformOperators.note})`,
        revokedAt: null,
        updatedAt: now,
      },
    });
}

export interface RevokeOperatorCapabilityInput {
  userId: string;
  capability: OperatorCapability;
  now?: Date;
}

/**
 * Removes one capability; the row is marked revoked when none is left. Returns false when the user had
 * no live grant of that capability. One conditional UPDATE.
 */
export async function revokeOperatorCapability(db: AppDb, input: RevokeOperatorCapabilityInput): Promise<boolean> {
  assertUserId(input.userId, "userId");
  assertCapability(input.capability);
  const now = input.now ?? new Date();
  const capability = input.capability;
  const changed = await db
    .update(platformOperators)
    .set({
      capabilities: sql`(select json_group_array(value) from json_each(${platformOperators.capabilities}) where value <> ${capability})`,
      // SQLite evaluates every SET expression against the old row, so this sees the old capabilities.
      revokedAt: sql`case
        when exists (select 1 from json_each(${platformOperators.capabilities}) where value <> ${capability})
          then ${platformOperators.revokedAt}
        else ${now.getTime()}
      end`,
      updatedAt: now,
    })
    .where(
      and(
        eq(platformOperators.userId, input.userId),
        isNull(platformOperators.revokedAt),
        sql`exists (select 1 from json_each(${platformOperators.capabilities}) where value = ${capability})`
      )
    )
    .returning({ userId: platformOperators.userId });
  return changed.length === 1;
}

/** Revokes every capability of an operator. Returns false when there was no live row. */
export async function revokeOperator(db: AppDb, userId: string, now: Date = new Date()): Promise<boolean> {
  assertUserId(userId, "userId");
  const changed = await db
    .update(platformOperators)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(platformOperators.userId, userId), isNull(platformOperators.revokedAt)))
    .returning({ userId: platformOperators.userId });
  return changed.length === 1;
}
