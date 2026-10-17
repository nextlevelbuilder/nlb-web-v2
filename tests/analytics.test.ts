import { describe, it, expect } from "vitest";
import { votes } from "@/lib/db/schema";
import { getTableConfig } from "drizzle-orm/sqlite-core";

describe("Analytics & Voting Anti-Abuse Constraint", () => {
  it("should have compound unique constraint on votes (productId, userId, voteDate)", () => {
    const tableConfig = getTableConfig(votes);
    const uniqueConstraints = tableConfig.uniqueConstraints;

    expect(uniqueConstraints.length).toBeGreaterThan(0);
    const voteUnique = uniqueConstraints.find((c) => c.name === "votes_product_user_date_unique");
    expect(voteUnique).toBeDefined();

    const columnNames = voteUnique?.columns.map((c) => c.name);
    expect(columnNames).toContain("product_id");
    expect(columnNames).toContain("user_id");
    expect(columnNames).toContain("vote_date");
  });
});
