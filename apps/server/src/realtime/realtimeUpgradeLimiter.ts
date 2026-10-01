/**
 * WebSocket upgrade admission (2026-10-01), designed for carrier-grade NAT.
 *
 * Mobile carriers put thousands of phones behind one public address, and
 * after a deploy every one of them reconnects within seconds. A flat per-
 * address cap (previously 40 per 10 s) refused most of them. Abuse is bounded
 * differently now:
 *
 * - Failed authentications per address (a forged, expired or replayed
 *   ticket, each costing one ticket-store lookup) are capped low and checked
 *   before the ticket is consumed.
 * - All attempts per address have a high ceiling, a flood guard only.
 * - After authentication each account is capped, so one account cannot
 *   churn sockets (each costs a lease write) whatever its address.
 */
export const REALTIME_UPGRADE_WINDOW_MS = 10_000
export const MAX_UPGRADE_ATTEMPTS_PER_ADDRESS_PER_WINDOW = 2_000
export const MAX_FAILED_UPGRADES_PER_ADDRESS_PER_WINDOW = 100
export const MAX_UPGRADES_PER_USER_PER_WINDOW = 10
/** Memory bound for tracked keys; the oldest window is evicted first. */
const MAX_TRACKED_KEYS = 20_000

interface Window {
  startedAt: number
  count: number
}

export interface RealtimeUpgradeLimiter {
  /** Counts an attempt; false when the address must be refused before any lookup. */
  admitAddress(address: string, now: number): boolean
  recordFailure(address: string, now: number): void
  /** Counts an authenticated upgrade; false when this account must be refused. */
  admitUser(userId: string, now: number): boolean
  purgeExpired(now: number): void
}

export function createRealtimeUpgradeLimiter(limits: {
  attemptsPerAddress?: number
  failuresPerAddress?: number
  upgradesPerUser?: number
} = {}): RealtimeUpgradeLimiter {
  const attemptsPerAddress = limits.attemptsPerAddress ?? MAX_UPGRADE_ATTEMPTS_PER_ADDRESS_PER_WINDOW
  const failuresPerAddress = limits.failuresPerAddress ?? MAX_FAILED_UPGRADES_PER_ADDRESS_PER_WINDOW
  const upgradesPerUser = limits.upgradesPerUser ?? MAX_UPGRADES_PER_USER_PER_WINDOW
  const attempts = new Map<string, Window>()
  const failures = new Map<string, Window>()
  const users = new Map<string, Window>()

  function current(windows: Map<string, Window>, key: string, now: number): Window | undefined {
    const window = windows.get(key)
    if (!window || window.startedAt + REALTIME_UPGRADE_WINDOW_MS <= now) return undefined
    return window
  }

  function increment(windows: Map<string, Window>, key: string, now: number): number {
    const window = current(windows, key, now)
    if (window) {
      window.count += 1
      return window.count
    }
    if (windows.size >= MAX_TRACKED_KEYS) {
      purge(windows, now)
      const oldest = windows.keys().next()
      if (!oldest.done && windows.size >= MAX_TRACKED_KEYS) windows.delete(oldest.value)
    }
    windows.set(key, { startedAt: now, count: 1 })
    return 1
  }

  function purge(windows: Map<string, Window>, now: number): void {
    for (const [key, window] of windows) {
      if (window.startedAt + REALTIME_UPGRADE_WINDOW_MS <= now) windows.delete(key)
    }
  }

  return {
    admitAddress(address, now) {
      if ((current(failures, address, now)?.count ?? 0) >= failuresPerAddress) return false
      return increment(attempts, address, now) <= attemptsPerAddress
    },
    recordFailure(address, now) {
      increment(failures, address, now)
    },
    admitUser(userId, now) {
      return increment(users, userId, now) <= upgradesPerUser
    },
    purgeExpired(now) {
      purge(attempts, now)
      purge(failures, now)
      purge(users, now)
    }
  }
}
