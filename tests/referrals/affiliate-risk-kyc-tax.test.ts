import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import {
  affiliateAttributions,
  affiliateConversions,
  affiliatePayoutMethods,
  affiliateVerifications,
} from "@/lib/db/schema";
import { attributeCheckout } from "@/lib/referrals/affiliate-checkout";
import { syncReferralOrder } from "@/lib/referrals/affiliate-conversions";
import {
  adjustAffiliateBalance,
  approvePayoutBatch,
  createPayoutBatch,
  markPayoutItemPaid,
  previewPayouts,
  setPayoutMethod,
} from "@/lib/referrals/affiliate-payouts";
import {
  parseTaxYear,
  taxDocumentNumber,
  taxStatement,
  taxStatementCsv,
  taxYearRange,
} from "@/lib/referrals/affiliate-tax-documents";
import {
  applyVerificationDecision,
  findVerification,
  startVerification,
  verificationView,
} from "@/lib/referrals/affiliate-verification";
import type { EkycProvider } from "@/lib/referrals/ekyc/ekyc-provider";
import { EkycSignatureError } from "@/lib/referrals/ekyc/ekyc-provider";
import {
  SumsubProvider,
  sumsubStatusOf,
} from "@/lib/referrals/ekyc/sumsub-provider";
import {
  evaluateConversionRisk,
  riskHoldReason,
} from "@/lib/referrals/fraud-heuristics";
import {
  DEFAULT_PROGRAM_RULES,
  publishProgramRules,
  withholdingFrom,
} from "@/lib/referrals/program-rules";
import {
  deviceHashFor,
  instrumentHashFor,
  recordAffiliateDevice,
} from "@/lib/referrals/risk-signals";
import { POST as sumsubWebhook } from "@/app/api/webhooks/ekyc/sumsub/route";
import { createLocalD1 } from "../helpers/local-d1";
import {
  DAY,
  PREMIUM,
  TEST_ENCRYPTION_KEY,
  fakeDiscounts,
  nextSeq,
  paidOrder,
  seedAffiliate,
  seedAffiliateWithLink,
  seedUser,
} from "./referral-fixtures";

const NOW = new Date("2026-10-31T00:00:00Z");

beforeEach(() => {
  vi.stubEnv("AFFILIATES_ENABLED", "true");
  vi.stubEnv("ONBOARDING_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Runs `scenario` on a fresh in-memory D1, for scenarios that publish rule versions. */
async function onFreshDb(scenario: () => Promise<void>): Promise<void> {
  const holder = globalThis as { __NLB_TEST_DB__?: AppDb };
  const previous = holder.__NLB_TEST_DB__;
  const local = await createLocalD1();
  holder.__NLB_TEST_DB__ = local.db;
  try {
    await scenario();
  } finally {
    holder.__NLB_TEST_DB__ = previous;
    await local.dispose();
  }
}

/** A referred, settled first purchase by a new buyer, checked out from browser `visitorId`. */
async function referredSale(
  link: { code: string },
  visitorId: string | null,
  paidAt = new Date(),
) {
  const buyer = await seedUser("buyer");
  const attempt = await attributeCheckout(getDb(), fakeDiscounts(), {
    buyerUserId: buyer.id,
    polarProductId: PREMIUM,
    explicitCode: link.code,
    visitorId,
  });
  if (!attempt.applied) throw new Error(`not applied: ${attempt.reason}`);
  const orderId = `order-${nextSeq()}`;
  const outcome = await syncReferralOrder(
    getDb(),
    paidOrder({
      orderId,
      attributionId: attempt.attributionId,
      buyerUserId: buyer.id,
      discountId: null,
      createdAt: paidAt,
    }),
    paidAt,
  );
  const [conversion] = await getDb()
    .select()
    .from(affiliateConversions)
    .where(eq(affiliateConversions.polarOrderId, orderId));
  return { buyer, outcome, conversion, attributionId: attempt.attributionId };
}

describe("risk signals", () => {
  it("keeps only keyed hashes: stable per input, distinct per purpose, none without the key", async () => {
    const device = await deviceHashFor("visitor-1");
    expect(device).toMatch(/^[0-9a-f]{64}$/);
    expect(await deviceHashFor("visitor-1")).toBe(device);
    expect(await deviceHashFor("visitor-2")).not.toBe(device);
    expect(await deviceHashFor(null)).toBeNull();
    const paypal = await instrumentHashFor("paypal", {
      paypalEmail: "Payee@Example.com",
    });
    expect(
      await instrumentHashFor("paypal", { paypalEmail: "payee@example.com" }),
    ).toBe(paypal);
    expect(paypal).not.toContain("payee");
    const bank = await instrumentHashFor("bank_vn", {
      bankName: "Vietcombank",
      accountNumber: "0123 456 789",
    });
    expect(
      await instrumentHashFor("bank_vn", {
        bankName: "VIETCOMBANK",
        accountNumber: "0123456789",
      }),
    ).toBe(bank);
    vi.stubEnv("ONBOARDING_ENCRYPTION_KEY", "");
    expect(await deviceHashFor("visitor-1")).toBeNull();
  });

  it("stores the device hash on the attribution snapshot, never the visitor id", async () => {
    const { link } = await seedAffiliateWithLink(0);
    const { attributionId } = await referredSale(link, "visitor-snapshot");
    const [attribution] = await getDb()
      .select()
      .from(affiliateAttributions)
      .where(eq(affiliateAttributions.id, attributionId));
    expect(attribution.deviceHash).toBe(
      await deviceHashFor("visitor-snapshot"),
    );
    expect(JSON.stringify(attribution)).not.toContain("visitor-snapshot");
  });
});

describe("fraud heuristics", () => {
  const rules = {
    ...DEFAULT_PROGRAM_RULES,
    fraud: {
      velocityMaxConversions: 2,
      velocityWindowHours: 24,
      deviceClusterMinBuyers: 2,
      deviceClusterWindowDays: 90,
    },
  };

  it("velocity: flags a conversion once the affiliate reached the limit inside the window", async () => {
    const { affiliate, link } = await seedAffiliateWithLink(0);
    const input = {
      affiliateId: affiliate.id,
      buyerUserId: "buyer-x",
      deviceHash: null,
      now: new Date(),
    };
    expect(await evaluateConversionRisk(getDb(), rules, input)).toEqual([]);
    await referredSale(link, null);
    expect(await evaluateConversionRisk(getDb(), rules, input)).toEqual([]);
    await referredSale(link, null);
    expect(await evaluateConversionRisk(getDb(), rules, input)).toEqual([
      "velocity",
    ]);
    // Conversions older than the window no longer count.
    expect(
      await evaluateConversionRisk(getDb(), rules, {
        ...input,
        now: new Date(Date.now() + 2 * DAY),
      }),
    ).toEqual([]);
  });

  it("velocity: the published limit holds the conversion that exceeds it", () =>
    onFreshDb(async () => {
      await publishProgramRules(getDb(), { rules, actorUserId: "op" });
      const { link } = await seedAffiliateWithLink(0);
      const first = await referredSale(link, null);
      const second = await referredSale(link, null);
      const third = await referredSale(link, null);
      expect([first.outcome, second.outcome]).toEqual(["accrued", "accrued"]);
      expect(third.outcome).toBe("held");
      expect(third.conversion).toMatchObject({
        status: "held",
        holdReason: "risk:velocity",
      });
    }));

  it("shared payment instrument: holds conversions of affiliates that registered the same payout account", async () => {
    const { affiliate, link } = await seedAffiliateWithLink(0);
    const other = await seedAffiliate();
    const email = `shared${nextSeq()}@example.com`;
    await setPayoutMethod(getDb(), affiliate.id, {
      type: "paypal",
      payeeType: "individual",
      residency: "other",
      paypalEmail: email,
    });
    const clean = await referredSale(link, null);
    expect(clean.conversion.status).toBe("pending");

    await setPayoutMethod(getDb(), other.affiliate.id, {
      type: "paypal",
      payeeType: "individual",
      residency: "other",
      paypalEmail: email.toUpperCase(),
    });
    const [stored] = await getDb()
      .select()
      .from(affiliatePayoutMethods)
      .where(eq(affiliatePayoutMethods.affiliateId, other.affiliate.id));
    expect(stored.instrumentHash).toBe(
      await instrumentHashFor("paypal", { paypalEmail: email }),
    );
    const held = await referredSale(link, null);
    expect(held.conversion).toMatchObject({
      status: "held",
      holdReason: "risk:shared_instrument",
    });
  });

  it("device cluster: holds the second referred buyer checking out from the same browser", async () => {
    const { link } = await seedAffiliateWithLink(0);
    const first = await referredSale(link, "visitor-farm");
    expect(first.conversion.status).toBe("pending");
    const second = await referredSale(link, "visitor-farm");
    expect(second.outcome).toBe("held");
    expect(second.conversion).toMatchObject({
      status: "held",
      holdReason: "risk:device_cluster",
    });
    const unrelated = await referredSale(link, "visitor-elsewhere");
    expect(unrelated.conversion.status).toBe("pending");
  });

  it("device cluster: holds a purchase made from the affiliate's own signed-in browser", async () => {
    const { affiliate, link } = await seedAffiliateWithLink(0);
    await recordAffiliateDevice(getDb(), affiliate.id, "visitor-self", NOW);
    const sale = await referredSale(link, "visitor-self");
    expect(sale.conversion).toMatchObject({
      status: "held",
      holdReason: "risk:device_cluster",
    });
  });

  it("lists every matching signal in the hold reason", () => {
    expect(riskHoldReason([])).toBeNull();
    expect(riskHoldReason(["velocity", "device_cluster"])).toBe(
      "risk:velocity,device_cluster",
    );
  });

  it("rejects fraud thresholds outside their ranges", async () => {
    await expect(
      publishProgramRules(getDb(), {
        rules: {
          ...rules,
          fraud: { ...rules.fraud, deviceClusterMinBuyers: 1 },
        },
        actorUserId: "op",
      }),
    ).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
});

const SUMSUB = {
  appToken: "test-app-token",
  secretKey: "test-secret-key",
  webhookSecret: "test-webhook-secret",
  levelName: "vn-payee",
};

function signedWebhook(
  body: unknown,
  secret = SUMSUB.webhookSecret,
  alg: "HMAC_SHA256_HEX" | "HMAC_SHA512_HEX" = "HMAC_SHA256_HEX",
) {
  const raw = JSON.stringify(body);
  const digest = createHmac(
    alg === "HMAC_SHA256_HEX" ? "sha256" : "sha512",
    secret,
  )
    .update(raw)
    .digest("hex");
  return {
    raw,
    headers: new Headers({
      "content-type": "application/json",
      "x-payload-digest": digest,
      "x-payload-digest-alg": alg,
    }),
  };
}

describe("Sumsub adapter", () => {
  it("signs each API request and returns the applicant reference with the hosted link", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchStub = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/resources/applicants?"))
        return Response.json({ description: "exists" }, { status: 409 });
      if (url.includes("/resources/applicants/-;externalUserId="))
        return Response.json({ id: "applicant-1" });
      return Response.json({ url: "https://in.sumsub.com/websdk/p/abc" });
    }) as unknown as typeof fetch;
    const provider = new SumsubProvider({
      ...SUMSUB,
      fetch: fetchStub,
      now: () => NOW,
    });
    expect(
      await provider.start({ externalUserId: "aff-1", locale: "vi" }),
    ).toEqual({
      providerReference: "applicant-1",
      url: "https://in.sumsub.com/websdk/p/abc",
    });
    expect(calls).toHaveLength(3);
    for (const { url, init } of calls) {
      const headers = init.headers as Record<string, string>;
      const ts = String(Math.floor(NOW.getTime() / 1000));
      const path = url.replace("https://api.sumsub.com", "");
      const expected = createHmac("sha256", SUMSUB.secretKey)
        .update(`${ts}${init.method}${path}${init.body ?? ""}`)
        .digest("hex");
      expect(headers["X-App-Token"]).toBe(SUMSUB.appToken);
      expect(headers["X-App-Access-Ts"]).toBe(ts);
      expect(headers["X-App-Access-Sig"]).toBe(expected);
    }
    expect(calls[2].url).toContain(
      "/resources/sdkIntegrations/levels/vn-payee/websdkLink?externalUserId=aff-1",
    );
  });

  it("fails closed when the provider returns no link", async () => {
    const fetchStub = (async (url: string) =>
      url.includes("/resources/applicants?")
        ? Response.json({ id: "applicant-2" })
        : Response.json({ url: "http://insecure" })) as unknown as typeof fetch;
    const provider = new SumsubProvider({ ...SUMSUB, fetch: fetchStub });
    await expect(
      provider.start({ externalUserId: "aff-2", locale: "en" }),
    ).rejects.toMatchObject({ name: "EkycUnavailableError" });
  });

  it("verifies the webhook digest before reading the event", async () => {
    const provider = new SumsubProvider(SUMSUB);
    const event = {
      type: "applicantReviewed",
      applicantId: "applicant-1",
      externalUserId: "aff-1",
      createdAtMs: String(NOW.getTime()),
      reviewResult: { reviewAnswer: "GREEN" },
    };
    const good = signedWebhook(event);
    expect(await provider.parseWebhook(good.raw, good.headers)).toEqual({
      providerReference: "applicant-1",
      externalUserId: "aff-1",
      status: "verified",
      detail: null,
      occurredAt: NOW,
    });
    const sha512 = signedWebhook(
      event,
      SUMSUB.webhookSecret,
      "HMAC_SHA512_HEX",
    );
    expect(
      await provider.parseWebhook(sha512.raw, sha512.headers),
    ).toMatchObject({ status: "verified" });
    const forged = signedWebhook(event, "wrong-secret");
    await expect(
      provider.parseWebhook(forged.raw, forged.headers),
    ).rejects.toBeInstanceOf(EkycSignatureError);
    await expect(
      provider.parseWebhook(good.raw.replace("GREEN", "RED"), good.headers),
    ).rejects.toBeInstanceOf(EkycSignatureError);
    await expect(
      provider.parseWebhook(good.raw, new Headers()),
    ).rejects.toBeInstanceOf(EkycSignatureError);
  });

  it("maps review outcomes to verification statuses", () => {
    expect(
      sumsubStatusOf({
        type: "applicantReviewed",
        reviewResult: { reviewAnswer: "GREEN" },
      }),
    ).toEqual({ status: "verified", detail: null });
    expect(
      sumsubStatusOf({
        type: "applicantReviewed",
        reviewResult: {
          reviewAnswer: "RED",
          reviewRejectType: "FINAL",
          rejectLabels: ["FORGERY", "bad label!"],
        },
      }),
    ).toEqual({
      status: "rejected",
      detail: "FINAL,FORGERY",
    });
    expect(
      sumsubStatusOf({
        type: "applicantReviewed",
        reviewResult: {
          reviewAnswer: "RED",
          reviewRejectType: "RETRY",
          rejectLabels: ["UNSATISFACTORY_PHOTOS"],
        },
      }),
    ).toEqual({
      status: "pending",
      detail: "RETRY,UNSATISFACTORY_PHOTOS",
    });
    expect(sumsubStatusOf({ type: "applicantReset" })).toEqual({
      status: "pending",
      detail: "applicantReset",
    });
    expect(sumsubStatusOf({ type: "applicantDeactivated" })).toEqual({
      status: "expired",
      detail: "applicantDeactivated",
    });
    expect(sumsubStatusOf({ type: "applicantCreated" })).toBeNull();
  });
});

/** A stand-in provider for the domain flow (the Sumsub adapter has its own tests above). */
function testProvider(
  reference = `applicant-${nextSeq()}`,
): EkycProvider & { starts: number } {
  const provider = {
    name: "sumsub",
    starts: 0,
    start: async () => {
      provider.starts++;
      return {
        providerReference: reference,
        url: `https://in.sumsub.com/websdk/p/${reference}`,
      };
    },
    parseWebhook: async () => null,
  };
  return provider;
}

async function vnBankPayee(available = 100_000) {
  const seeded = await seedAffiliate();
  await adjustAffiliateBalance(getDb(), {
    affiliateId: seeded.affiliate.id,
    amountMinor: available,
    reason: "seed credit",
    actorUserId: "op",
    idempotencyKey: `seed-${nextSeq()}`,
  });
  await setPayoutMethod(getDb(), seeded.affiliate.id, {
    type: "bank_vn",
    payeeType: "individual",
    residency: "vn",
    bankName: "Vietcombank",
    accountHolder: "NGUYEN VAN A",
    accountNumber: String(1_000_000_000 + nextSeq()),
  });
  return seeded.affiliate;
}

const decision = (
  providerReference: string,
  status: "verified" | "rejected" | "pending" | "expired",
  at: Date,
  externalUserId: string | null = null,
) => ({
  providerReference,
  externalUserId,
  status,
  detail: null,
  occurredAt: at,
});

describe("identity verification", () => {
  it("stays unavailable while the feature flag is off", async () => {
    const affiliate = await vnBankPayee();
    await expect(
      startVerification(getDb(), testProvider(), affiliate, { locale: "vi" }),
    ).rejects.toMatchObject({ status: 503, code: "verification_unavailable" });
    vi.stubEnv("AFFILIATE_EKYC_ENABLED", "true");
    await expect(
      startVerification(getDb(), null, affiliate, { locale: "vi" }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("is only needed for a Vietnamese bank payout method", async () => {
    vi.stubEnv("AFFILIATE_EKYC_ENABLED", "true");
    const { affiliate } = await seedAffiliate();
    await setPayoutMethod(getDb(), affiliate.id, {
      type: "paypal",
      payeeType: "individual",
      residency: "other",
      paypalEmail: `p${nextSeq()}@example.com`,
    });
    await expect(
      startVerification(getDb(), testProvider(), affiliate, { locale: "en" }),
    ).rejects.toMatchObject({ status: 409, code: "verification_not_required" });
  });

  it("stores only the provider reference and status, and blocks the payout until verified", async () => {
    vi.stubEnv("AFFILIATE_EKYC_ENABLED", "true");
    const affiliate = await vnBankPayee();
    const provider = testProvider("applicant-vn-1");
    const started = await startVerification(
      getDb(),
      provider,
      affiliate,
      { locale: "vi" },
      NOW,
    );
    expect(started.url).toBe("https://in.sumsub.com/websdk/p/applicant-vn-1");
    expect(started.verification).toEqual({
      status: "pending",
      provider: "sumsub",
      detail: null,
      verifiedAt: null,
      updatedAt: NOW.toISOString(),
    });
    expect(JSON.stringify(started.verification)).not.toContain(
      "applicant-vn-1",
    );
    const [row] = await getDb()
      .select()
      .from(affiliateVerifications)
      .where(eq(affiliateVerifications.affiliateId, affiliate.id));
    expect(row).toMatchObject({
      provider: "sumsub",
      providerReference: "applicant-vn-1",
      status: "pending",
    });

    // Restarting reuses the one row per provider.
    await startVerification(
      getDb(),
      provider,
      affiliate,
      { locale: "vi" },
      new Date(NOW.getTime() + 1000),
    );
    expect(
      await getDb()
        .select()
        .from(affiliateVerifications)
        .where(eq(affiliateVerifications.affiliateId, affiliate.id)),
    ).toHaveLength(1);

    const period = "2026-09";
    const blockersOf = async () =>
      (await previewPayouts(getDb(), period, NOW)).lines.find(
        (line) => line.affiliateId === affiliate.id,
      )?.blockers;
    expect(await blockersOf()).toContain("verification_required");

    await applyVerificationDecision(
      getDb(),
      "sumsub",
      decision("applicant-vn-1", "verified", new Date(NOW.getTime() + 2000)),
    );
    expect(await blockersOf()).not.toContain("verification_required");
    expect(
      verificationView(await findVerification(getDb(), affiliate.id)),
    ).toMatchObject({
      status: "verified",
      verifiedAt: new Date(NOW.getTime() + 2000).toISOString(),
    });

    // A verified payee gets no new link; a later deactivation blocks again.
    expect(
      await startVerification(
        getDb(),
        provider,
        affiliate,
        { locale: "vi" },
        NOW,
      ),
    ).toMatchObject({ url: null });
    await applyVerificationDecision(
      getDb(),
      "sumsub",
      decision("applicant-vn-1", "expired", new Date(NOW.getTime() + 3000)),
    );
    expect(await blockersOf()).toContain("verification_required");
  });

  it("ignores events older than the stored decision and unknown applicants of no affiliate", async () => {
    vi.stubEnv("AFFILIATE_EKYC_ENABLED", "true");
    const affiliate = await vnBankPayee();
    await startVerification(
      getDb(),
      testProvider("applicant-order"),
      affiliate,
      { locale: "vi" },
      NOW,
    );
    await applyVerificationDecision(
      getDb(),
      "sumsub",
      decision("applicant-order", "verified", new Date(NOW.getTime() + 5000)),
    );
    expect(
      await applyVerificationDecision(
        getDb(),
        "sumsub",
        decision("applicant-order", "pending", new Date(NOW.getTime() + 1000)),
      ),
    ).toBeNull();
    expect((await findVerification(getDb(), affiliate.id))?.status).toBe(
      "verified",
    );

    expect(
      await applyVerificationDecision(
        getDb(),
        "sumsub",
        decision("applicant-stranger", "verified", NOW, "not-an-affiliate"),
      ),
    ).toBeNull();
    const other = await vnBankPayee();
    const adopted = await applyVerificationDecision(
      getDb(),
      "sumsub",
      decision("applicant-direct", "rejected", NOW, other.id),
    );
    expect(adopted).toMatchObject({
      affiliateId: other.id,
      status: "rejected",
    });
    await expect(
      startVerification(getDb(), testProvider(), other, { locale: "vi" }),
    ).rejects.toMatchObject({ status: 409, code: "verification_rejected" });
  });

  it("the webhook route records signed decisions and refuses forged ones", async () => {
    const affiliate = await vnBankPayee();
    const request = (signed: { raw: string; headers: Headers }) =>
      new Request("https://nlb.test/api/webhooks/ekyc/sumsub", {
        method: "POST",
        headers: signed.headers,
        body: signed.raw,
      });
    const event = {
      type: "applicantReviewed",
      applicantId: "applicant-hook",
      externalUserId: affiliate.id,
      createdAtMs: NOW.getTime(),
      reviewResult: { reviewAnswer: "GREEN" },
    };
    expect((await sumsubWebhook(request(signedWebhook(event)))).status).toBe(
      404,
    );

    vi.stubEnv("AFFILIATE_EKYC_ENABLED", "true");
    vi.stubEnv("SUMSUB_APP_TOKEN", SUMSUB.appToken);
    vi.stubEnv("SUMSUB_SECRET_KEY", SUMSUB.secretKey);
    vi.stubEnv("SUMSUB_WEBHOOK_SECRET", SUMSUB.webhookSecret);
    vi.stubEnv("SUMSUB_LEVEL_NAME", SUMSUB.levelName);
    expect(
      (await sumsubWebhook(request(signedWebhook(event, "forged")))).status,
    ).toBe(401);
    expect(await findVerification(getDb(), affiliate.id)).toBeNull();
    expect((await sumsubWebhook(request(signedWebhook(event)))).status).toBe(
      200,
    );
    expect(await findVerification(getDb(), affiliate.id)).toMatchObject({
      providerReference: "applicant-hook",
      status: "verified",
    });
  });
});

describe("withholding", () => {
  it("never takes a Vietnamese rate from the built-in defaults", () => {
    const rules = {
      ...DEFAULT_PROGRAM_RULES,
      withholding: { vnIndividualBps: 1000, vnBusinessBps: 500, otherBps: 0 },
    };
    expect(DEFAULT_PROGRAM_RULES.withholding).toMatchObject({
      vnIndividualBps: null,
      vnBusinessBps: null,
    });
    expect(withholdingFrom({ version: 0, rules })).toEqual({
      vnIndividualBps: null,
      vnBusinessBps: null,
      otherBps: 0,
    });
    expect(withholdingFrom({ version: 3, rules })).toEqual(rules.withholding);
  });

  it("blocks Vietnamese payees until a published rule sets their rate, then snapshots the rates on the payout", () =>
    onFreshDb(async () => {
      vi.stubEnv("AFFILIATE_EKYC_ENABLED", "true");
      vi.stubEnv("AFFILIATE_PAYOUTS_ENABLED", "true");
      const affiliate = await vnBankPayee(100_000);
      await startVerification(
        getDb(),
        testProvider("applicant-wht"),
        affiliate,
        { locale: "vi" },
        NOW,
      );
      await applyVerificationDecision(
        getDb(),
        "sumsub",
        decision("applicant-wht", "verified", new Date(NOW.getTime() + 1000)),
      );
      const lineOf = async () =>
        (await previewPayouts(getDb(), "2026-09", NOW)).lines.find(
          (line) => line.affiliateId === affiliate.id,
        )!;
      expect((await lineOf()).blockers).toEqual(["withholding_rule_missing"]);

      // A published version that still has no Vietnamese rate keeps the block.
      await publishProgramRules(getDb(), {
        rules: DEFAULT_PROGRAM_RULES,
        actorUserId: "op",
      });
      expect((await lineOf()).blockers).toEqual(["withholding_rule_missing"]);

      // An illustrative rate for this test only: real rates come from the reviewed, published rules.
      const reviewed = {
        ...DEFAULT_PROGRAM_RULES,
        withholding: {
          ...DEFAULT_PROGRAM_RULES.withholding,
          vnIndividualBps: 1000,
        },
      };
      await publishProgramRules(getDb(), {
        rules: reviewed,
        actorUserId: "op",
      });
      const line = await lineOf();
      expect(line.blockers).toEqual([]);
      expect(line).toMatchObject({
        serviceFeeBps: 0,
        withholdingBps: 1000,
        amounts: {
          grossMinor: 100_000,
          serviceFeeMinor: 0,
          withholdingMinor: 10_000,
          netMinor: 90_000,
        },
      });

      const { batch, items } = await createPayoutBatch(
        getDb(),
        "2026-09",
        "op-1",
        NOW,
      );
      const item = items.find((entry) => entry.affiliateId === affiliate.id)!;
      expect(item).toMatchObject({
        serviceFeeBps: 0,
        withholdingBps: 1000,
        withholdingMinor: 10_000,
        netMinor: 90_000,
      });

      // A later rules change never rewrites the recorded rate.
      await publishProgramRules(getDb(), {
        rules: {
          ...reviewed,
          withholding: { ...reviewed.withholding, vnIndividualBps: 500 },
        },
        actorUserId: "op",
      });
      await approvePayoutBatch(
        getDb(),
        batch.id,
        { actorUserId: "op-2", approvalId: null },
        NOW,
      );
      await markPayoutItemPaid(
        getDb(),
        item.id,
        {
          externalReference: "VCB-TX-0001",
          payoutCurrency: "usd",
          payoutAmountMinor: 90_000,
        },
        "op-2",
        NOW,
      );

      const statement = await taxStatement(
        getDb(),
        affiliate.id,
        2026,
        "usd",
        NOW,
      );
      expect(statement).toMatchObject({
        kind: "withholding_statement",
        documentNumber: taxDocumentNumber(affiliate.id, 2026),
        year: 2026,
        final: false,
        totals: {
          payouts: 1,
          grossMinor: 100_000,
          serviceFeeMinor: 0,
          withholdingMinor: 10_000,
          netMinor: 90_000,
        },
      });
      expect(statement.lines[0]).toMatchObject({
        payoutItemId: item.id,
        methodType: "bank_vn",
        payeeType: "individual",
        residency: "vn",
        withholdingBps: 1000,
        externalReference: "VCB-TX-0001",
      });
      expect(statement.lines[0]).not.toHaveProperty("accountNumber");

      const csv = taxStatementCsv(statement);
      expect(csv.split("\r\n")[0]).toContain(statement.documentNumber);
      expect(csv).toContain(`${item.id},2026-09,`);
      expect(csv).toContain("total,,,,,,100000,,0,,10000,90000");

      // Other tax years and other affiliates have no lines; a past year is final.
      expect(
        (
          await taxStatement(
            getDb(),
            affiliate.id,
            2027,
            "usd",
            new Date("2028-01-01T00:00:00Z"),
          )
        ).totals.payouts,
      ).toBe(0);
      expect(
        (await taxStatement(getDb(), "someone-else", 2026, "usd", NOW)).lines,
      ).toEqual([]);
      expect(
        (
          await taxStatement(
            getDb(),
            affiliate.id,
            2026,
            "usd",
            new Date("2027-01-02T00:00:00Z"),
          )
        ).final,
      ).toBe(true);
    }));
});

describe("tax statements", () => {
  it("uses Vietnam time for the tax year and validates the year", () => {
    expect(taxYearRange(2026)).toEqual({
      from: new Date("2025-12-31T17:00:00Z"),
      to: new Date("2026-12-31T17:00:00Z"),
    });
    expect(parseTaxYear(null, NOW)).toBe(2026);
    expect(parseTaxYear(null, new Date("2026-12-31T18:00:00Z"))).toBe(2027);
    expect(parseTaxYear("2026", NOW)).toBe(2026);
    expect(() => parseTaxYear("2025", NOW)).toThrow();
    expect(() => parseTaxYear("2027", NOW)).toThrow();
    expect(() => parseTaxYear("20x6", NOW)).toThrow();
  });

  it("neutralises spreadsheet formulas in CSV cells", () => {
    const csv = taxStatementCsv({
      kind: "withholding_statement",
      documentNumber: "NLB-AFF-WHT-2026-X",
      affiliateId: "a",
      year: 2026,
      currency: "usd",
      final: false,
      generatedAt: NOW.toISOString(),
      lines: [
        {
          payoutItemId: "i",
          period: "2026-09",
          paidAt: NOW.toISOString(),
          methodType: "paypal",
          payeeType: "individual",
          residency: "other",
          grossMinor: 1,
          serviceFeeBps: 0,
          serviceFeeMinor: 0,
          withholdingBps: 0,
          withholdingMinor: 0,
          netMinor: 1,
          payoutCurrency: "usd",
          fxRate: null,
          payoutAmountMinor: 1,
          externalReference: "=HYPERLINK(1)",
        },
      ],
      totals: {
        payouts: 1,
        grossMinor: 1,
        serviceFeeMinor: 0,
        withholdingMinor: 0,
        netMinor: 1,
      },
    });
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).not.toContain(",=HYPERLINK");
  });
});
