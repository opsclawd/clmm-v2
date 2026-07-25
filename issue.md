# drizzle migration snapshots since 0002 silently dropped 12 of 14 tables from tracking

## Summary

`packages/adapters/drizzle/meta/0002_snapshot.json` and `0003_snapshot.json` only track 2 of the repository's 14 tables (`position_plans`, `plan_result_outbox`). `0001_snapshot.json` (one migration earlier) correctly tracks all 14 (`breach_episodes`, `exit_triggers`, `execution_previews`, `execution_attempts`, `execution_sessions`, `prepared_payloads`, `history_events`, `monitored_wallets`, `notification_dedup`, `wallet_position_ownership`, `notification_events`, `wallet_challenges`, plus the 2 above). Something that generated migration `0002_position_plan_lifecycle` ran `drizzle-kit generate` against a narrowed schema (likely `schema: './src/outbound/storage/schema/position-plans.ts'` instead of the full `schema/index.ts` barrel that `drizzle.config.ts` actually declares) and silently dropped the other 12 tables from drizzle's own bookkeeping.

The 12 tables still exist in the real database (created by migration `0000_bitter_riptide`) — only drizzle-kit's _snapshot tracking_ is wrong, not the actual schema.

## Why this matters

Any `pnpm db:generate` run against the current (uncorrected) snapshot chain would diff the full `schema/index.ts` (which legitimately includes all 14 tables) against a baseline that only knows about 2 — concluding the other 12 don't exist yet, and emitting a migration that tries to `CREATE TABLE` things that are already there. Applying such a migration would fail outright (duplicate table/constraint errors) or worse.

## How this was found and worked around

Discovered while manually completing issue #62's Task 7, which needed a genuinely new migration (`0004_execution_origin`, adding `origin_kind`/`plan_id`/`canonical_hash`/`canonical_exit_intent` columns to `execution_previews`/`execution_attempts`/`history_events`, plus two new columns on `position_plans`). Rather than hand-author that migration's SQL, repaired `0003_snapshot.json` by merging in the 12 correctly-tracked table definitions from `0001_snapshot.json` (confirmed via `grep` that migrations `0002`/`0003` never reference any of those 12 table names, so they're genuinely unchanged since `0001`) before running `drizzle-kit generate` — which then correctly produced only the intended diff. Verified by re-running `generate` afterward and confirming "No schema changes, nothing to migrate".

This fixes forward tracking from `0003`/`0004` onward, but doesn't retroactively investigate whether `0002`'s snapshot corruption caused any other problem in between (e.g., if anyone ran `db:generate` between migrations 0002 and this fix and got a bad migration file that wasn't caught before merging — worth a quick `git log` scan of `drizzle/*.sql` for anything suspicious in that window).

## Proposed fix / prevention

- Confirm `drizzle.config.ts`'s `schema` path (`./src/outbound/storage/schema/index.ts`) is what actually gets used whenever `db:generate` runs — a narrowed/wrong schema path passed as a CLI override would reproduce this exact corruption again.
- Consider a CI check (or a step in whatever generates migrations) that asserts the latest snapshot's tracked table count matches `schema/index.ts`'s actual exported table count, so a future narrowing is caught immediately rather than silently, the way this one was.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
