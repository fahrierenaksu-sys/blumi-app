# Repository parity decisions (2026-09-30)

Audit item 10G ("in-memory vs PostgreSQL parity suite beyond the fixed
paths"). Code evidence only.

## Contract suite

`apps/server/src/db/repositoryContract.ts` runs one set of behavioural cases
against both implementations of a repository interface:

- In the default server test run, every case runs against the in-memory
  repository; the PostgreSQL copy of each case is skipped.
- Under the isolated PostgreSQL gate (`BLUMI_TEST_REQUIRE_POSTGRES=1`, fresh
  migrated database per file), both copies run and the gate requires zero
  skips.
- Cases may only use the repository interface. `backend.id(prefix)` gives
  case-scoped IDs; `backend.ensureUsers(...)` creates minimal account rows
  for tables with account foreign keys (a no-op in memory).

Suites: `economyRepository.contract.test.ts` (purchase, reward, commerce
credit/replay/reversal/conflicts), `chatRepository.contract.test.ts` (thread
and message idempotency, preview ordering, message and thread pagination),
`safetyRepository.contract.test.ts` (block and report idempotency,
replay/conflict, resolution).

## Differences found and decisions

Each row was reproduced by running the new contract cases against the
pre-change code (in memory and in the PostgreSQL gate) before the fix.

| # | Area | In-memory (before) | PostgreSQL (before) | Decision | Fixed in |
|---|------|--------------------|---------------------|----------|----------|
| 1 | Commerce event replayed with a different payload hash | Threw a generic `Error` (HTTP 500, provider retries forever) | Silently ignored (`applied: false`, no conflict) | **Reject, never silently accept.** Both return `conflict: "event"` without touching balances, ledgers, events or transaction bindings. `CommerceService` maps it to `CommerceVerificationError` (409) for signed webhook events. Reconcile lookups are marked `providerPayloadKind: "snapshot"` because the RevenueCat purchase body can drift between lookups; for those, a drifted replay stays an already-processed no-op, as it was in production. | Both |
| 2 | Event ID reused for an unseen transaction with a different payload | Bound the new transaction before throwing | Bound the new transaction | The rejected replay records nothing (no transaction binding). | Both |
| 3 | Coin transaction for a user without an inventory | Threw before recording anything | Recorded transaction, event and ledger rows, then threw: a later retry was a no-op, so the credit was lost | Record nothing and throw; the retry after the inventory exists credits once. | PostgreSQL |
| 4 | Reward claim for a user without an inventory | Threw before recording the key | Consumed the idempotency key, then threw: the reward was lost | Record nothing and throw. | PostgreSQL |
| 5 | Purchase with a negative price | Accepted (credited coins) | Rejected (`$3 >= 0`) | Reject. | In-memory |
| 6 | Coin transaction with a non-positive amount | `applied: true` with no change | Ledger recorded, `applied: false` | `applied: false`. Unreachable today (coin packs are positive); kept for parity. | In-memory |
| 7 | `saveThread` on an existing thread | No-op | Upserted participants (renamed; a different participant set failed on `participant_order` uniqueness after the thread insert) | Create-only in one statement: participants are written only when this call inserted the thread. | PostgreSQL |
| 8 | `listMessages` without a page | Ordered by `sentAt`, then `messageId` | Ordered by `sent_at` only (ties unordered) | Order by `sentAt`, then `messageId`, like the paged queries. | PostgreSQL |
| 9 | `saveBlock` for an existing block | Overwrote `createdAt` | `ON CONFLICT DO NOTHING` | First block wins. | In-memory |
| 10 | `saveReport` with an existing report ID | Overwrote the report | Primary-key violation | Reject; reports are never overwritten. | In-memory |

No difference was found for: purchase debit/ownership/debt rules, reward
idempotency, credit/reversal debt arithmetic, transaction account/pack/store
binding, chat message idempotency and `idempotencyConflict`, preview
ordering, message and thread cursors, unread counts, report replay/conflict,
replay block restoration, and report resolution.

## Remaining known differences (not changed)

- Reward ledger rows require `coins > 0` in PostgreSQL; the in-memory store
  accepts any amount. Callers pass positive catalogue amounts.
- Report listing and pending summaries are global queries, so they are not
  in the contract suite (cases share one database per gate file).

## Deploy note

No migration. Behaviour changes that reach production: a signed RevenueCat
webhook whose event ID was already recorded with a different body now gets
409 instead of 200; reconcile behaviour is unchanged; credits and rewards
for a user without an inventory no longer burn their idempotency keys.
