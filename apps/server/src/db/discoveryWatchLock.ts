// Transaction-scoped and independent of row existence: creation and account deletion
// must share this boundary even when there is no watch row to lock yet.
export const discoveryWatchLockSql = "SELECT pg_advisory_xact_lock(hashtextextended('blumi:watch:' || $1::text, 0))"
export const discoveryWatchLockCte = `WITH watch_authority AS MATERIALIZED (${discoveryWatchLockSql})`
