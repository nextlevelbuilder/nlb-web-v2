import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import vi from "@/messages/vi.json";
import robots from "@/app/robots";
import { onboardingPolicy } from "@/content/policies/onboarding";
import { onboardingEventProperties } from "@/lib/analytics/onboarding-events";
import { trafficPageContext } from "@/lib/traffic-client";
import { DISCORD_ERROR_CODES } from "@/components/onboarding/onboarding-api";

type Messages = Record<string, unknown>;

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Messages).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

function lookup(messages: Messages, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Messages | undefined)?.[key], messages);
}

const NAMESPACES = ["onboarding", "accountMembership"] as const;
const ACCESS_STATUSES = ["not_connected", "processing", "waiting_for_join", "active", "retrying", "action_required", "revoked"];

describe("onboarding copy", () => {
  it.each(NAMESPACES)("has the same %s keys in EN and VI, none empty", (namespace) => {
    const enKeys = leafKeys((en as Messages)[namespace]).sort();
    const viKeys = leafKeys((vi as Messages)[namespace]).sort();
    expect(enKeys.length).toBeGreaterThan(20);
    expect(viKeys).toEqual(enKeys);
    for (const key of enKeys) {
      expect(String(lookup((en as Messages)[namespace] as Messages, key)).trim(), `en ${namespace}.${key}`).not.toBe("");
      expect(String(lookup((vi as Messages)[namespace] as Messages, key)).trim(), `vi ${namespace}.${key}`).not.toBe("");
    }
  });

  it("covers every access status and Discord error code", () => {
    for (const messages of [en, vi] as Messages[]) {
      for (const status of ACCESS_STATUSES) expect(lookup(messages, `onboarding.status.${status}`)).toBeTruthy();
      for (const code of DISCORD_ERROR_CODES) expect(lookup(messages, `onboarding.discord.errors.${code}`)).toBeTruthy();
    }
  });

  it("writes Vietnamese with diacritics", () => {
    expect(JSON.stringify((vi as Messages).onboarding)).toMatch(/[ạảãàáâầấậẩẫăằắặẳẵđêềếệểễôồốộổỗơờớợởỡưừứựửữ]/);
  });
});

describe("onboarding policy", () => {
  it("describes automatic access, the grace period and rejoining in both locales, with no manual review", () => {
    for (const locale of ["en", "vi"] as const) {
      const text = JSON.stringify(onboardingPolicy.content[locale]);
      expect(text).not.toMatch(/2[–-]3/);
      expect(text).toMatch(/7/);
    }
    // Only re-joining after a violation is still reviewed by hand; joining never is.
    expect(onboardingPolicy.content.en.sections.map((section) => section.heading).join("\n")).not.toMatch(/review/i);
    expect(JSON.stringify(onboardingPolicy.content.en)).toMatch(/no manual review/i);
  });
});

describe("privacy of the onboarding page", () => {
  it("is disallowed for crawlers in every locale", () => {
    const disallow = robots().rules;
    const rules = Array.isArray(disallow) ? disallow : [disallow];
    const paths = rules.flatMap((rule) => rule.disallow ?? []);
    expect(paths).toEqual(expect.arrayContaining(["/onboarding", "/vi/onboarding", "/en/onboarding"]));
  });

  it("is never reported by the traffic collector", () => {
    expect(trafficPageContext("/onboarding").tracked).toBe(false);
  });

  it("sends only whitelisted, non-identifying analytics properties", () => {
    const props = onboardingEventProperties({
      tier: "vip",
      plan: "annual",
      email: "member@example.com",
      checkoutId: "chk_1",
    } as Parameters<typeof onboardingEventProperties>[0]);
    expect(props).toEqual({ tier: "vip", plan: "annual" });
    expect(onboardingEventProperties({ tier: "gold" as never, plan: "weekly" as never })).toEqual({});
  });
});
