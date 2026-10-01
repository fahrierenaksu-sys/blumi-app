# Safety report escalation trail: migration design (2026-10-01)

Status: **Design only, not implemented.** Owner decision needed before a
migration is written. No migration was added or applied.

## Problem

A repeat report on a person whose earlier report from the same actor is still
pending escalates that report in place when the new reason is more urgent
(`pendingReportEscalation`, commit 933072e). `blumi_safety_reports` has one
`reason`, one `note` and one `idempotency_key` per row, so the escalation
overwrites the reason and the note, and the escalating request's own
idempotency key is stored nowhere.

## What ships now (no migration)

`apps/server/src/safety/safetyRepository.ts`, shared by the in-memory and the
PostgreSQL repository:

- The merged note starts with `[Önceki sebep / previous reason: <reason>]`
  for each replaced reason (newest first), then the earlier notes, then the
  new note. It is bounded to `REPORT_NOTE_MAX_LENGTH` (1000): when both notes
  do not fit, each keeps at least half of the budget and a cut part ends in
  `…`.
- A retry with the first request's key replays when the stored row's
  original reason (the oldest marker, or the reason when there is none) is
  the request's reason, the stored reason is at least as urgent, and the
  first 200 characters of the request's note are still in the stored note.
  Anything else is still a conflict (409).
- A keyed request whose key is not stored is recognised as a retry of the
  escalating request when the actor's report on the same person (pending, or
  resolved within 24 hours) was escalated to the request's reason and holds
  its note. It is answered as the same escalation (201) and restores the
  block; it never files a new report.

Known limits of the interim rule, which the migration removes:

- The match is by content, so a new keyed request with exactly the
  escalating reason and note, sent while the report is pending or within
  24 hours of its resolution, is answered as that escalation.
- After two escalations of very long notes, the middle note can be cut below
  200 characters; a retry of that middle request then gets the pending
  report as a plain replay (200) instead of 201. It never files a new report
  while the report is pending.
- The markers live in user-visible note text; moderators read them, but they
  are not structured data.

## Clean design: linked child reports (recommended)

Each request stays one row; an escalation links rows instead of rewriting
one.

```sql
-- additive; old binaries ignore the new columns
ALTER TABLE blumi_safety_reports
  ADD COLUMN IF NOT EXISTS escalates_report_id TEXT
    REFERENCES blumi_safety_reports(report_id),
  ADD COLUMN IF NOT EXISTS queue_reason TEXT;
CREATE INDEX IF NOT EXISTS blumi_safety_reports_escalates_idx
  ON blumi_safety_reports (escalates_report_id)
  WHERE escalates_report_id IS NOT NULL;
```

- The escalating request inserts its own row with its own `reason`, `note`
  and `idempotency_key`, `status = 'resolved'`,
  `resolution_action = 'merged'` and `escalates_report_id` = the pending
  report. Its key replays by the existing unique index, with the exact
  `sameReportPayload` rule.
- The pending parent keeps its own reason and note. Its `queue_reason`
  (NULL = `reason`) is raised to the most urgent reason of its children, and
  the queue orders and summarises by `COALESCE(queue_reason, reason)`; the
  keyset index for the pending queue moves to that expression.
- The admin report view lists the children with their reasons and notes, and
  resolving the parent resolves the trail.
- Merged children are excluded from the 20-per-day cap count (they are
  requests, not new reports) or counted, by owner decision.

Alternative: a separate `blumi_safety_report_escalations (report_id,
idempotency_key, reason, note, created_at)` table with a unique
`(actor_user_id, idempotency_key)` across both tables. It keeps the report
table unchanged but needs a key lookup in two places.

## Rollout

1. Take and restore-test the PostgreSQL 17 dump (`ENGINEERING_RULES.md`).
2. Apply the additive migration, then deploy the binary that writes child
   rows and reads `queue_reason`; the interim note markers stay readable.
3. Optional backfill: parse existing markers into `queue_reason` only; the
   original reasons stay in the note text.
4. Retire the content-based retry match once no pending report predates the
   deploy by more than 24 hours.

Runbook with compatibility matrix required, as for migration 068.
