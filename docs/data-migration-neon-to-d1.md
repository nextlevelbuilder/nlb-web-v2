# Data migration: Neon → D1

The old site's Postgres database (Neon) is copied one way into D1. The commands, flags, outputs and conversion rules are owned by [`scripts/migrate/README.md`](../scripts/migrate/README.md) and [`scripts/migrate/run-migration.ts`](../scripts/migrate/run-migration.ts). This page covers why the copy works the way it does, and the risks you must manage.

## Design

| Property | Why |
|---|---|
| Neon is only read (read-only sessions, one `REPEATABLE READ READ ONLY` snapshot) | Deleting or altering anything on Neon is a non-goal. Neon remains the rollback source. |
| The snapshot is converted by the D1 schema ([`scripts/migrate/lib/table-catalog.ts`](../scripts/migrate/lib/table-catalog.ts), driven by [`lib/db/schema.ts`](../lib/db/schema.ts)) | An unknown source table or column aborts the run, so nothing is dropped silently |
| Import replaces every migrated table with the snapshot | Every step can be rerun and converges to the snapshot. It is used at least twice: once as a rehearsal and once as the final sync. |
| A D1 export is taken before every import (`scripts/migrate/dump/backups/`) | It is the restore point for that environment, alongside D1 time travel |
| Verify compares the row count and a hash of the sorted primary keys per table | This is the contract's acceptance check. It does not detect value-level corruption. |
| Production needs `--confirm-production` | Prevents accidents |
| `rekey-jwks` clears `jwks_keys` | Its private keys were encrypted with the old, lost `BETTER_AUTH_SECRET`, so they are useless. New keys are created under the new secret. Existing sessions and OAuth tokens stop working, and users sign in again. |

The contract assumed 36 tables. The real Neon schema has 43, and all 43 are migrated. Tables that exist only in v2 (blog, courses, idempotency) are never deleted or written by the import.

## Data handling

- `scripts/migrate/dump/` holds user data (the pg_dump, NDJSON rows, `import.sql`, backups and verify reports). It is gitignored. Never commit it or copy it off the machine, and delete it once cutover is stable.
- The Neon connection string comes from `NEON_DATABASE_URL` or `scripts/migrate/dump/.neon-uri` (chmod 600). It never belongs in a document.
- D1 access uses the wrangler OAuth login pinned to the hi@ account, because the repo `.env` token has no D1 permission. See the migrate README for CI use.

## Risks before the final sync

1. **The final sync wipes v2-only writes to migrated tables.** Import deletes every migrated table before it re-inserts. Rows created on v2 production before the final sync are lost: sign-ins on workers.dev, orders or entitlements written by an early Polar webhook switch, `webhook_events`. v2-only rows that reference those users can be orphaned (for example `blog_posts.author_id`, course entitlements).
   **Mitigation**: keep the order in [cutover-runbook.md](./cutover-runbook.md). Freeze writes on the old site, run the final sync, and only then switch the Polar webhook. Avoid real user activity on v2 production before cutover.
2. **Verify does not compare values.** Spot-check commerce and auth rows (`orders`, `subscriptions`, `customers`, `users`, `api_keys`) after the final sync. An existing API key must still authenticate against `/api/v1`.
3. **Old R2 objects and KV** were not copied. The old KV was empty. Copying the old `cdn.` objects needs read access to the Digitop bucket (see the runbook).

## Local data

To work with realistic data locally, run `import --target local` after a dump. The dump stays on your machine under the gitignored folder.
