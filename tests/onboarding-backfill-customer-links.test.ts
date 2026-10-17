import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { customers, users } from "@/lib/db/schema";
import { createLocalD1, type LocalD1 } from "./helpers/local-d1";
import {
  LINK_CANDIDATES_SQL,
  LINK_SUMMARY_SQL,
  linkStatements,
  type LinkCandidate,
} from "../scripts/onboarding/backfill-customer-links-sql";

let local: LocalD1;

beforeEach(async () => {
  local = await createLocalD1();
});

afterEach(async () => {
  await local.dispose();
});

async function addUser(id: string, email: string, verified = true) {
  await local.db.insert(users).values({ id, name: id, email, emailVerified: verified });
}

async function addCustomer(id: string, email: string, userId: string | null = null) {
  await local.db.insert(customers).values({ id, email, name: "Buyer", userId });
}

async function candidates() {
  return (await local.d1.prepare(LINK_CANDIDATES_SQL).all<LinkCandidate>()).results;
}

describe("backfill customer links", () => {
  it("links only unambiguous verified email matches", async () => {
    await addUser("u_ok", "Member@Example.com");
    await addCustomer("c_ok", "  member@example.com ");
    await addUser("u_unverified", "unverified@example.com", false);
    await addCustomer("c_unverified", "unverified@example.com");
    await addUser("u_owner", "owner@example.com");
    await addCustomer("c_owned", "other@example.com", "u_owner");
    await addCustomer("c_owner_dupe", "owner@example.com");
    await addCustomer("c_none", "nobody@example.com");

    // A user who already owns a customer still gets the other customers matching their email.
    expect(await candidates()).toEqual([
      { customer_id: "c_ok", user_id: "u_ok" },
      { customer_id: "c_owner_dupe", user_id: "u_owner" },
    ]);

    const summary = await local.d1.prepare(LINK_SUMMARY_SQL).first<Record<string, number>>();
    expect(summary).toEqual({ customers: 5, already_linked: 1, no_verified_user: 2 });
  });

  it("links every customer row of a user matched by two of them", async () => {
    await addUser("u_a", "dupe@example.com");
    await addCustomer("c_1", "dupe@example.com");
    await addCustomer("c_2", " DUPE@example.com");
    expect(await candidates()).toEqual([
      { customer_id: "c_1", user_id: "u_a" },
      { customer_id: "c_2", user_id: "u_a" },
    ]);
  });

  it("skips a customer matched by two verified users", async () => {
    await addUser("u_1", "Shared@example.com");
    await addUser("u_2", "shared@example.com");
    await addCustomer("c_shared", "shared@example.com");
    expect(await candidates()).toEqual([]);
  });

  it("applies guarded updates that never overwrite or double-link", async () => {
    await addUser("u_ok", "member@example.com");
    await addCustomer("c_ok", "member@example.com");
    const found = await candidates();

    for (const statement of [...linkStatements(found, 1), ...linkStatements(found, 2)]) {
      await local.d1.prepare(statement).run();
    }

    const rows = await local.d1.prepare("SELECT id, user_id, updated_at FROM customers").all();
    expect(rows.results).toEqual([{ id: "c_ok", user_id: "u_ok", updated_at: 1 }]);
    expect(await candidates()).toEqual([]);
  });

  it("rejects ids that are not plain identifiers", () => {
    expect(() => linkStatements([{ customer_id: "x'; DROP TABLE users;--", user_id: "u" }], 1)).toThrow();
  });
});
