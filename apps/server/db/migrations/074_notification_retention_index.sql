-- Additive and backward compatible (2026-10-15, audit D08). Index only: no
-- table, column or row changes. Retention (src/db/postgresRetention.ts) scans
-- blumi_notification_policy_events every ten minutes for
--   notification_type IN ('message', 'like') AND created_at < now() - 30 days.
-- No index served that global time scan, so each tick read the whole table.
-- This partial index holds only the 'message' and 'like' rows the scan can
-- delete; 'match' and 'discovery_watch' claims are permanent and stay out.
-- The predicate is written exactly like the retention query's so the planner
-- can prove the index applies.
--
-- Not CONCURRENTLY: the migrator runs each file inside one transaction, where
-- CREATE INDEX CONCURRENTLY is refused. A plain build takes a SHARE lock on
-- this table, which blocks only its writes (notification claims) for the
-- build time and never blocks reads. The migrator's lock_timeout (5 s by
-- default) bounds the wait for the lock; at today's row count the build takes
-- milliseconds. Any binary works with or without this index.
CREATE INDEX IF NOT EXISTS blumi_notification_policy_events_retention_idx
  ON blumi_notification_policy_events (created_at)
  WHERE notification_type IN ('message', 'like');
