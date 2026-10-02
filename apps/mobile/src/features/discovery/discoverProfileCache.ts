import type { DiscoverProfileResponse } from "./discoveryApi"

/**
 * Profiles the viewer has already loaded this app session, so opening one
 * again (a chat partner's profile from the chat header) draws it in the
 * push's first frame. Memory only, keyed by the signed-in account, and
 * always revalidated by the screen that shows it: the server still decides
 * what the profile says and what the viewer may do with it.
 */
export interface DiscoverProfileCacheKey {
  viewerUserId: string
  userId: string
}

type LoadProfile = (signal?: AbortSignal) => Promise<DiscoverProfileResponse>

/** A handful of recent partners is plenty; the oldest entry goes first. */
export const DISCOVER_PROFILE_CACHE_LIMIT = 24

const entries = new Map<string, DiscoverProfileResponse>()
/** Running requests; only a warmup (no abort signal) may be shared. */
const inFlight = new Map<string, { request: Promise<DiscoverProfileResponse>; shareable: boolean }>()

function cacheId(key: DiscoverProfileCacheKey): string {
  return `${key.viewerUserId}\u0000${key.userId}`
}

function remember(id: string, response: DiscoverProfileResponse): void {
  entries.delete(id)
  entries.set(id, response)
  while (entries.size > DISCOVER_PROFILE_CACHE_LIMIT) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }
}

export function readCachedDiscoverProfile(key: DiscoverProfileCacheKey): DiscoverProfileResponse | undefined {
  return entries.get(cacheId(key))
}

/**
 * Loads a profile and remembers it. A warmup already running for the same
 * key is shared instead of starting a second request. A request that carries
 * `signal` is never shared, so aborting it cannot fail another screen.
 */
export function loadDiscoverProfile(
  key: DiscoverProfileCacheKey,
  load: LoadProfile,
  signal?: AbortSignal
): Promise<DiscoverProfileResponse> {
  const id = cacheId(key)
  const pending = inFlight.get(id)
  if (pending?.shareable) return pending.request
  const request = load(signal).then((response) => {
    remember(id, response)
    return response
  })
  const entry = { request, shareable: signal === undefined }
  inFlight.set(id, entry)
  const release = () => { if (inFlight.get(id) === entry) inFlight.delete(id) }
  request.then(release, release)
  return request
}

/** Starts loading a profile nobody has loaded yet; failures stay silent. */
export function warmDiscoverProfile(key: DiscoverProfileCacheKey, load: LoadProfile): void {
  const id = cacheId(key)
  if (entries.has(id) || inFlight.has(id)) return
  void loadDiscoverProfile(key, load).catch(() => undefined)
}

/** Drops a profile the server no longer shows to this viewer. */
export function forgetDiscoverProfile(key: DiscoverProfileCacheKey): void {
  entries.delete(cacheId(key))
}
