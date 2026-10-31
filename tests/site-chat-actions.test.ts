import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSiteChatActions } from "@/components/chat/site-chat-actions";
import { OPEN_CHECKOUT_EVENT } from "@/components/checkout/use-checkout-deep-link";

const ctx = { callId: "c1", conversationId: "v1", agent: "sales", signal: new AbortController().signal };

function actions(locale = "vi") {
  const push = vi.fn();
  const byName = Object.fromEntries(buildSiteChatActions({ locale, push }).map((action) => [action.name, action]));
  return { push, byName };
}

/** The handlers only read the path, dispatch events and look up #pricing; a bare EventTarget covers that. */
function stubWindow(pathname: string) {
  const win = Object.assign(new EventTarget(), { location: { pathname } });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { getElementById: () => null });
  return win;
}

beforeEach(() => {
  stubWindow("/");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("site chat page actions", () => {
  it("asks the visitor before saving a lead", () => {
    const { byName } = actions();
    expect(byName["lead.save"].sensitivity).toBe("mutate");
    expect(byName["site.catalog"].sensitivity).toBe("read");
  });

  it("opens only allowlisted same-site pages with a valid slug", async () => {
    const { byName, push } = actions();
    await byName["site.navigate"].handler({ page: "course", slug: "intro-to-agents" }, ctx);
    expect(push).toHaveBeenCalledWith("/vi/courses/intro-to-agents");
    await byName["site.navigate"].handler({ page: "pricing" }, ctx);
    expect(push).toHaveBeenLastCalledWith("/vi#pricing");
    expect(() => byName["site.navigate"].handler({ page: "course", slug: "../admin" }, ctx)).toThrow();
    expect(() => byName["site.navigate"].handler({ page: "https://evil.example" }, ctx)).toThrow();
  });

  it("links to the home checkout dialog from other pages", async () => {
    stubWindow("/vi/courses");
    const { byName, push } = actions();
    await byName["checkout.membership"].handler({ plan: "vip", billing: "annual" }, ctx);
    expect(push).toHaveBeenCalledWith("/vi?checkout=vip&billing=annual#pricing");
    expect(() => byName["checkout.membership"].handler({ plan: "gold", billing: "annual" }, ctx)).toThrow();
  });

  it("opens the dialog in place on the home page", async () => {
    const win = stubWindow("/vi");
    const { byName, push } = actions();
    const listener = vi.fn();
    win.addEventListener(OPEN_CHECKOUT_EVENT, listener);
    await byName["checkout.membership"].handler({ plan: "premium", billing: "quarterly" }, ctx);
    expect(push).not.toHaveBeenCalled();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ plan: "premium", billing: "quarterly" });
  });

  it("posts the lead with consent, locale and page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, id: "l1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { byName } = actions("en");
    const result = await byName["lead.save"].handler({ name: "Lan", email: "lan@example.com", need: "MVP" }, ctx);
    expect(result).toEqual({ saved: true, id: "l1" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ consent: true, locale: "en", pagePath: "/", wantsHuman: false });
  });
});
