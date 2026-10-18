import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { onboardingProfiles } from "@/lib/db/schema";
import { getOnboardingStatus } from "@/lib/onboarding/status";
import { createMember, createTestUser, sessionFor, type TestUser } from "./helpers/onboarding-fixtures";

const getSessionMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getSession: (...args: unknown[]) => getSessionMock(...args) } }),
}));

async function postProfile(body: unknown) {
  const { POST } = await import("@/app/api/onboarding/profile/route");
  return POST(
    new Request("https://nextlevelbuilder.io/api/onboarding/profile", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

const complete = {
  goal: "Ship my first AI product",
  profileLinks: ["https://github.com/member"],
  skills: "TypeScript",
  phone: "+84 912 345 678",
  commitmentAccepted: true,
  submit: true,
};

let user: TestUser;

beforeEach(async () => {
  vi.stubEnv("ONBOARDING_V2_ENABLED", "true");
  getSessionMock.mockReset();
  user = await createTestUser();
  await createMember(user);
  getSessionMock.mockResolvedValue(sessionFor(user));
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/onboarding/profile access", () => {
  it("requires a session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await postProfile(complete)).status).toBe(401);
  });

  it("requires an effective membership", async () => {
    const visitor = await createTestUser();
    getSessionMock.mockResolvedValue(sessionFor(visitor));
    const response = await postProfile(complete);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "membership_required" });
  });

  it("rejects malformed JSON", async () => {
    expect((await postProfile("{not json")).status).toBe(400);
  });
});

describe("profile validation", () => {
  it.each([
    ["missing goal on submit", { ...complete, goal: "" }, "goal"],
    ["goal over 500 characters", { ...complete, goal: "x".repeat(501) }, "goal"],
    ["commitment not accepted", { ...complete, commitmentAccepted: false }, "commitmentAccepted"],
    ["more than 3 links", { ...complete, profileLinks: ["https://a.io", "https://b.io", "https://c.io", "https://d.io"] }, "profileLinks"],
    ["non-http link", { ...complete, profileLinks: ["javascript:alert(1)"] }, "profileLinks"],
    ["skills over 200 characters", { ...complete, skills: "x".repeat(201) }, "skills"],
    ["phone with letters", { ...complete, phone: "call me" }, "phone"],
  ])("rejects %s", async (_label, body, field) => {
    const response = await postProfile(body);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("invalid_profile");
    expect(json.fields).toContain(field);
  });

  it("drops blank links and accepts an empty phone", async () => {
    const response = await postProfile({ ...complete, profileLinks: ["  ", "https://x.dev "], phone: "" });
    expect(response.status).toBe(200);
    expect((await response.json()).profile).toMatchObject({ profileLinks: ["https://x.dev"], phone: "" });
  });
});

describe("partial save and resume", () => {
  it("saves progress without completing, resumes through status, then completes once", async () => {
    const partial = await postProfile({ goal: "Learn agents", skills: "Python" });
    expect(partial.status).toBe(200);
    expect((await partial.json()).profile).toMatchObject({ goal: "Learn agents", completed: false, commitmentAccepted: false });

    const resumed = await getOnboardingStatus(getDb(), user);
    expect(resumed.profile).toMatchObject({ goal: "Learn agents", skills: "Python", completed: false });

    const done = await postProfile({ ...complete, goal: "Learn agents" });
    expect((await done.json()).profile).toMatchObject({ completed: true, commitmentAccepted: true });
    const [first] = await getDb().select().from(onboardingProfiles).where(eq(onboardingProfiles.userId, user.id));

    // Editing later keeps the original completion time.
    await postProfile({ ...complete, skills: "Rust" });
    const [edited] = await getDb().select().from(onboardingProfiles).where(eq(onboardingProfiles.userId, user.id));
    expect(edited.skills).toBe("Rust");
    expect(edited.completedAt?.getTime()).toBe(first.completedAt?.getTime());
  });
});
