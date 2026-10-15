-- Additive and backward compatible (2026-10-15, audit R15). Two nullable
-- columns, no backfill, no index. Requires 071 (the migrator applies files in
-- order).
--
-- 071 stores "delete chat for me" as a time only (hidden_through), so a
-- message in the same millisecond as the hidden one was hidden too. The exact
-- hide point is the hidden message's place in the history order every page
-- already uses, (sent_at, message_id): hidden_through_message_id names that
-- message and hidden_through_message_sent_at repeats the time it was written
-- with. A binary that knows these columns writes all three together and reads
-- the pair only while hidden_through_message_sent_at = hidden_through. A row
-- written before this migration (both NULL), or whose hidden_through was
-- later moved by a binary that does not know these columns, keeps 071's
-- inclusive time rule. Older binaries never read the new columns.
--
-- /ready treats this file as optional: the server probes the ledger and uses
-- the new columns only once this row exists with the packaged checksum.
ALTER TABLE blumi_chat_thread_participants
  ADD COLUMN IF NOT EXISTS hidden_through_message_id TEXT,
  ADD COLUMN IF NOT EXISTS hidden_through_message_sent_at TIMESTAMPTZ;
