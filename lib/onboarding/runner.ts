import { eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { reconcileCommunityAccess } from "@/lib/community/reconcile";
import { COMMUNITY_TARGETS, PROVIDER_FETCH_TIMEOUT_MS, ProviderError, isFetchTimeout, type CommunityTarget } from "@/lib/community/types";
import { sendOnboardingWelcomeEmail } from "@/lib/email-onboarding-welcome";
import { resyncMembershipSubscriptions, type PolarSubscriptionReader } from "@/lib/membership/polar-resync";
import { getOnboardingEnv } from "./flags";
import { purgeExpiredNonces } from "./nonces";
import { claimDueJobs, completeJob, DEFAULT_JOB_LEASE_MS, failJob, renewJobLease, type OnboardingJob } from "./jobs";

export interface RunDueJobsOptions {
  limit?: number;
  leaseMs?: number;
  now?: () => Date;
}

export interface RunDueJobsSummary {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
  /** Claimed jobs another runner re-took before this one reached them; left to that runner. */
  lost: number;
}

function payloadString(job: OnboardingJob, key: string): string {
  const value = job.payload?.[key];
  if (typeof value !== "string" || !value) throw new ProviderError("invalid_payload");
  return value;
}

async function runReconcile(db: AppDb, job: OnboardingJob): Promise<void> {
  const target = payloadString(job, "target") as CommunityTarget;
  if (!COMMUNITY_TARGETS.includes(target)) throw new ProviderError("invalid_payload");
  await reconcileCommunityAccess(db, payloadString(job, "userId"), target);
}

/** Payload holds ids only; the address is read at send time so no email sits in the queue. */
async function runWelcomeEmail(db: AppDb, job: OnboardingJob): Promise<void> {
  const subscriptionId = payloadString(job, "subscriptionId");
  const [customer] = await db
    .select({ email: customers.email, name: customers.name })
    .from(customers)
    .where(eq(customers.id, payloadString(job, "customerId")))
    .limit(1);
  if (!customer) throw new ProviderError("customer_missing");
  const result = await sendOnboardingWelcomeEmail({
    email: customer.email,
    name: customer.name,
    locale: typeof job.payload.locale === "string" ? job.payload.locale : null,
    idempotencyKey: `nlb-onboarding-welcome-${subscriptionId}`,
  });
  if (!result.success) throw new ProviderError("email_send_failed", { retryable: true });
}

/** Internal admin ping. Optional: without `LARK_ADMIN_WEBHOOK_URL` the job completes as a no-op. */
async function runAdminNotify(job: OnboardingJob): Promise<void> {
  const url = getOnboardingEnv().LARK_ADMIN_WEBHOOK_URL;
  if (!url) return;
  const event = typeof job.payload.event === "string" ? job.payload.event : "onboarding_event";
  const ref = typeof job.payload.ref === "string" ? ` ${job.payload.ref}` : "";
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text: `[NLB onboarding] ${event}${ref}` } }),
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ProviderError(isFetchTimeout(error) ? "admin_notify_timeout" : "admin_notify_network", { retryable: true });
  }
  if (!response.ok) {
    throw new ProviderError(`admin_notify_http_${response.status}`, { retryable: response.status >= 500 || response.status === 429 });
  }
}

async function dispatch(db: AppDb, job: OnboardingJob): Promise<void> {
  switch (job.kind) {
    case "reconcile_access":
      return runReconcile(db, job);
    case "welcome_email":
      return runWelcomeEmail(db, job);
    case "admin_notify":
      return runAdminNotify(job);
    default:
      throw new ProviderError("unknown_job_kind");
  }
}

export const JOB_RUNNER_CRON = "* * * * *";
export const MEMBERSHIP_RESYNC_CRON = "17 * * * *";

/**
 * Entry for the Worker `scheduled()` handler. The minute cron drains the job queue; the hourly cron
 * re-reads live membership subscriptions from Polar (recovering dropped webhooks), queues reconciles
 * for time-based tier changes, and purges old nonces. Both are no-ops while the flag is off.
 */
export async function runOnboardingCron(
  db: AppDb,
  cron: string,
  deps: { enabled: boolean; polar: () => Promise<PolarSubscriptionReader> }
): Promise<void> {
  if (!deps.enabled) return;
  if (cron === MEMBERSHIP_RESYNC_CRON) {
    const summary = await resyncMembershipSubscriptions(db, await deps.polar());
    await purgeExpiredNonces(db);
    console.log(
      `membership resync: checked ${summary.checked}, changed ${summary.changed}, failed ${summary.failed}, drift ${summary.driftEnqueued}`
    );
  }
  // Every cron tick also drains the queue, so jobs queued by the resync start right away.
  await runDueJobs(db, { limit: 25 });
}

/**
 * Drain due onboarding jobs once: claim with a lease, renew it as each job starts, run it, then
 * complete or back off. Called by the minute cron and after enqueue through `waitUntil`. Logs carry
 * job ids and kinds only.
 */
export async function runDueJobs(db: AppDb, options: RunDueJobsOptions = {}): Promise<RunDueJobsSummary> {
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? DEFAULT_JOB_LEASE_MS;
  const claimed = await claimDueJobs(db, options.limit ?? 10, leaseMs, now());
  const summary: RunDueJobsSummary = { claimed: claimed.length, done: 0, retried: 0, dead: 0, lost: 0 };
  for (const claim of claimed) {
    const job = await renewJobLease(db, claim, leaseMs, now());
    if (!job) {
      summary.lost += 1;
      console.warn(`onboarding job ${claim.id} (${claim.kind}) was re-taken by another runner; skipped`);
      continue;
    }
    try {
      await dispatch(db, job);
      await completeJob(db, job, now());
      summary.done += 1;
    } catch (error) {
      const status = await failJob(db, job, error, now());
      if (status === "dead") {
        summary.dead += 1;
        console.error(`onboarding job ${job.id} (${job.kind}) is dead after ${job.attempts} attempt(s)`);
      } else {
        summary.retried += 1;
        console.warn(`onboarding job ${job.id} (${job.kind}) failed attempt ${job.attempts}; will retry`);
      }
    }
  }
  return summary;
}
