import { z } from "zod";

/**
 * Membership onboarding status (`GET /api/v1/onboarding-status`) for external clients (CLI, MCP).
 * Mirrors `OnboardingStatus` in `lib/onboarding/status.ts`.
 */
export const ONBOARDING_PAYMENT_STATES = ["pending", "verifying", "verified", "failed", "not_owner", "none"] as const;
export const ONBOARDING_NEXT_ACTIONS = ["connect", "join", "retry", "reconnect", "none"] as const;
export const COMMUNITY_ACCESS_STATUSES = [
  "not_connected", "waiting_for_join", "processing", "active", "retrying", "action_required", "revoked",
] as const;
export const MEMBERSHIP_TIERS = ["none", "premium", "vip"] as const;

export const OnboardingConnectionSchema = z.object({
  status: z.enum(COMMUNITY_ACCESS_STATUSES),
  displayName: z.string().optional(),
  nextAction: z.enum(ONBOARDING_NEXT_ACTIONS),
  /** Present while an unlink is pending. */
  unlinking: z.literal(true).optional(),
  /** Short provider code of the last permanent failure (status `action_required` only). */
  errorCode: z.string().optional(),
}).passthrough();

export const OnboardingStatusSchema = z.object({
  payment: z.enum(ONBOARDING_PAYMENT_STATES),
  membership: z.object({
    tier: z.enum(MEMBERSHIP_TIERS),
    plan: z.string(),
    term: z.enum(["quarterly", "annual"]).nullable(),
    status: z.string(),
    renewsAt: z.string().nullable(),
    cancelAtPeriodEnd: z.boolean(),
  }).passthrough().nullable(),
  profile: z.object({
    goal: z.string(),
    profileLinks: z.array(z.string()),
    skills: z.string(),
    phone: z.string(),
    commitmentAccepted: z.boolean(),
    completed: z.boolean(),
  }).passthrough(),
  connections: z.object({
    discord: OnboardingConnectionSchema,
    telegram: OnboardingConnectionSchema,
  }).passthrough(),
}).passthrough();

export const OnboardingStatusResponseSchema = z.object({ data: OnboardingStatusSchema });

export type OnboardingConnection = z.infer<typeof OnboardingConnectionSchema>;
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;
export type OnboardingStatusResponse = z.infer<typeof OnboardingStatusResponseSchema>;
