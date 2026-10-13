# Data migration: Neon → D1

The old site's Postgres database (Neon) is copied one way into D1. The commands, flags, outputs and conversion rules are owned by [`scripts/migrate/README.md`](../scripts/migrate/README.md) and [`scripts/migrate/run-migration.ts`](../scripts/migrate/run-migration.ts). This page covers why the copy works the way it does, and the risks you must manage.

## Design

| Property | Why |
|---|---|
| Neon is only read (read-only sessions, one `REPEATABLE READ READ ONLY` snapshot) | Deleting or altering anything on Neon is a non-goal. Neon remains the rollback source. |
| The snapshot is converted by the D1 schema ([`scripts/migrate/lib/table-catalog.ts`](../scripts/migrate/lib/table-catalog.ts), driven by [`lib/db/schema.ts`](../lib/db/schema.ts)) | An unknown source table or column aborts the run, so nothing is dropped silently |
| Import into a live target uses `--final-sync`: an upsert by primary key that never deletes | Every snapshot row converges to the snapshot on each rerun, and rows written only on v2 survive. Full replace (`--replace --i-understand`) deletes the migrated tables first and is only for an empty or disposable target. |
| A D1 export is taken before every write, import or re-key (`scripts/migrate/dump/backups/`); the run aborts if it fails | It is the restore point for that environment, alongside D1 time travel |
| Verify compares, per table, the row count, a hash of the sorted primary keys and a hash of type-normalised full rows | Detects missing rows and value-level corruption. With `--final-sync`, D1-only rows are reported as information, not failure. `jwks_keys` differs after `rekey-jwks`, by design. |
| Production needs `--confirm-production` | Prevents accidents |
| `rekey-jwks` clears `jwks_keys` | Its private keys were encrypted with the old, lost `BETTER_AUTH_SECRET`, so they are useless. New keys are created under the new secret. Existing sessions and OAuth tokens stop working, and users sign in again. |

The contract assumed 36 tables. The real Neon schema has 43, and all 43 are migrated. Tables that exist only in v2 (blog, courses, idempotency) are never deleted or written by the import, in either mode.

## Data handling

- `scripts/migrate/dump/` holds user data (the pg_dump, NDJSON rows, `import.sql`, backups and verify reports). It is gitignored. Never commit it or copy it off the machine, and delete it once cutover is stable.
- The Neon connection string comes from `NEON_DATABASE_URL` or `scripts/migrate/dump/.neon-uri` (chmod 600). It never belongs in a document.
- D1 access uses the wrangler OAuth login pinned to the hi@ account, because the repo `.env` token has no D1 permission. See the migrate README for CI use.

## Risks before the final sync

1. **Snapshot rows overwrite v2 edits to the same row.** `--final-sync` keeps rows created only on v2, but a row that exists in both is set back to the Neon values, and a row deleted in Neon after an earlier import stays in D1. A v2-only row can also collide with a snapshot row on a unique column other than the key (for example the same email), which fails the import.
   **Mitigation**: keep the order in [cutover-runbook.md](./cutover-runbook.md). Freeze writes on the old site, run the final sync, and only then switch the Polar webhook. Avoid real user activity on v2 production before cutover, and read `extraTargetRows` in the verify report.
2. **Verify cannot judge business meaning.** Spot-check commerce and auth rows (`orders`, `subscriptions`, `customers`, `users`, `api_keys`) after the final sync. An existing API key must still authenticate against `/api/v1`.
3. **Old R2 objects and KV** were not copied. The old KV was empty. Copying the old `cdn.` objects needs read access to the Digitop bucket (see the runbook).

## Local data

To work with realistic data locally, run `import --target local --final-sync` (or `--replace --i-understand` on a fresh local database) after a dump and convert. The dump stays on your machine under the gitignored folder.
