import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completeNavigation,
  isNavigationPending,
  isSameDocumentTarget,
  startNavigation,
  subscribeNavigation,
} from "./navigation-progress-store";
import { nextTrickleProgress, TRICKLE_CEILING } from "./navigation-progress-trickle";

const here = "https://nlb.test/vi/blog?tag=ai#top";

describe("navigation progress store", () => {
  afterEach(() => completeNavigation());

  it("treats hash-only and identical targets as the same document", () => {
    expect(isSameDocumentTarget("https://nlb.test/vi/blog?tag=ai#faq", here)).toBe(true);
    expect(isSameDocumentTarget("#faq", here)).toBe(true);
    expect(isSameDocumentTarget("/vi/blog?tag=ai", here)).toBe(true);
  });

  it("treats a new path, search or origin as a real navigation", () => {
    expect(isSameDocumentTarget("/vi/courses", here)).toBe(false);
    expect(isSameDocumentTarget("/vi/blog?tag=saas", here)).toBe(false);
    expect(isSameDocumentTarget("/blog?tag=ai", here)).toBe(false);
    expect(isSameDocumentTarget("https://other.test/vi/blog?tag=ai", here)).toBe(false);
  });

  it("starts on a route change and completes once, notifying subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNavigation(listener);
    startNavigation("/vi/courses", here);
    startNavigation("/vi/leaderboards", here);
    expect(isNavigationPending()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    completeNavigation();
    completeNavigation();
    expect(isNavigationPending()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    startNavigation("/vi/courses", here);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores same-document navigations", () => {
    startNavigation("#faq", here);
    expect(isNavigationPending()).toBe(false);
  });
});

describe("nextTrickleProgress", () => {
  it("takes a visible first step", () => {
    expect(nextTrickleProgress(0)).toBeGreaterThan(0.1);
    expect(nextTrickleProgress(Number.NaN)).toBe(nextTrickleProgress(0));
  });

  it("keeps growing but never reaches the ceiling or the end on its own", () => {
    let value = 0;
    for (let step = 0; step < 500; step++) {
      const next = nextTrickleProgress(value);
      expect(next).toBeGreaterThanOrEqual(value);
      value = next;
    }
    expect(value).toBeLessThanOrEqual(TRICKLE_CEILING);
    expect(value).toBeLessThan(1);
    expect(nextTrickleProgress(1)).toBe(TRICKLE_CEILING);
  });
});
