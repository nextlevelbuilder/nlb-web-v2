import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps a text colour next to a custom font size", () => {
    expect(cn("bg-cta text-cta-foreground", "text-step-base")).toBe("bg-cta text-cta-foreground text-step-base");
  });

  it("still lets a later custom font size replace an earlier one", () => {
    expect(cn("text-step-sm text-ink-2", "text-step-lg")).toBe("text-ink-2 text-step-lg");
  });

  it("still lets a later colour replace an earlier colour", () => {
    expect(cn("text-ink-2", "text-ink-3")).toBe("text-ink-3");
  });
});
