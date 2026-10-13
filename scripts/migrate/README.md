# Neon → Cloudflare D1 migration

One-way copy of the old Postgres (Neon) database into D1. Neon is only ever read:
every psql/pg_dump session runs with `default_transaction_read_only=on`, and the snapshot
is taken inside a single `REPEATABLE READ READ ONLY` transaction.

## Pipeline

| Step | Command | Output (all under `scripts/migrate/dump/`, gitignored) |
|---|---|---|
| dump | `npx tsx scripts/migrate/run-migration.ts dump` | `neon-<ts>.sql` (pg_dump backup), `rows/<table>.ndjson`, `manifest.json` |
| convert | `... convert` | `import.sql`: deletes every migrated table, then inserts parents first |
| import | `... import --target local\|staging\|production` | `backups/d1-<target>-<ts>.sql` (D1 export taken **before** the write), then executes `import.sql` |
| verify | `... verify --target ...` | `verify-<target>-<ts>.json`: row count + SHA-256 of sorted primary keys per table |
| re-key | `... rekey-jwks --target ...` | clears `jwks_keys` (its private key is encrypted with the lost auth secret) |
| all | `... all --target ... [--skip-dump]` | dump → convert → import → verify |

Production additionally needs `--confirm-production`.

Conversion is driven by `lib/db/schema.ts` (see `lib/table-catalog.ts`). These are the rules:
- uuid becomes text.
- timestamp becomes epoch ms; values without a zone are treated as UTC, and microseconds are truncated.
- bool becomes 0/1.
- jsonb and arrays become JSON text.
- A source table or column with no D1 counterpart aborts the run, so nothing is dropped silently.

Tables that exist only in v2 (blog, courses, idempotency) are never deleted or written.

## Connection and auth

- Neon: `NEON_DATABASE_URL`, or `scripts/migrate/dump/.neon-uri` (chmod 600).
- D1: wrangler OAuth login pinned to account `7ac87c90789159ae1b10b7d78f5dcc08`. The `.env` API token has no D1 permission, so the script drops it. In CI, set `MIGRATE_KEEP_API_TOKEN=1` together with a token that has D1 edit permission.

## Runbook

```bash
npx tsx scripts/migrate/run-migration.ts all --target local            # dry run
npx tsx scripts/migrate/run-migration.ts all --target staging --skip-dump
npx tsx scripts/migrate/run-migration.ts rekey-jwks --target staging
npx tsx scripts/migrate/run-migration.ts import --target production --confirm-production
npx tsx scripts/migrate/run-migration.ts verify --target production --confirm-production
npx tsx scripts/migrate/run-migration.ts rekey-jwks --target production --confirm-production
```

Every step is rerunnable, because import always converges to the snapshot. For the final cutover sync:
1. Stop writes on the old site.
2. Run `dump` again.
3. Import to production, verify, then re-key.

Rollback: run `wrangler d1 execute DB --remote --file scripts/migrate/dump/backups/<file>.sql` on an empty database, or with `d1 time-travel restore`.
