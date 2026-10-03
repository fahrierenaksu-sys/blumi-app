import type { ImageSourcePropType } from "react-native"

type ShopTopCandidate = { id: string; name: string; type: string; outfitKey?: string }
type InitialRoomShopCandidate = { sourceItemId: string; title: string; category: string }

export type WarmupPriority = "background" | "selected"

export interface SelectedShopPreviewWarmupRequest {
  generation: number
  sources: readonly ImageSourcePropType[]
}

type SelectedShopPreviewWarmupListener = (request: SelectedShopPreviewWarmupRequest) => void

let selectedShopPreviewGeneration = 0
const selectedShopPreviewListeners = new Set<SelectedShopPreviewWarmupListener>()

/** Ephemeral in-process signal; sources never enter navigation state or persistence. */
export function publishSelectedShopPreviewWarmup(
  sources: readonly ImageSourcePropType[]
): number {
  const request = {
    generation: ++selectedShopPreviewGeneration,
    sources: [...sources]
  }
  for (const listener of selectedShopPreviewListeners) {
    try {
      listener(request)
    } catch {
      // Best-effort image warmup must never interrupt a Shop interaction.
    }
  }
  return request.generation
}

export function subscribeToSelectedShopPreviewWarmup(
  listener: SelectedShopPreviewWarmupListener
): () => void {
  selectedShopPreviewListeners.add(listener)
  return () => selectedShopPreviewListeners.delete(listener)
}

const ROOM_SHOP_CATEGORY_SORT_ORDER: Readonly<Record<string, number>> = {
  seating: 0,
  table: 1,
  lighting: 2,
  rug: 3,
  wallDecor: 4,
  plant: 5,
  misc: 6
}

/** Mirrors the initial avatar/top shelf's priority and first four cards, not the whole catalog. */
export function selectInitialShopTopIds(
  candidates: readonly ShopTopCandidate[],
  publishedIds: ReadonlySet<string>,
  referenceIds: ReadonlySet<string>,
  pricedIds: ReadonlySet<string>,
  hasThumbnail: (id: string) => boolean,
  locale: string
): string[] {
  return candidates
    .filter((item) => item.type === "top" && !item.outfitKey && publishedIds.has(item.id) && hasThumbnail(item.id))
    .sort((left, right) => {
      const priority =
        (referenceIds.has(left.id) ? 0 : pricedIds.has(left.id) ? 1 : 2) -
        (referenceIds.has(right.id) ? 0 : pricedIds.has(right.id) ? 1 : 2)
      return priority || left.name.localeCompare(right.name, locale)
    })
    .slice(0, 4)
    .map((item) => item.id)
}

/** Mirrors the Shop's category/name ordering and returns only the first visible home cards. */
export function selectInitialShopRoomItemIds(
  products: readonly InitialRoomShopCandidate[],
  visibleItemLimit: number
): string[] {
  const limit = Number.isFinite(visibleItemLimit) ? Math.max(0, Math.floor(visibleItemLimit)) : 0
  if (limit === 0) return []
  return [...products]
    .sort((left, right) => {
      const leftCategoryOrder = ROOM_SHOP_CATEGORY_SORT_ORDER[left.category] ?? 6
      const rightCategoryOrder = ROOM_SHOP_CATEGORY_SORT_ORDER[right.category] ?? 6
      const categoryDelta = leftCategoryOrder - rightCategoryOrder
      return categoryDelta || left.title.localeCompare(right.title)
    })
    .slice(0, limit)
    .map((item) => item.sourceItemId)
}

type ResolvedWarmupSource = { uri?: string; width?: number; height?: number }

const prefetchRequestOwners = new WeakMap<Promise<boolean>, () => boolean>()
const logicallyTimedOutPrefetchRequests = new WeakSet<Promise<boolean>>()

/** Per-mounted-session admission ledger; Expo's native cache has its own eviction policy. */
export type WarmupSessionBudget = {
  seenUris: Set<string>
  reservedUris: Map<string, number>
  estimatedDecodedBytes: number
  maxAssets: number
  maxDecodedBytes: number
}

export function createWarmupSessionBudget(
  maxAssets = 32,
  maxDecodedBytes = 48 * 1024 * 1024
): WarmupSessionBudget {
  return {
    seenUris: new Set(),
    reservedUris: new Map(),
    estimatedDecodedBytes: 0,
    maxAssets,
    maxDecodedBytes
  }
}

/** One native image request at a time; queued work checks the latest generation. */
export function createSequentialPrefetchLane(
  prefetch: (uri: string) => Promise<boolean>
): (uri: string, isCurrent: () => boolean) => Promise<boolean> {
  let tail: Promise<void> = Promise.resolve()
  return (uri, isCurrent) => {
    const task = tail.then(() => isCurrent() ? prefetch(uri) : false)
    tail = task.then(() => undefined, () => undefined)
    return task
  }
}

interface PriorityPrefetchJob {
  uri: string
  isCurrent: () => boolean
  priority: WarmupPriority
  started: boolean
  timedOut: boolean
  rescue: boolean
  logicalSettled: boolean
  timeoutHandle?: unknown
  hasTimeoutHandle: boolean
  promise: Promise<boolean>
  resolve: (accepted: boolean) => void
}

export interface PriorityPrefetchLaneOptions {
  logicalDeadlineMs?: number
  uriCooldownMs?: number
  now?: () => number
  setTimeout?: (callback: () => void, delayMs: number) => unknown
  clearTimeout?: (handle: unknown) => void
  onNativeStart?: (uri: string, priority: WarmupPriority) => boolean
  onNativeSettled?: (uri: string, accepted: boolean) => void
  onNativeNotStarted?: (uri: string) => void
}

/** One normal native request; a timed-out request may admit one selected rescue as slot two. */
export function createPrioritySequentialPrefetchLane(
  prefetch: (
    uri: string,
    isCurrent: () => boolean,
    priority: WarmupPriority
  ) => Promise<boolean>,
  options: PriorityPrefetchLaneOptions = {}
): (
  uri: string,
  isCurrent: () => boolean,
  priority?: WarmupPriority
) => Promise<boolean> {
  const selectedQueue: PriorityPrefetchJob[] = []
  const backgroundQueue: PriorityPrefetchJob[] = []
  const jobsByUri = new Map<string, PriorityPrefetchJob>()
  const nativeInFlight = new Set<PriorityPrefetchJob>()
  const cooldownUntilByUri = new Map<string, number>()
  const now = options.now ?? Date.now
  const logicalDeadlineMs = options.logicalDeadlineMs ?? 5_000
  const uriCooldownMs = options.uriCooldownMs ?? 30_000
  const scheduleTimeout = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  const cancelTimeout = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  const settleLogical = (job: PriorityPrefetchJob, accepted: boolean): void => {
    if (job.logicalSettled) return
    job.logicalSettled = true
    if (job.hasTimeoutHandle) {
      cancelTimeout(job.timeoutHandle)
      job.hasTimeoutHandle = false
    }
    job.resolve(accepted)
  }

  const removeJob = (job: PriorityPrefetchJob): void => {
    if (jobsByUri.get(job.uri) === job) jobsByUri.delete(job.uri)
  }

  const pruneStaleQueuedJobs = (queue: PriorityPrefetchJob[]): void => {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const job = queue[index]
      if (job.isCurrent()) continue
      queue.splice(index, 1)
      removeJob(job)
      notifyNotStarted(job.uri)
      settleLogical(job, false)
    }
  }

  const notifyNotStarted = (uri: string): void => {
    try {
      options.onNativeNotStarted?.(uri)
    } catch {
      // Cache warmup bookkeeping must not affect navigation or rendering.
    }
  }

  const takeNext = (queue: PriorityPrefetchJob[]): PriorityPrefetchJob | null => {
    while (queue.length) {
      const job = queue.shift()
      if (!job || jobsByUri.get(job.uri) !== job) continue
      if (!job.isCurrent()) {
        removeJob(job)
        notifyNotStarted(job.uri)
        settleLogical(job, false)
        continue
      }
      return job
    }
    return null
  }

  const finishNative = (job: PriorityPrefetchJob, accepted: boolean): void => {
    if (!nativeInFlight.delete(job)) return
    if (job.hasTimeoutHandle) {
      cancelTimeout(job.timeoutHandle)
      job.hasTimeoutHandle = false
    }
    try {
      options.onNativeSettled?.(job.uri, accepted)
    } catch {
      // Bookkeeping failures must not strand the native queue.
    }
    removeJob(job)
    // A late completion settles resource accounting only. The timed-out logical
    // request already returned and cannot publish into a newer UI generation.
    settleLogical(job, accepted && job.isCurrent())
    pump()
  }

  const startNative = (job: PriorityPrefetchJob, rescue: boolean): void => {
    if (!job.isCurrent()) {
      removeJob(job)
      notifyNotStarted(job.uri)
      settleLogical(job, false)
      pump()
      return
    }

    let admitted = true
    try {
      admitted = options.onNativeStart?.(job.uri, job.priority) ?? true
    } catch {
      admitted = false
    }
    if (!admitted) {
      removeJob(job)
      notifyNotStarted(job.uri)
      settleLogical(job, false)
      pump()
      return
    }

    job.started = true
    job.rescue = rescue
    nativeInFlight.add(job)
    job.timeoutHandle = scheduleTimeout(() => {
      if (!nativeInFlight.has(job) || job.logicalSettled) return
      job.timedOut = true
      cooldownUntilByUri.set(job.uri, now() + uriCooldownMs)
      logicallyTimedOutPrefetchRequests.add(job.promise)
      settleLogical(job, false)
      pump()
    }, logicalDeadlineMs)
    job.hasTimeoutHandle = true

    let nativeRequest: Promise<boolean>
    try {
      nativeRequest = prefetch(job.uri, job.isCurrent, job.priority)
    } catch {
      finishNative(job, false)
      return
    }
    void Promise.resolve(nativeRequest).then(
      (accepted) => finishNative(job, accepted),
      () => finishNative(job, false)
    )
  }

  const pump = (): void => {
    const currentTime = now()
    for (const [uri, expiresAt] of cooldownUntilByUri) {
      if (expiresAt <= currentTime) cooldownUntilByUri.delete(uri)
    }

    if (nativeInFlight.size === 0) {
      const next = takeNext(selectedQueue) ?? takeNext(backgroundQueue)
      if (next) startNative(next, false)
      return
    }

    // Do not let another background request stack up behind an unresolved
    // native call. Only one selected preview may use the rescue slot.
    if (nativeInFlight.size !== 1) return
    const stalledNormal = [...nativeInFlight].find((job) => job.timedOut && !job.rescue)
    if (!stalledNormal) return
    const rescue = takeNext(selectedQueue)
    if (rescue) startNative(rescue, true)
  }

  return (uri, isCurrent, priority = "background") => {
    const nowTime = now()
    const cooldownUntil = cooldownUntilByUri.get(uri)
    if (cooldownUntil !== undefined && cooldownUntil > nowTime) {
      notifyNotStarted(uri)
      return Promise.resolve(false)
    }
    if (cooldownUntil !== undefined) cooldownUntilByUri.delete(uri)

    const existing = jobsByUri.get(uri)
    if (existing) {
      existing.isCurrent = isCurrent
      if (!existing.started) {
        if (priority === "selected" && existing.priority !== "selected") {
          existing.priority = "selected"
          const backgroundIndex = backgroundQueue.indexOf(existing)
          if (backgroundIndex >= 0) backgroundQueue.splice(backgroundIndex, 1)
          selectedQueue.push(existing)
        }
      }
      return existing.promise
    }

    pruneStaleQueuedJobs(selectedQueue)
    pruneStaleQueuedJobs(backgroundQueue)
    if (nativeInFlight.size >= 2 || selectedQueue.length + backgroundQueue.length >= 32) {
      // Saturated native work is intentionally not allowed to grow a hidden
      // backlog. UI callers still proceed; this best-effort request is skipped.
      notifyNotStarted(uri)
      return Promise.resolve(false)
    }

    let resolve!: (accepted: boolean) => void
    const promise = new Promise<boolean>((complete) => { resolve = complete })
    const job: PriorityPrefetchJob = {
      uri,
      isCurrent,
      priority,
      started: false,
      timedOut: false,
      rescue: false,
      logicalSettled: false,
      hasTimeoutHandle: false,
      promise,
      resolve
    }
    jobsByUri.set(uri, job)
    if (priority === "selected") selectedQueue.push(job)
    else backgroundQueue.push(job)
    pump()
    return promise
  }
}

/** Reserve decoded-byte/count capacity immediately before a native request starts. */
export function admitWarmupUri(
  uri: string,
  dimensions: { width?: number; height?: number } | undefined,
  session: WarmupSessionBudget
): boolean {
  if (session.seenUris.has(uri) || session.reservedUris.has(uri)) return true
  const width = dimensions?.width
  const height = dimensions?.height
  if (!width || !height || width <= 0 || height <= 0 || !Number.isFinite(width * height)) {
    return false
  }
  const estimatedBytes = Math.ceil(width * height * 4)
  if (session.seenUris.size + session.reservedUris.size >= session.maxAssets ||
    session.estimatedDecodedBytes + estimatedBytes > session.maxDecodedBytes) {
    return false
  }
  session.reservedUris.set(uri, estimatedBytes)
  session.estimatedDecodedBytes += estimatedBytes
  return true
}

/** Failed native work releases its reservation; success remains charged for this mounted session. */
export function settleWarmupUri(
  uri: string,
  accepted: boolean,
  session: WarmupSessionBudget
): void {
  const reservedBytes = session.reservedUris.get(uri)
  if (reservedBytes === undefined) return
  session.reservedUris.delete(uri)
  if (accepted) {
    session.seenUris.add(uri)
    return
  }
  session.estimatedDecodedBytes = Math.max(0, session.estimatedDecodedBytes - reservedBytes)
}

/** Decoded RGBA estimate; skip unknown dimensions rather than silently exceeding the budget. */
export function selectBoundedWarmupUris(
  sources: readonly ResolvedWarmupSource[],
  budget: { maxAssets: number; maxDecodedBytes: number }
): string[] {
  const selected: string[] = []
  const seen = new Set<string>()
  let usedBytes = 0
  for (const { uri, width, height } of sources) {
    if (selected.length >= budget.maxAssets) break
    if (!uri || seen.has(uri)) continue
    seen.add(uri)
    if (!width || !height || width <= 0 || height <= 0 || !Number.isFinite(width * height)) continue
    const estimatedBytes = Math.ceil(width * height * 4)
    if (usedBytes + estimatedBytes > budget.maxDecodedBytes) continue
    selected.push(uri)
    usedBytes += estimatedBytes
  }
  return selected
}

/** Keep native image work bounded: one current-scene asset at a time. */
export async function prefetchCurrentSceneUris(
  uris: readonly string[],
  prefetch: (uri: string, priority?: WarmupPriority) => Promise<boolean>,
  isCurrent: () => boolean,
  completed?: Set<string>,
  inFlight?: Map<string, Promise<boolean>>,
  priority: WarmupPriority = "background",
  waitForBackgroundSlot?: () => Promise<boolean>
): Promise<void> {
  for (const uri of new Set(uris)) {
    if (!isCurrent()) return
    if (completed?.has(uri)) continue
    if (priority === "background" && !inFlight?.has(uri) && waitForBackgroundSlot) {
      if (!await waitForBackgroundSlot() || !isCurrent()) return
      // A selected preview may have loaded this asset while we yielded.
      if (completed?.has(uri)) continue
    }
    let request = inFlight?.get(uri)
    const adoptedInFlightRequest = Boolean(request)
    try {
      if (!request || priority === "selected") {
        const queuedRequest = prefetch(uri, priority)
        if (!request || request !== queuedRequest) request = queuedRequest
        prefetchRequestOwners.set(request, isCurrent)
        inFlight?.set(uri, request)
      }
      let accepted = await request
      while (!accepted && adoptedInFlightRequest && isCurrent() && !completed?.has(uri)) {
        if (request && logicallyTimedOutPrefetchRequests.has(request)) break
        const requestOwnerIsCurrent = prefetchRequestOwners.get(request)
        if (!requestOwnerIsCurrent || requestOwnerIsCurrent()) break

        // A newer generation adopted a request that a stale owner left queued.
        // Keep following/replacing stale queued requests until one is accepted,
        // without bypassing the shared sequential prefetch lane.
        const replacement = inFlight?.get(uri)
        if (replacement && replacement !== request) {
          request = replacement
        } else {
          request = prefetch(uri, priority)
          prefetchRequestOwners.set(request, isCurrent)
          inFlight?.set(uri, request)
        }
        accepted = await request
      }
      if (accepted && isCurrent()) completed?.add(uri)
    } catch {
      // A failed warmup must never block the normal on-screen image loader.
    } finally {
      if (request && inFlight?.get(uri) === request) inFlight.delete(uri)
    }
  }
}
