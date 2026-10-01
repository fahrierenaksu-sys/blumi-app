# Read receipts: retroactive reveal (design, owner decision)

Date: 2026-10-01. Status: **Open, owner decision needed.** No code or migration in this change implements anything in this document.

## What the code does today

Read receipts are mutual and off by default. One person's read position is shown to the other person only while both have receipts on (`chatReceiptService.ts`, `project()`, `readVisible`).

The read receipt is stored in `blumi_chat_thread_participants.last_read_message_id`. Since 2026-10-01 it is moved only by a read that names a partner message the phone showed (`postgresChatReceipts.ts`, `readUpToMessage`). A read without a message moves only the unread cursor (`last_read_at`). It never moves or publishes the receipt.

The stored receipt does not depend on the reader's preference:

1. Bora has receipts off and reads Ada's messages up to message 40. `last_read_message_id` is set to 40, and nothing is shown to Ada.
2. Later, Bora turns receipts on, and Ada has them on.
3. Ada's thread list, history and the next `chat.receipt_updated` event now show "read up to 40".

So a read Bora made while receipts were off is shown to Ada after the fact. Most people would expect "off" to mean those reads are never shown.

The same happens the other way round. If Bora always had receipts on and Ada turns hers on, Ada sees Bora's earlier reads. Bora agreed to share those reads when they happened, so this case is less sensitive. It is still a product choice.

## Options

### A. Do not store a receipt while the reader has receipts off (no migration)

`readUpToMessage` joins `blumi_chat_privacy_preferences`. It advances `last_read_message_id` only when the reader's `read_receipts_enabled` is true. The unread cursor moves either way.

- Effect: reads made while off are never stored as a receipt, so they can never be shown. After turning receipts on, the first read by id moves the receipt to the newest shown message. That message covers the older ones, which is the normal meaning of "read up to".
- Cost: one primary-key join in the read statement. No schema change and no backfill.
- Gap: receipts already stored before the change, while a reader had receipts off, can still be revealed. A one-time cleanup removes them. It can run as an owner-run SQL statement after a backup, or as a guarded step at server start:
  `UPDATE blumi_chat_thread_participants p SET last_read_message_id = NULL WHERE NOT EXISTS (SELECT 1 FROM blumi_chat_privacy_preferences x WHERE x.user_id = p.user_id AND x.read_receipts_enabled)`.
  This is a data change, so the owner must authorise it.
- Race: a read that runs at the same moment as a preference toggle uses the preference value its statement sees. That is acceptable.

### B. `read_receipts_enabled_at` with a clamp (needs a migration)

This is the review's proposal.

1. Add `read_receipts_enabled_at TIMESTAMPTZ` to `blumi_chat_privacy_preferences`. It is set when receipts are turned on and cleared when they are turned off.
2. Add `last_read_receipt_at TIMESTAMPTZ` to `blumi_chat_thread_participants`, holding the time the receipt last moved.
3. Publish or project a receipt only when `last_read_receipt_at >= read_receipts_enabled_at` for the reader.

- Effect: the same as A for new reads. Old receipts also stay hidden without a cleanup, because they have no `last_read_receipt_at`.
- Cost: one additive migration, written and checksummed like 070. It is optional for `/ready`, and the code probes the migration ledger. It also needs an extra column write per read and a runbook entry.
- Risk: more moving parts than A for the same visible result.

### C. Keep the current behaviour and document it

Turning receipts on would then also share earlier reads. This is the cheapest option, but it is the one most likely to surprise users.

## Recommendation

**Option A plus the one-time cleanup.** It gives the expected privacy meaning ("off means never shown") with no schema change. It is reversible: removing the join brings back today's behaviour. It stays compatible with B if per-read timing is ever needed.

## Decisions for the owner

1. Should reads made while the reader had receipts off ever be shown? The recommendation is never.
2. If the answer is never, choose A or B. If A, authorise the one-time cleanup and say how it should run: an owner-run SQL statement after a backup, or a guarded startup step.
3. Should turning receipts on reveal the partner's earlier reads, if the partner had receipts on when they read? The recommendation is yes. It is the partner's consent that matters, and it matches today's behaviour.

## Related, already fixed (2026-10-01)

- False read ticks: a read without a message no longer moves or publishes the receipt. The mobile app sends a read only after a partner message is shown, and always names it (`useChatThreadSync.ts`).
- Receipts stored before 070, or by an instant read, are no longer projected. Only a receipt that names a message is shown.
- Migration 070's header comment says `last_read_message_id` "narrows" `last_read_at`. Since 2026-10-01 it is an independent receipt cursor. The migration file is checksummed and is deliberately left unchanged.
- The structural fix for ordering is a per-thread monotonic sequence number, so cursors no longer compare `sent_at` values assigned before commit. It needs a migration and is a separate owner decision.
