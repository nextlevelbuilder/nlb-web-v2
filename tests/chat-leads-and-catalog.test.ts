import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeProtectedHeader, jwtVerify } from "jose";
import { buildChatCatalog, membershipCheckoutLink } from "@/lib/chat/chat-catalog";
import { LEADS_PER_IP_PER_HOUR, chatLeadSchema, hashClientIp, saveChatLead } from "@/lib/chat/chat-lead-service";
import { createSessionAssertion } from "@/lib/chat/dewee-identity-signer";
import { isDeweeChatConfigured } from "@/lib/chat/dewee-runtime-env";
import { MEMBERSHIP_PRICES } from "@/lib/constants/launch";
import { chatLeads } from "@/lib/db/schema";
import { createLocalD1, type LocalD1 } from "./helpers/local-d1";

let local: LocalD1;
beforeAll(async () => {
  local = await createLocalD1();
});
afterAll(async () => {
  await local.dispose();
});

const validLead = { name: "Lan", email: "Lan@Example.com", need: "Ship an MVP", locale: "vi", consent: true };

describe("chat lead input", () => {
  it("requires explicit consent", () => {
    expect(chatLeadSchema.safeParse({ ...validLead, consent: false }).success).toBe(false);
    expect(chatLeadSchema.safeParse({ ...validLead, consent: undefined }).success).toBe(false);
  });

  it("normalises the email and rejects off-site page paths", () => {
    expect(chatLeadSchema.parse(validLead).email).toBe("lan@example.com");
    expect(chatLeadSchema.safeParse({ ...validLead, pagePath: "https://evil.example" }).success).toBe(false);
  });

  it("hashes the client address only when both ip and secret exist", () => {
    expect(hashClientIp(null, "s")).toBeNull();
    expect(hashClientIp("1.2.3.4", undefined)).toBeNull();
    const hash = hashClientIp("1.2.3.4", "secret");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain("1.2.3.4");
  });
});

describe("saveChatLead", () => {
  it("stores the lead with consent time and rate limits one address per hour", async () => {
    const input = chatLeadSchema.parse({ ...validLead, interest: "vip", wantsHuman: true, pagePath: "/vi" });
    const now = new Date("2026-10-31T10:00:00Z");
    for (let i = 0; i < LEADS_PER_IP_PER_HOUR; i++) {
      expect((await saveChatLead(input, { ipHash: "ip-a", userId: null, now }, local.db)).ok).toBe(true);
    }
    expect(await saveChatLead(input, { ipHash: "ip-a", userId: null, now }, local.db)).toEqual({ ok: false, reason: "rate_limited" });
    expect((await saveChatLead(input, { ipHash: "ip-b", userId: null, now }, local.db)).ok).toBe(true);
    const later = new Date(now.getTime() + 3_600_001);
    expect((await saveChatLead(input, { ipHash: "ip-a", userId: null, now: later }, local.db)).ok).toBe(true);

    const [row] = await local.db.select().from(chatLeads).limit(1);
    expect(row).toMatchObject({ email: "lan@example.com", interest: "vip", wantsHuman: true, status: "new", locale: "vi" });
    expect(row.consentedAt).toBeInstanceOf(Date);
  });
});

describe("buildChatCatalog", () => {
  it("quotes the launch prices with checkout links into the existing dialog", async () => {
    const catalog = await buildChatCatalog({ locale: "vi", db: local.db, seats: null, origin: "https://nextlevelbuilder.io" });
    const vip = catalog.plans.find((plan) => plan.plan === "vip");
    expect(vip?.prices.annual.amount).toBe(MEMBERSHIP_PRICES.vip.annual.amount);
    expect(vip?.prices.annual.checkoutUrl).toBe("https://nextlevelbuilder.io/vi?checkout=vip&billing=annual#pricing");
    expect(vip?.features.length).toBeGreaterThan(0);
    expect(catalog.faq.length).toBeGreaterThan(0);
    expect(catalog.links.refundPolicy).toBe("https://nextlevelbuilder.io/vi/policies/refund");
  });

  it("keeps English unprefixed", () => {
    expect(membershipCheckoutLink("https://x.test", "en", "premium", "quarterly")).toBe("https://x.test/?checkout=premium&billing=quarterly#pricing");
  });
});

describe("Dewee configuration and identity", () => {
  it("needs every CCP value and a long webchat secret", () => {
    const env = {
      DEWEE_CCP_CHAT_URL: "https://app.dewee.sh/api/public/webchat/v1/wci_1",
      DEWEE_WEBCHAT_INTEGRATION_ID: "wci_1",
      DEWEE_WEBCHAT_INTEGRATION_SECRET: "dwc_x",
      DEWEE_WEBCHAT_SECRET: "x".repeat(32),
    };
    expect(isDeweeChatConfigured(env)).toBe(true);
    expect(isDeweeChatConfigured({ ...env, DEWEE_WEBCHAT_SECRET: "short" })).toBe(false);
    expect(isDeweeChatConfigured({ ...env, DEWEE_CCP_CHAT_URL: undefined })).toBe(false);
  });

  it("signs a short-lived session assertion with the claims Dewee verifies", async () => {
    const secret = "s".repeat(32);
    const applicationId = "0F2B8C3A-1D4E-4F5A-8B6C-7D8E9F0A1B2C";
    const token = await createSessionAssertion({ subject: "user_123", applicationId, issuer: "nextlevelbuilder.io", secret });
    expect(decodeProtectedHeader(token)).toMatchObject({ alg: "HS256", typ: "dewee-session+jwt" });
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: "nextlevelbuilder.io",
      audience: `dewee:${applicationId.toLowerCase()}`,
    });
    expect(payload.sub).toBe("user_123");
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300);
    expect(payload.jti).toBeTruthy();
  });

  it("refuses emails as subjects and short secrets", async () => {
    const base = { applicationId: "0f2b8c3a-1d4e-4f5a-8b6c-7d8e9f0a1b2c", issuer: "nlb", secret: "s".repeat(32) };
    await expect(createSessionAssertion({ ...base, subject: "a@b.c" })).rejects.toThrow();
    await expect(createSessionAssertion({ ...base, subject: "u1", secret: "short" })).rejects.toThrow();
  });
});
