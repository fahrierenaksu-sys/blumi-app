/**
 * The ref-counted cache of avatar texture page sets, with a short idle grace (pure: no GPU import, so it runs
 * under node:test). A room avatar's canvas unmounts whenever its screen loses focus (a tab switch, a sheet on
 * top); without the grace its pages were destroyed at once and decoded and uploaded again on the way back, so
 * the avatar showed up late in a room that was already drawn. An idle page set now stays for a while and a
 * returning avatar takes it back on its first frame. At most `maxIdle` idle sets are kept (outfit changes leave
 * old sets behind); the oldest goes first.
 */
export interface Avatar25PageCacheEntry<T> {
  promise: Promise<T>
  refs: number
  /** Set while no avatar uses the pages: when the idle grace ends they are disposed. */
  idleTimer?: ReturnType<typeof setTimeout>
  /** Order the entry went idle in (oldest evicted first). */
  idleOrder?: number
}

export type Avatar25PageCache<T> = Map<string, Avatar25PageCacheEntry<T>>

/** How long an unused page set stays on the GPU before it is freed. */
export const AVATAR25_PAGE_IDLE_MS = 5 * 60_000
/** Unused page sets kept at most (the user's body plus a partner's, or an outfit just taken off). */
export const AVATAR25_PAGE_MAX_IDLE = 3

export interface Avatar25PageCacheTimers {
  setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
}

const SYSTEM_TIMERS: Avatar25PageCacheTimers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (timer) => clearTimeout(timer)
}

let nextIdleOrder = 1

/** An avatar takes a cached page set: it is in use again, so its idle grace stops. */
export function retainAvatar25Pages<T>(
  entry: Avatar25PageCacheEntry<T>,
  timers: Avatar25PageCacheTimers = SYSTEM_TIMERS
): void {
  if (entry.idleTimer !== undefined) timers.clearTimeout(entry.idleTimer)
  entry.idleTimer = undefined
  entry.idleOrder = undefined
  entry.refs += 1
}

function evict<T>(cache: Avatar25PageCache<T>, key: string, dispose: (value: T) => void, timers: Avatar25PageCacheTimers): void {
  const entry = cache.get(key)
  if (!entry) return
  if (entry.idleTimer !== undefined) timers.clearTimeout(entry.idleTimer)
  cache.delete(key)
  entry.promise.then(dispose, () => undefined)
}

/**
 * One avatar view stops using a page set. The last user leaving starts its idle grace; the set is disposed when
 * the grace ends with nobody back, or at once when more than `maxIdle` sets are idle (oldest first).
 */
export function releaseAvatar25PagesToCache<T>(
  cache: Avatar25PageCache<T>,
  key: string,
  dispose: (value: T) => void,
  options: { idleMs?: number; maxIdle?: number; timers?: Avatar25PageCacheTimers } = {}
): void {
  const entry = cache.get(key)
  if (!entry || entry.refs <= 0) return
  entry.refs -= 1
  if (entry.refs > 0) return
  const timers = options.timers ?? SYSTEM_TIMERS
  const idleMs = options.idleMs ?? AVATAR25_PAGE_IDLE_MS
  const maxIdle = options.maxIdle ?? AVATAR25_PAGE_MAX_IDLE
  if (idleMs <= 0 || maxIdle <= 0) {
    evict(cache, key, dispose, timers)
    return
  }
  entry.idleOrder = nextIdleOrder++
  entry.idleTimer = timers.setTimeout(() => {
    const current = cache.get(key)
    if (current === entry && entry.refs === 0) evict(cache, key, dispose, timers)
  }, idleMs)
  const idle = [...cache.entries()]
    .filter(([, candidate]) => candidate.refs === 0 && candidate.idleOrder !== undefined)
    .sort(([, a], [, b]) => (a.idleOrder ?? 0) - (b.idleOrder ?? 0))
  for (const [idleKey] of idle.slice(0, Math.max(0, idle.length - maxIdle))) evict(cache, idleKey, dispose, timers)
}
