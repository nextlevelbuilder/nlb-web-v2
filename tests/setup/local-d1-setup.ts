import { afterAll, beforeAll } from "vitest";
import { createLocalD1, type LocalD1 } from "../helpers/local-d1";

// Every test file gets a fresh in-memory D1 as the default `getDb()` target, so route handlers that
// resolve the database implicitly run against real SQLite semantics instead of a Postgres-shaped mock.
let local: LocalD1 | undefined;

beforeAll(async () => {
  local = await createLocalD1();
  (globalThis as { __NLB_TEST_DB__?: unknown }).__NLB_TEST_DB__ = local.db;
});

afterAll(async () => {
  (globalThis as { __NLB_TEST_DB__?: unknown }).__NLB_TEST_DB__ = undefined;
  await local?.dispose();
});
