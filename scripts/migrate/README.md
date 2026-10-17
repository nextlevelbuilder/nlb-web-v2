# Neon → Cloudflare D1 migration

One-way copy of the old Postgres (Neon) database into D1. Neon is only ever read:
every psql/pg_dump session runs with `default_transaction_read_only=on`, and the snapshot
is taken inside a single `REPEATABLE READ READ ONLY` transaction.

## Pipeline

| Step | Command | Output (all under `scripts/migrate/dump/`, gitignored) |
|---|---|---|
| dump | `npx tsx scripts/migrate/run-migration.ts dump` | `neon-<ts>.sql` (pg_dump backup), `rows/<table>.ndjson`, `manifest.json` |
| convert | `... convert` | `import-final-sync.sql` (upsert by primary key, no DELETE) and `import.sql` (delete migrated tables, then insert) |
| import | `... import --target local\|staging\|production --final-sync` | `backups/d1-<target>-<ts>.sql` (D1 export taken **before** any write; the run aborts if it fails), then executes the script for the chosen mode |
| verify | `... verify --target ... [--final-sync]` | `verify-<target>-<ts>.json`: per table, row count, SHA-256 of sorted primary keys, and SHA-256 of type-normalised full rows |
| re-key | `... rekey-jwks --target ...` | backs up D1, then clears `jwks_keys` (its private key is encrypted with the lost auth secret) |
| all | `... all --target ... --final-sync [--skip-dump]` | dump → convert → import → verify |

`import` and `all` refuse to run without a mode:

- `--final-sync` upserts every snapshot row (`INSERT ... ON CONFLICT (pk) DO UPDATE SET <every non-key column> = excluded.<column>`), parents first. It never deletes, so rows created on v2 before the sync (sign-ins, sessions, webhook events, early orders) survive. Use it for every import into a live target, including the final cutover.
- `--replace --i-understand` deletes every migrated table, then inserts the snapshot. It wipes D1-only rows. Use it only on an empty or disposable target, such as a fresh local database.

Production also needs `--confirm-production`, in every mode. Each script starts with a `-- nlb-migrate mode=... snapshot=...` line, and import refuses a script whose mode or snapshot does not match `manifest.json`, so re-run `convert` after every `dump`.

Verify normalises both sides before hashing: timestamps become epoch ms, booleans 0/1, JSON is canonicalised (sorted keys, no whitespace), and numbers are folded (`-0` → `0`). Snapshot rows first go through the same conversion rules as the import. Mismatches are listed in the report under `rowCountMismatchTables`, `identityMismatchTables` and `valueMismatchTables`, with up to five offending keys per table in `mismatchedIds`. Without a flag, D1 must equal the snapshot exactly. With `--final-sync`, only D1 rows whose primary key is in the snapshot are compared, and D1-only rows are reported under `extraTargetRows` as information, not failure.

Conversion is driven by `lib/db/schema.ts` (see `lib/table-catalog.ts`). These are the rules:
- uuid becomes text.
- timestamp becomes epoch ms; values without a zone are treated as UTC, and microseconds are truncated.
- bool becomes 0/1.
- jsonb and arrays become JSON text.
- A source table or column with no D1 counterpart aborts the run, so nothing is dropped silently.

Tables that exist only in v2 (blog, courses, idempotency, and any table not in the snapshot) are never deleted or written, in either mode.

## Connection and auth

- Neon: `NEON_DATABASE_URL`, or `scripts/migrate/dump/.neon-uri` (chmod 600).
- D1: wrangler OAuth login pinned to account `7ac87c90789159ae1b10b7d78f5dcc08`. The `.env` API token has no D1 permission, so the script drops it. In CI, set `MIGRATE_KEEP_API_TOKEN=1` together with a token that has D1 edit permission.

## Runbook

```bash
npx tsx scripts/migrate/run-migration.ts all --target local --final-sync                 # dry run
npx tsx scripts/migrate/run-migration.ts all --target staging --final-sync --skip-dump
npx tsx scripts/migrate/run-migration.ts rekey-jwks --target staging
npx tsx scripts/migrate/run-migration.ts import --target production --final-sync --confirm-production
npx tsx scripts/migrate/run-migration.ts verify --target production --final-sync --confirm-production
npx tsx scripts/migrate/run-migration.ts rekey-jwks --target production --confirm-production
```

Full replace, only for an empty or disposable target:

```bash
npx tsx scripts/migrate/run-migration.ts import --target local --replace --i-understand
npx tsx scripts/migrate/run-migration.ts verify --target local
```

Every step is rerunnable. Final-sync converges every snapshot row to the snapshot and leaves D1-only rows alone. For the final cutover sync:
1. Stop writes on the old site.
2. Run `dump`, then `convert`.
3. Run `import --final-sync` to production. This backs up D1 first.
4. Run `verify --final-sync`. Read `extraTargetRows` in the report: these rows were created on v2 and are kept.
5. Re-key.
6. Switch the Polar webhook only after the verify passes.

Final-sync limits:
- A row deleted in Neon after an earlier import stays in D1, because final-sync never deletes. Verify reports it as an extra row.
- A D1-only row that collides with a snapshot row on a unique column other than the primary key (for example the same `users.email` under a different `id`) makes the import fail. Resolve that row by hand, then re-run.
- `jwks_keys` fails verify after a re-key, because the re-key clears it on purpose.

Rollback: run `wrangler d1 execute DB --remote --file scripts/migrate/dump/backups/<file>.sql` on an empty database, or use `d1 time-travel restore`.
