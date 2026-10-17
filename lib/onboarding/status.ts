import { and, eq, or, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import type { AppDb } from "@/lib/db";
import {
  communityAccessState,
  communityConnections,
  customers,
  onboardingJobs,
  onboardingProfiles,
} from "@/lib/db/schema";
import { resolveEffectiveTier, type MembershipTier } from "@/lib/membership/effective-tier";
import {
  findLinkableCustomerForUser,
  getLinkedSubscriptions,
  getMemberTier,
  linkCustomerToUser,
  normalizeEmail,
  toMembershipState,
} from "@/lib/membership/member-access";
import { applySubscriptionSnapshot } from "@/lib/membership/subscription-sync";
import { getPastDueGraceDays } from "@/lib/onboarding/flags";
import { enqueueAccessReconcile, enqueueJob } from "@/lib/onboarding/jobs";
import { runDueJobs } from "@/lib/onboarding/runner";
import { PRODUCT_IDS } from "@/lib/polar";
import { getCommunityAdapter } from "@/lib/community/registry";
import { ProviderError, type AccessStatus, type CommunityProvider, type CommunityTarget } from "@/lib/community/types";

export type PaymentState = "pending" | "verifying" | "verified" | "failed" | "not_owner" | "none";
export type NextAction = "connect" | "join" | "retry" | "reconnect" | "none";
export type MembershipTerm = "quarterly" | "annual" | null;

export interface OnboardingUser {
  id: string;
  email: string;
  emailVerified: boolean | null;
}

export interface MembershipSummary {
  tier: MembershipTier;
  plan: string;
  term: MembershipTerm;
  status: string;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface ProfileSummary {
  goal: string;
  profileLinks: string[];
  skills: string;
  phone: string;
  commitmentAccepted: boolean;
  completed: boolean;
}

export interface ConnectionSummary {
  status: AccessStatus;
  displayName?: string;
  nextAction: NextAction;
}

export interface OnboardingStatus {
  payment: PaymentState;
  membership: MembershipSummary | null;
  profile: ProfileSummary;
  connections: Record<CommunityProvider, ConnectionSummary>;
}

/** The slice of the Polar SDK the status lookup uses (`checkouts.get`, `subscriptions.get`). */
export interface PolarCheckoutReader {
  checkouts: {
    get(request: { id: string }): Promise<{
      id: string;
      status: string;
      customerId?: string | null;
      customerEmail?: string | null;
      customerName?: string | null;
      subscriptionId?: string | null;
      metadata?: Record<string, unknown> | null;
    }>;
  };
  subscriptions: {
    get(request: { id: string }): Promise<{
      id: string;
      status: string;
      productId: string;
      product?: { name?: string | null } | null;
      currentPeriodStart?: Date | null;
      currentPeriodEnd?: Date | null;
      cancelAtPeriodEnd?: boolean | null;
      endedAt?: Date | null;
      modifiedAt?: Date | null;
      createdAt?: Date | null;
    }>;
  };
}

const TARGET_FOR_PROVIDER: Readonly<Record<CommunityProvider, CommunityTarget>> = {
  discord: "discord_guild",
  telegram: "telegram_group",
};

const QUARTERLY_PRODUCT_IDS = new Set<string>([PRODUCT_IDS.PREMIUM_QUARTERLY, PRODUCT_IDS.VIP_QUARTERLY]);

/** Billing term from the product id; early-bird products are annual. */
export function termForProductId(productId: string): MembershipTerm {
  if (QUARTERLY_PRODUCT_IDS.has(productId)) return "quarterly";
  return productId ? "annual" : null;
}

/**
 * Link the Polar customer whose email equals the user's verified email, when it is unlinked.
 * Returns true when this call created the link (access must then be reconciled).
 */
export async function claimCustomerByVerifiedEmail(db: AppDb, user: OnboardingUser): Promise<boolean> {
  const customer = await findLinkableCustomerForUser(db, user);
  if (!customer || customer.userId === user.id) return false;
  const linked = await linkCustomerToUser(db, { customerId: customer.id, userId: user.id });
  if (linked) await enqueueAccessReconcile(db, user.id);
  return linked;
}

/** The checkout belongs to the session user: verified email match or server-set `nlb_user_id`. */
export function checkoutBelongsTo(
  checkout: { customerEmail?: string | null; metadata?: Record<string, unknown> | null },
  user: OnboardingUser
): boolean {
  if (checkout.metadata?.nlb_user_id === user.id) return true;
  if (!user.emailVerified || !user.email || !checkout.customerEmail) return false;
  return normalizeEmail(checkout.customerEmail) === normalizeEmail(user.email);
}

/** Local customer row for a Polar checkout, created from server-read Polar data when the webhook has not arrived. */
async function ensureCheckoutCustomer(
  db: AppDb,
  checkout: { customerId?: string | null; customerEmail?: string | null; customerName?: string | null }
) {
  if (checkout.customerId) {
    const [byPolarId] = await db.select().from(customers).where(eq(customers.polarCustomerId, checkout.customerId)).limit(1);
    if (byPolarId) return byPolarId;
  }
  if (!checkout.customerEmail) return null;
  const email = normalizeEmail(checkout.customerEmail);
  await db
    .insert(customers)
    .values({ email, name: checkout.customerName || email.split("@")[0], polarCustomerId: checkout.customerId || null })
    .onConflictDoNothing();
  const [row] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  return row ?? null;
}

/**
 * Resolve a checkout the webhook has not delivered yet, straight from Polar. The checkout id only
 * selects what to look up: binding happens solely when the checkout belongs to the session user.
 */
async function verifyCheckout(
  db: AppDb,
  user: OnboardingUser,
  checkoutId: string,
  polar: PolarCheckoutReader,
  now: Date
): Promise<PaymentState> {
  let checkout: Awaited<ReturnType<PolarCheckoutReader["checkouts"]["get"]>>;
  try {
    checkout = await polar.checkouts.get({ id: checkoutId });
  } catch {
    // Unknown id or Polar unavailable: the client keeps polling and then shows the help message.
    return "verifying";
  }
  if (!checkoutBelongsTo(checkout, user)) return "not_owner";

  switch (checkout.status) {
    case "open":
      return "pending";
    case "failed":
    case "expired":
      return "failed";
    case "succeeded":
      break;
    default:
      return "verifying";
  }
  if (!checkout.subscriptionId) return "verifying";

  try {
    const customer = await ensureCheckoutCustomer(db, checkout);
    if (!customer) return "verifying";
    const live = await polar.subscriptions.get({ id: checkout.subscriptionId });
    await applySubscriptionSnapshot(
      db,
      {
        polarSubscriptionId: live.id,
        customerId: customer.id,
        productId: live.productId,
        productName: live.product?.name ?? null,
        status: live.status,
        currentPeriodStart: live.currentPeriodStart ?? null,
        currentPeriodEnd: live.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: Boolean(live.cancelAtPeriodEnd),
        endedAt: live.endedAt ?? null,
        modifiedAt: live.modifiedAt ?? live.createdAt ?? null,
      },
      now
    );
    const linked = customer.userId === user.id || (await linkCustomerToUser(db, { customerId: customer.id, userId: user.id }));
    if (!linked) {
      // Owned by another NLB user, or this user already owns a different Polar customer.
      const [current] = await db.select({ userId: customers.userId }).from(customers).where(eq(customers.id, customer.id)).limit(1);
      return current?.userId && current.userId !== user.id ? "not_owner" : "verifying";
    }
    await enqueueAccessReconcile(db, user.id, undefined, now);
  } catch {
    console.warn("onboarding status: Polar checkout verification failed; will retry on next poll");
    return "verifying";
  }
  const { tier } = await getMemberTier(db, user.id, now);
  return tier === "none" ? "verifying" : "verified";
}

async function membershipSummary(db: AppDb, userId: string, now: Date): Promise<MembershipSummary | null> {
  const rows = await getLinkedSubscriptions(db, userId);
  const effective = resolveEffectiveTier(rows.map(toMembershipState), now, getPastDueGraceDays());
  if (effective.tier === "none") return null;
  // The subscription that grants the effective tier: same tier, latest period end first.
  const granting = rows
    .filter((row) => resolveEffectiveTier([toMembershipState(row)], now, getPastDueGraceDays()).tier === effective.tier)
    .sort((a, b) => (b.currentPeriodEnd?.getTime() ?? 0) - (a.currentPeriodEnd?.getTime() ?? 0))[0];
  if (!granting) return null;
  return {
    tier: effective.tier,
    plan: granting.productName,
    term: termForProductId(granting.polarProductId),
    status: granting.status,
    renewsAt: granting.currentPeriodEnd ? granting.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: Boolean(granting.cancelAtPeriodEnd),
  };
}

async function profileSummary(db: AppDb, userId: string): Promise<ProfileSummary> {
  const [row] = await db.select().from(onboardingProfiles).where(eq(onboardingProfiles.userId, userId)).limit(1);
  return {
    goal: row?.goal ?? "",
    profileLinks: row?.profileLinks ?? [],
    skills: row?.skills ?? "",
    phone: row?.phone ?? "",
    commitmentAccepted: Boolean(row?.commitmentAcceptedAt),
    completed: Boolean(row?.completedAt),
  };
}

/** What the member should do next for one provider, from the recorded access state. */
export function nextActionFor(
  provider: CommunityProvider,
  tier: MembershipTier,
  connected: boolean,
  status: AccessStatus | null
): NextAction {
  if (tier === "none") return "none";
  if (!connected) return "connect";
  switch (status) {
    case "waiting_for_join":
      return provider === "telegram" ? "join" : "retry";
    case "action_required":
      return "reconnect";
    case "retrying":
    case "revoked":
    case "not_connected":
      return "retry";
    default:
      return "none";
  }
}

async function connectionSummaries(
  db: AppDb,
  userId: string,
  tier: MembershipTier
): Promise<Record<CommunityProvider, ConnectionSummary>> {
  const connections = await db
    .select({ provider: communityConnections.provider, displayName: communityConnections.displayName })
    .from(communityConnections)
    .where(eq(communityConnections.userId, userId));
  const states = await db
    .select({ target: communityAccessState.target, status: communityAccessState.status })
    .from(communityAccessState)
    .where(eq(communityAccessState.userId, userId));

  const summarize = (provider: CommunityProvider): ConnectionSummary => {
    const connection = connections.find((row) => row.provider === provider);
    const state = states.find((row) => row.target === TARGET_FOR_PROVIDER[provider]);
    // A fresh link has no reconciled state yet: it is being processed.
    const status: AccessStatus = state?.status ?? (connection ? "processing" : "not_connected");
    return {
      status,
      ...(connection?.displayName ? { displayName: connection.displayName } : {}),
      nextAction: nextActionFor(provider, tier, Boolean(connection), connection ? status : null),
    };
  };
  return { discord: summarize("discord"), telegram: summarize("telegram") };
}

/**
 * Onboarding state of the signed-in user. Claims the Polar customer that matches the user's
 * verified email; with a checkout id and no membership yet, verifies that checkout with Polar and
 * binds it only when it belongs to the user. The checkout id is never authorization.
 */
export async function getOnboardingStatus(
  db: AppDb,
  user: OnboardingUser,
  { checkoutId, polar, now = new Date() }: { checkoutId?: string | null; polar?: PolarCheckoutReader; now?: Date } = {}
): Promise<OnboardingStatus> {
  await claimCustomerByVerifiedEmail(db, user);

  let { tier } = await getMemberTier(db, user.id, now);
  let payment: PaymentState = tier === "none" ? "none" : "verified";
  if (tier === "none" && checkoutId && polar) {
    payment = await verifyCheckout(db, user, checkoutId, polar, now);
    if (payment === "verified") tier = (await getMemberTier(db, user.id, now)).tier;
  }

  return {
    payment,
    membership: tier === "none" ? null : await membershipSummary(db, user.id, now),
    profile: await profileSummary(db, user.id),
    connections: await connectionSummaries(db, user.id, tier),
  };
}

/** Members who still have a step left see the self-serve banner on /account (no mass email). */
export function needsOnboardingBanner(status: OnboardingStatus): boolean {
  if (!status.membership) return false;
  return (
    !status.profile.completed ||
    status.connections.discord.nextAction === "connect" ||
    status.connections.telegram.nextAction === "connect"
  );
}

/** The signed-in user from the Better Auth session cookie, or null. */
export async function getSessionUser(request: Request): Promise<(OnboardingUser & { role: string }) | null> {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const user = session?.user;
    if (!user?.id) return null;
    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      role: (user as { role?: string | null }).role ?? "user",
    };
  } catch {
    return null;
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

const httpUrl = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), { message: "Only http(s) links are allowed" });

/**
 * Member form. Every field is optional so progress can be saved; `submit: true` additionally
 * requires `goal` and an accepted commitment. Completion is recorded whenever both are present.
 */
export const onboardingProfileSchema = z
  .object({
    goal: optionalText(500),
    profileLinks: z
      .array(z.string())
      .max(3)
      .optional()
      .transform((links) => (links ?? []).map((link) => link.trim()).filter(Boolean))
      .pipe(z.array(httpUrl).max(3)),
    skills: optionalText(200),
    phone: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((value) => value || null)
      .refine((value) => value === null || /^\+?[0-9][0-9 ().-]{5,24}$/.test(value), { message: "Invalid phone number" }),
    commitmentAccepted: z.boolean().optional(),
    submit: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.submit) return;
    if (!value.goal) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["goal"], message: "Required" });
    if (value.commitmentAccepted !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["commitmentAccepted"], message: "Must be accepted" });
    }
  });

export type OnboardingProfileInput = z.infer<typeof onboardingProfileSchema>;

/** Upsert the member form; `completed_at` keeps its first value while the required fields stay present. */
export async function saveOnboardingProfile(
  db: AppDb,
  userId: string,
  input: OnboardingProfileInput,
  now: Date = new Date()
): Promise<ProfileSummary> {
  const [existing] = await db.select().from(onboardingProfiles).where(eq(onboardingProfiles.userId, userId)).limit(1);
  const commitmentAcceptedAt = input.commitmentAccepted ? (existing?.commitmentAcceptedAt ?? now) : null;
  const completedAt = input.goal && commitmentAcceptedAt ? (existing?.completedAt ?? now) : null;
  const values = {
    goal: input.goal,
    profileLinks: input.profileLinks,
    skills: input.skills,
    phone: input.phone,
    commitmentAcceptedAt,
    completedAt,
    updatedAt: now,
  };
  await db
    .insert(onboardingProfiles)
    .values({ userId, ...values, createdAt: now })
    .onConflictDoUpdate({ target: onboardingProfiles.userId, set: values });
  return profileSummary(db, userId);
}

export const RETRY_RATE_LIMIT_MS = 30_000;

/**
 * Queue a member-requested reconcile, at most once per 30 seconds per user across targets. The
 * marker lives in the job payload (D1), so the limit holds across Worker isolates; a webhook
 * re-enqueue rewrites the payload without it and never blocks the member.
 */
export async function requestMemberReconcile(
  db: AppDb,
  userId: string,
  target: CommunityTarget,
  now: Date = new Date()
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  const since = new Date(now.getTime() - RETRY_RATE_LIMIT_MS);
  const [recent] = await db
    .select({ requestedAt: sql<number>`json_extract(${onboardingJobs.payload}, '$.memberRequestedAt')` })
    .from(onboardingJobs)
    .where(
      and(
        eq(onboardingJobs.kind, "reconcile_access"),
        or(
          eq(onboardingJobs.dedupeKey, `reconcile_access:${userId}:discord_guild`),
          eq(onboardingJobs.dedupeKey, `reconcile_access:${userId}:telegram_group`)
        ),
        sql`json_extract(${onboardingJobs.payload}, '$.memberRequestedAt') > ${since.getTime()}`
      )
    )
    .orderBy(sql`json_extract(${onboardingJobs.payload}, '$.memberRequestedAt') desc`)
    .limit(1);
  if (recent) {
    return { ok: false, retryAfterMs: Math.max(1000, Number(recent.requestedAt) + RETRY_RATE_LIMIT_MS - now.getTime()) };
  }
  // Same dedupe key and payload shape as `enqueueAccessReconcile`, plus the member marker.
  await enqueueJob(
    db,
    {
      kind: "reconcile_access",
      dedupeKey: `reconcile_access:${userId}:${target}`,
      payload: { userId, target, memberRequestedAt: now.getTime() },
    },
    now
  );
  return { ok: true };
}

export type UnlinkResult = "unlinked" | "not_linked" | "revoke_failed";

/**
 * Unlink a community account. Access is revoked first by converging the target to tier `none`
 * with the linked account still known to the adapter; the connection row is deleted only after the
 * adapter confirms nothing is applied, and a reconcile then records the unlinked state. A failed
 * revoke keeps the row so the member (or support) can try again.
 */
export async function unlinkCommunityConnection(
  db: AppDb,
  userId: string,
  provider: CommunityProvider,
  now: Date = new Date()
): Promise<UnlinkResult> {
  const target = TARGET_FOR_PROVIDER[provider];
  const [connection] = await db
    .select()
    .from(communityConnections)
    .where(and(eq(communityConnections.userId, userId), eq(communityConnections.provider, provider)))
    .limit(1);
  if (!connection) return "not_linked";
  const [current] = await db
    .select()
    .from(communityAccessState)
    .where(and(eq(communityAccessState.userId, userId), eq(communityAccessState.target, target)))
    .limit(1);

  try {
    const result = await getCommunityAdapter(target).apply({
      db,
      userId,
      target,
      desiredTier: "none",
      connection,
      current: current ?? null,
    });
    if (result.retryable || result.appliedTier !== "none") return "revoke_failed";
  } catch (error) {
    console.warn(`community unlink revoke failed for ${target}: ${error instanceof ProviderError ? error.code : "adapter_error"}`);
    return "revoke_failed";
  }

  await db.delete(communityConnections).where(eq(communityConnections.id, connection.id));
  await enqueueAccessReconcile(db, userId, [target], now);
  return "unlinked";
}

/** Drain queued onboarding jobs after the response, when the Worker context is available. */
export function scheduleOnboardingJobRun(db: AppDb): void {
  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(
      runDueJobs(db, { limit: 5 }).catch(() => {
        console.warn("onboarding job run after member request failed; the cron will retry");
      })
    );
  } catch {
    // No Worker context (local Node, tests): the minute cron drains the queue.
  }
}
