import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { projectProductTrust } from "@/lib/domain/trust";

// A hook harness exercises the component's real handlers without a browser or Turnstile script.
const hooks = vi.hoisted(() => ({ state: [] as unknown[], cursor: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const useState = (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.state)) hooks.state[index] = initial;
    return [hooks.state[index], (update: unknown) => {
      hooks.state[index] = typeof update === "function" ? update(hooks.state[index]) : update;
    }];
  };
  const useMemo = (factory: () => unknown) => factory();
  const useEffect = () => undefined;
  return { ...actual, useState, useMemo, useEffect, default: { ...actual, useState, useMemo, useEffect } };
});
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import BuildWithUsClient from "@/app/[locale]/build-with-us/build-with-us-client";

const now = Date.parse("2026-09-12T00:00:00Z");
function render(votes = 5) {
  hooks.cursor = 0;
  return BuildWithUsClient({
    totalPublishedCount: 1,
    initialProducts: [projectProductTrust({
      id: "example", slug: "example", title: "Example", tagline: "A product",
      status: "published", websiteUrl: "https://example.com", isFeatured: false,
      createdAt: new Date(now - 14 * 86_400_000), trustScore: votes,
    }, now)],
  });
}

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as ReactNode)];
}

function trustValue(tree: ReactNode) {
  return elements(tree).find((element) => element.type === "strong" && element.props.className === "text-foreground ml-1")?.props.children;
}

async function vote(tree: ReactNode) {
  const button = elements(tree).find((element) => element.type === "button" && "disabled" in element.props);
  expect(button).toBeDefined();
  await (button!.props.onClick as () => Promise<void>)();
}

beforeEach(() => {
  hooks.state = [];
  hooks.cursor = 0;
  vi.useFakeTimers().setSystemTime(now);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Build with Us trust after voting", () => {
  it("shows the shared score and adds vote points only after a successful response", async () => {
    const fetchVote = vi.fn().mockResolvedValueOnce({ ok: true, status: 201 }).mockResolvedValueOnce({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchVote);
    const initial = render();
    expect(trustValue(initial)).toBe(74);
    await vote(initial);
    expect(trustValue(render())).toBe(76);
    await vote(render());
    expect(trustValue(render())).toBe(76);
    expect(fetchVote).toHaveBeenCalledWith("/api/v1/votes", expect.objectContaining({ method: "POST" }));
  });

  it("does not inflate trust when the vote contribution is already capped", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 201 }));
    const initial = render(100);
    expect(trustValue(initial)).toBe(84);
    await vote(initial);
    expect(trustValue(render(100))).toBe(84);
  });
});
