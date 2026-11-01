/**
 * Canonical resource and arguments of each sensitive action served by `/api/v1/operator/*`. The approval
 * request route and the action route both derive them here, so the approval's `args_hash` always matches
 * what the action consumes (`requireOperator` hashes `args` and compares it with the approved row).
 * Live and affiliate keep their own registries and approval routes.
 *
 * Each target schema is strict and lists exactly the arguments the action runs with; anything that
 * changes the effect (capability, feature key, refund amount) is part of the hash.
 */
import { z } from "zod";
import type { AppDb } from "@/lib/db";
import type { OperatorDomain, SensitiveOperatorAction } from "@/lib/access/types";
import { OPERATOR_DOMAINS } from "@/lib/access/types";
import { isOperatorCapability } from "@/lib/operators/operator-grants";
import { sensitiveActionDomain } from "@/lib/operators/operator-actions";
import { operatorInvalid, operatorNotFound } from "@/lib/operators/operator-service-error";
import { eq } from "drizzle-orm";
import { orders, users } from "@/lib/db/schema";
import { getVideoBySlug } from "@/lib/courses/course-video-service";
import { GRANTABLE_FEATURE_KEY, getEntitlementGrant } from "@/lib/membership/entitlement-grants";
import { ORDER_REFUND_REASONS } from "@/lib/commerce/order-refunds";

export interface SensitiveTarget {
  resource: string;
  args: Record<string, string | number | boolean | null>;
}

type TargetResolver = (db: AppDb, target: unknown) => Promise<SensitiveTarget> | SensitiveTarget;

export const id = z.string().trim().min(1).max(200);

/** `user:<id>`: the account an action changes. */
export const userResource = (userId: string) => `user:${userId}`;

export const operatorCapabilitySchema = z.string().refine(isOperatorCapability, "unknown operator capability");
export const operatorGrantTargetSchema = z.object({ userId: id, capability: operatorCapabilitySchema }).strict();

export function operatorGrantTarget(userId: string, capability: string): SensitiveTarget {
  return { resource: userResource(userId), args: { userId, capability } };
}

export const videoArchiveTargetSchema = z.object({ slug: id }).strict();

/** `video:<id>`: archiving hides the video from new buyers; existing buyers keep watching. */
export async function videoArchiveTarget(db: AppDb, slug: string): Promise<SensitiveTarget> {
  const video = await getVideoBySlug(slug, db);
  if (!video) throw operatorNotFound("Video");
  return { resource: `video:${video.id}`, args: { slug } };
}

/** An ISO instant normalised to `toISOString()`, so the same moment always hashes the same. */
const instant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

async function requireUser(db: AppDb, userId: string): Promise<void> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw operatorNotFound("User");
}

export const userBanTargetSchema = z.object({ userId: id, reason: z.string().trim().min(1).max(500), expiresAt: instant.nullable() }).strict();

/** `user:<id>`: the ban reason and end are part of what the second operator approves. */
export async function userBanTarget(db: AppDb, target: z.infer<typeof userBanTargetSchema>): Promise<SensitiveTarget> {
  await requireUser(db, target.userId);
  return { resource: userResource(target.userId), args: { userId: target.userId, reason: target.reason, expiresAt: target.expiresAt } };
}

export const entitlementGrantTargetSchema = z
  .object({ userId: id, featureKey: z.string().regex(GRANTABLE_FEATURE_KEY, "featureKey must be video:<id> or live:replay:<eventId>"), validUntil: instant.nullable() })
  .strict();

export async function entitlementGrantTarget(db: AppDb, target: z.infer<typeof entitlementGrantTargetSchema>): Promise<SensitiveTarget> {
  await requireUser(db, target.userId);
  return { resource: userResource(target.userId), args: { userId: target.userId, featureKey: target.featureKey, validUntil: target.validUntil } };
}

export const entitlementRevokeTargetSchema = z.object({ grantId: id }).strict();

export async function entitlementRevokeTarget(db: AppDb, grantId: string): Promise<SensitiveTarget> {
  const grant = await getEntitlementGrant(db, grantId);
  if (!grant) throw operatorNotFound("Grant");
  return { resource: userResource(grant.userId), args: { grantId } };
}

export const orderRefundTargetSchema = z
  .object({ orderId: id, reason: z.enum(ORDER_REFUND_REASONS), amount: z.number().int().positive().nullable() })
  .strict();

/** `order:<id>`: reason and amount (null = everything refundable) are bound to the approval. */
export async function orderRefundTarget(db: AppDb, target: z.infer<typeof orderRefundTargetSchema>): Promise<SensitiveTarget> {
  const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, target.orderId)).limit(1);
  if (!order) throw operatorNotFound("Order");
  return { resource: `order:${order.id}`, args: { orderId: order.id, reason: target.reason, amount: target.amount } };
}

const RESOLVERS: Partial<Record<SensitiveOperatorAction, TargetResolver>> = {
  "operator.grant": (_db, target) => {
    const { userId, capability } = operatorGrantTargetSchema.parse(target);
    return operatorGrantTarget(userId, capability);
  },
  "operator.revoke": (_db, target) => {
    const { userId, capability } = operatorGrantTargetSchema.parse(target);
    return operatorGrantTarget(userId, capability);
  },
  "courses.video.archive": (db, target) => videoArchiveTarget(db, videoArchiveTargetSchema.parse(target).slug),
  "users.user.ban": (db, target) => userBanTarget(db, userBanTargetSchema.parse(target)),
  "membership.entitlement.grant": (db, target) => entitlementGrantTarget(db, entitlementGrantTargetSchema.parse(target)),
  "membership.entitlement.revoke": (db, target) => entitlementRevokeTarget(db, entitlementRevokeTargetSchema.parse(target).grantId),
  "commerce.order.refund": (db, target) => orderRefundTarget(db, orderRefundTargetSchema.parse(target)),
};

/** Sensitive actions whose approvals are requested and read through `/api/v1/operator/approvals`. */
export const OPERATOR_APPROVAL_ACTIONS = Object.keys(RESOLVERS) as SensitiveOperatorAction[];

/** The generic approval actions guarded by `domain` (empty for domains without one). */
export function approvalActionsFor(domain: OperatorDomain): SensitiveOperatorAction[] {
  return OPERATOR_APPROVAL_ACTIONS.filter((action) => sensitiveActionDomain(action) === domain);
}

/** Validates the `?domain=` of an approval route; it decides which capability the caller needs. */
export function parseApprovalDomain(value: string | null): OperatorDomain {
  const domain = value?.trim() ?? "";
  if (!(OPERATOR_DOMAINS as readonly string[]).includes(domain)) throw operatorInvalid(`domain must be one of ${OPERATOR_DOMAINS.join(", ")}`);
  return domain as OperatorDomain;
}

/** Validates `target` for `action` and returns its canonical resource and arguments. */
export async function resolveOperatorTarget(db: AppDb, action: SensitiveOperatorAction, target: unknown): Promise<SensitiveTarget> {
  const resolver = RESOLVERS[action];
  if (!resolver) throw operatorInvalid(`${action} is not approved through this API`);
  return resolver(db, target);
}
