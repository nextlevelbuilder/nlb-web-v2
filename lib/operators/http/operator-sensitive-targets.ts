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
import { operatorInvalid } from "@/lib/operators/operator-service-error";

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

const RESOLVERS: Partial<Record<SensitiveOperatorAction, TargetResolver>> = {
  "operator.grant": (_db, target) => {
    const { userId, capability } = operatorGrantTargetSchema.parse(target);
    return operatorGrantTarget(userId, capability);
  },
  "operator.revoke": (_db, target) => {
    const { userId, capability } = operatorGrantTargetSchema.parse(target);
    return operatorGrantTarget(userId, capability);
  },
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
