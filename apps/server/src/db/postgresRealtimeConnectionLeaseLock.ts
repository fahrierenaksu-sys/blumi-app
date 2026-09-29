export const REALTIME_CONNECTION_LEASE_LOCK_SQL =
  "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))"

export function realtimeConnectionLeaseLockKey(userId: string): string {
  return `blumi:realtime-connection-leases:${userId}`
}
