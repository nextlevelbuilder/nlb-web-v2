import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { ActivitiesBlockSchema, PulseBlockSchema, ProductDocumentSchema } from "@/packages/contracts/src";
import { ActivitiesBlockView } from "@/components/blocks/activities-block";
import { PulseBlockView } from "@/components/blocks/pulse-block";

describe("Activities and Pulse block contracts", () => {
  it("accepts owner-authored empty activities without inventing events", () => {
    const block = ActivitiesBlockSchema.parse({ id: "activity", type: "activities", props: { entries: [] } });
    expect(renderToStaticMarkup(React.createElement(ActivitiesBlockView, { block }))).toContain("No activities shared yet");
  });
  it("validates real calendar dates and safe update links", () => {
    const parse = (date: string, url?: string) => ActivitiesBlockSchema.safeParse({ id: "a", type: "activities", props: { entries: [{ title: "Released", date, url }] } });
    expect(parse("2024-02-29", "https://example.com/update").success).toBe(true);
    expect(parse("2025-02-29").success).toBe(false);
    expect(parse("2026-09-12", "javascript:alert(1)").success).toBe(false);
  });
  it("renders dates newest first without mutating the authored document", () => {
    const block = ActivitiesBlockSchema.parse({ id: "a", type: "activities", props: { entries: [
      { date: "2026-09-01", title: "First" }, { date: "2026-09-12", title: "Latest" },
    ] } });
    const html = renderToStaticMarkup(React.createElement(ActivitiesBlockView, { block }));
    expect(html.indexOf("Latest")).toBeLessThan(html.indexOf("First"));
    expect(block.props.entries[0].title).toBe("First");
  });
  it("rejects owner-provided monitoring results and arbitrary probe URLs", () => {
    for (const extra of [{ uptime: 100 }, { status: "up" }, { websiteUrl: "https://other.com" }]) {
      expect(PulseBlockSchema.safeParse({ id: "p", type: "pulse", props: { ...extra } }).success).toBe(false);
    }
    expect(PulseBlockSchema.parse({ id: "p", type: "pulse", props: {} }).props.showHistory).toBe(true);
  });
  it("shows unknown instead of fabricated preview metrics", () => {
    const block = PulseBlockSchema.parse({ id: "p", type: "pulse", props: {} });
    const html = renderToStaticMarkup(React.createElement(PulseBlockView, { block }));
    expect(html).toContain("Unknown");
    expect(html).toContain("after this product is published");
    expect(html).not.toContain("100%");
  });
  it("accepts both blocks in a version-one product document", () => {
    expect(ProductDocumentSchema.safeParse({ schemaVersion: 1, title: "Product", tagline: "Tagline", description: "Description for product", websiteUrl: "https://example.com", categorySlugs: ["ai-tools"], blocks: [
      { id: "a", type: "activities", props: { entries: [] } }, { id: "p", type: "pulse", props: {} },
    ] }).success).toBe(true);
  });
});
