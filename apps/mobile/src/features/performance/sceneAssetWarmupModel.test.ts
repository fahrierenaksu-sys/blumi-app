import assert from "node:assert/strict"
import test from "node:test"
import {
  admitWarmupUri,
  createWarmupSessionBudget,
  createSequentialPrefetchLane,
  createPrioritySequentialPrefetchLane,
  prefetchCurrentSceneUris,
  settleWarmupUri,
  publishSelectedShopPreviewWarmup,
  selectBoundedWarmupUris,
  selectInitialShopTopIds,
  selectInitialShopRoomItemIds,
  subscribeToSelectedShopPreviewWarmup
} from "./sceneAssetWarmupModel"

function createManualTimers() {
  let now = 0
  let nextId = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  return {
    now: () => now,
    setTimeout: (callback: () => void, delayMs: number): number => {
      const id = ++nextId
      timers.set(id, { at: now + delayMs, callback })
      return id
    },
    clearTimeout: (handle: unknown): void => { timers.delete(handle as number) },
    advanceBy: (deltaMs: number): void => {
      const target = now + deltaMs
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0]
        if (!next) break
        timers.delete(next[0])
        now = next[1].at
        next[1].callback()
      }
      now = target
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

test("background batches yield before each native request, allowing a selected preview to win the idle gap", async () => {
  const idleSlots: ReturnType<typeof deferred<boolean>>[] = []
  const completed = new Set<string>()
  const inFlight = new Map<string, Promise<boolean>>()
  const started: string[] = []
  const lane = createPrioritySequentialPrefetchLane(async (uri) => {
    started.push(uri)
    return true
  })
  const waitForSlot = () => {
    const slot = deferred<boolean>()
    idleSlots.push(slot)
    return slot.promise
  }
  const background = prefetchCurrentSceneUris(["base", "top"], (uri, priority) =>
    lane(uri, () => true, priority), () => true, completed, inFlight, "background", waitForSlot)
  assert.deepEqual(started, [])

  await prefetchCurrentSceneUris(["selected"], (uri, priority) =>
    lane(uri, () => true, priority), () => true, completed, inFlight, "selected", waitForSlot)
  assert.deepEqual(started, ["selected"])
  idleSlots[0].resolve(true)
  await flushMicrotasks()
  await flushMicrotasks()
  assert.deepEqual(started, ["selected", "base"])
  assert.equal(idleSlots.length, 2)
  idleSlots[1].resolve(true)
  await background
  assert.deepEqual(started, ["selected", "base", "top"])
})

test("a cancelled or deadline-expired idle gap stops background work without entering the native lane", async () => {
  for (const cancelled of [false, true]) {
    let current = true
    const idle = deferred<boolean>()
    const completed = new Set<string>()
    const started: string[] = []
    const run = prefetchCurrentSceneUris(["pending", "later"], async (uri) => {
      started.push(uri)
      return true
    }, () => current, completed, undefined, "background", () => idle.promise)
    if (cancelled) current = false
    idle.resolve(cancelled)
    await run
    assert.deepEqual(started, [])
    assert.equal(completed.size, 0)
  }
})

test("selected completion during an idle gap avoids a redundant background native request", async () => {
  const idle = deferred<boolean>()
  const completed = new Set<string>()
  const started: string[] = []
  const prefetch = async (uri: string) => { started.push(uri); return true }
  const background = prefetchCurrentSceneUris(["shared"], prefetch, () => true,
    completed, undefined, "background", () => idle.promise)
  await prefetchCurrentSceneUris(["shared"], prefetch, () => true, completed, undefined, "selected")
  idle.resolve(true)
  await background
  assert.deepEqual(started, ["shared"])
})

test("background queued before a swipe is rechecked at native admission; selected priority remains eligible", async () => {
  const first = deferred<boolean>()
  const session = createWarmupSessionBudget(4, 1_600)
  let interactive = false
  const started: string[] = []
  const lane = createPrioritySequentialPrefetchLane((uri) => {
    started.push(uri)
    return uri === "first" ? first.promise : Promise.resolve(true)
  }, {
    onNativeStart: (uri, priority) => (priority === "selected" || !interactive) &&
      admitWarmupUri(uri, { width: 10, height: 10 }, session),
    onNativeSettled: (uri, accepted) => settleWarmupUri(uri, accepted, session)
  })
  const firstRequest = lane("first", () => true)
  const background = lane("queued-background", () => true)
  interactive = true
  const selected = lane("selected", () => true, "selected")
  first.resolve(true)
  assert.deepEqual(await Promise.all([firstRequest, background, selected]), [true, false, true])
  assert.deepEqual(started, ["first", "selected"])
  assert.equal(session.seenUris.has("queued-background"), false)
  assert.equal(session.estimatedDecodedBytes, 800)
})

test("first Shop page selects at most four visible top thumbnails and tolerates an empty catalog", () => {
  const tops = ["Z", "A", "B", "C", "D"].map((id) => ({ id, name: id, type: "top", outfitKey: undefined }))
  assert.deepEqual(selectInitialShopTopIds([], new Set(), new Set(), new Set(), () => true, "en-US"), [])
  assert.deepEqual(
    selectInitialShopTopIds(
      [...tops, { id: "dress", name: "Dress", type: "top", outfitKey: "look" }],
      new Set(["A", "B", "C", "D", "Z", "dress"]),
      new Set(["B"]),
      new Set(["D"]),
      (id) => id !== "C",
      "en-US"
    ),
    ["B", "D", "A", "Z"]
  )
})

test("initial home Shop selects only the category-sorted first viewport furniture items", () => {
  const products = [
    { sourceItemId: "plant", title: "A Plant", category: "plant" },
    { sourceItemId: "table-b", title: "Z Table", category: "table" },
    { sourceItemId: "seat-b", title: "Cozy Seat", category: "seating" },
    { sourceItemId: "table-a", title: "A Table", category: "table" },
    { sourceItemId: "seat-a", title: "Blush Chair", category: "seating" },
    { sourceItemId: "wall", title: "Wall Art", category: "wallDecor" }
  ]

  assert.deepEqual(selectInitialShopRoomItemIds(products, 4), ["seat-a", "seat-b", "table-a", "table-b"])
  assert.deepEqual(selectInitialShopRoomItemIds(products, 2), ["seat-a", "seat-b"])
  assert.deepEqual(selectInitialShopRoomItemIds(products, 0), [])
  assert.deepEqual(selectInitialShopRoomItemIds([], 4), [])
})

test("decoded-byte and source-count budgets drop oversized or duplicate warmup assets", () => {
  const sources = [
    { uri: "background", width: 100, height: 100 },
    { uri: "background", width: 100, height: 100 },
    { uri: "invalid", width: -100, height: 100 },
    { uri: "oversized", width: 1000, height: 1000 },
    { uri: "thumb", width: 10, height: 10 },
    { uri: "later", width: 10, height: 10 }
  ]
  assert.deepEqual(selectBoundedWarmupUris(sources, { maxAssets: 2, maxDecodedBytes: 41_000 }), ["background", "thumb"])
  assert.deepEqual(selectBoundedWarmupUris([], { maxAssets: 2, maxDecodedBytes: 41_000 }), [])
})

test("session admissions are cumulative, bounded, and measure decoded RGBA pixels", () => {
  const session = createWarmupSessionBudget(3, 941 * 1672 * 4 + 100)
  const batch = { maxAssets: 5, maxDecodedBytes: 9 * 1024 * 1024 }
  assert.deepEqual(selectBoundedWarmupUris([
    { uri: "background", width: 941, height: 1672 },
    { uri: "thumb", width: 5, height: 5 }
  ], batch), ["background", "thumb"])
  assert.deepEqual(selectBoundedWarmupUris([
    { uri: "background", width: 941, height: 1672 },
    { uri: "third", width: 5, height: 5 }
  ], batch), ["background", "third"])
  assert.equal(session.estimatedDecodedBytes, 0, "URI selection is not native admission")
  assert.equal(session.reservedUris.size, 0)

  const countOnlySession = createWarmupSessionBudget(2, 1024)
  assert.deepEqual(selectBoundedWarmupUris([
    { uri: "one", width: 5, height: 5 },
    { uri: "two", width: 5, height: 5 },
    { uri: "three", width: 5, height: 5 }
  ], { maxAssets: 2, maxDecodedBytes: 1024 }), ["one", "two"])
  assert.equal(countOnlySession.seenUris.size, 0)
  assert.equal(countOnlySession.reservedUris.size, 0)
})

test("current-scene warmup is sequential, deduplicated and stops after outfit change", async () => {
  const started: string[] = []
  let finishFirst: ((value: boolean) => void) | undefined
  let active = true
  const task = prefetchCurrentSceneUris(["base", "base", "top"], (uri) => {
    started.push(uri)
    if (uri === "base") return new Promise((resolve) => { finishFirst = resolve })
    return Promise.resolve(true)
  }, () => active)

  assert.deepEqual(started, ["base"])
  active = false
  finishFirst?.(true)
  await task
  assert.deepEqual(started, ["base"])
})

test("failed prefetch does not block later current-scene assets", async () => {
  const started: string[] = []
  await prefetchCurrentSceneUris(["hair", "top", "hair"], async (uri) => {
    started.push(uri)
    if (uri === "hair") throw new Error("unavailable")
    return true
  }, () => true)
  assert.deepEqual(started, ["hair", "top"])
})

test("a completed URI is not prefetched on a repeated visit, while failed work remains retryable", async () => {
  const completed = new Set<string>()
  const started: string[] = []
  const prefetch = async (uri: string) => {
    started.push(uri)
    return uri !== "failed"
  }
  await prefetchCurrentSceneUris(["background", "failed"], prefetch, () => true, completed)
  await prefetchCurrentSceneUris(["background", "failed"], prefetch, () => true, completed)
  assert.deepEqual(started, ["background", "failed", "failed"])
})

test("overlapping warmups share one in-flight URI and stale avatar work stops afterward", async () => {
  const completed = new Set<string>()
  const inFlight = new Map<string, Promise<boolean>>()
  const started: string[] = []
  let finish: ((value: boolean) => void) | undefined
  let oldAvatarCurrent = true
  const prefetch = (uri: string) => {
    started.push(uri)
    if (uri === "shared") return new Promise<boolean>((resolve) => { finish = resolve })
    return Promise.resolve(true)
  }
  const oldRun = prefetchCurrentSceneUris(["shared", "old-layer"], prefetch, () => oldAvatarCurrent, completed, inFlight)
  const newRun = prefetchCurrentSceneUris(["shared", "new-layer"], prefetch, () => true, completed, inFlight)
  assert.deepEqual(started, ["shared"])
  oldAvatarCurrent = false
  finish?.(true)
  await Promise.all([oldRun, newRun])
  assert.deepEqual(started, ["shared", "new-layer"])
  assert.equal(inFlight.size, 0)
})

test("a new warmup adopts a queued URI before the stale generation's no-op runs", async () => {
  let finishBlocker: ((value: boolean) => void) | undefined
  let active = 0
  const started: string[] = []
  const lane = createSequentialPrefetchLane((uri) => {
    active += 1
    assert.equal(active, 1)
    started.push(uri)
    if (uri === "blocker") {
      return new Promise<boolean>((resolve) => {
        finishBlocker = (value) => {
          active -= 1
          resolve(value)
        }
      })
    }
    return Promise.resolve(true).finally(() => { active -= 1 })
  })
  const completed = new Set<string>()
  const inFlight = new Map<string, Promise<boolean>>()
  const blocker = lane("blocker", () => true)
  await Promise.resolve()

  let oldGenerationCurrent = true
  const oldRun = prefetchCurrentSceneUris(
    ["shared-avatar-layer"],
    (uri) => lane(uri, () => oldGenerationCurrent),
    () => oldGenerationCurrent,
    completed,
    inFlight
  )
  oldGenerationCurrent = false
  const newRun = prefetchCurrentSceneUris(
    ["shared-avatar-layer"],
    (uri) => lane(uri, () => true),
    () => true,
    completed,
    inFlight
  )

  finishBlocker?.(true)
  await Promise.all([blocker, oldRun, newRun])

  assert.deepEqual(started, ["blocker", "shared-avatar-layer"])
  assert.equal(completed.has("shared-avatar-layer"), true)
  assert.equal(inFlight.size, 0)
  assert.equal(active, 0)
})

test("a selected Shop preview jumps queued background assets and stale selections are skipped", async () => {
  let finishBlocker: ((value: boolean) => void) | undefined
  let active = 0
  const started: string[] = []
  const lane = createPrioritySequentialPrefetchLane((uri) => {
    active += 1
    assert.equal(active, 1, "prefetch remains serialized")
    started.push(uri)
    if (uri === "blocker") {
      return new Promise<boolean>((resolve) => {
        finishBlocker = (value) => {
          active -= 1
          resolve(value)
        }
      })
    }
    return Promise.resolve(true).finally(() => { active -= 1 })
  })

  const blocker = lane("blocker", () => true, "background")
  await Promise.resolve()
  const background = lane("not-selected", () => true, "background")
  let staleSelectionIsCurrent = true
  const staleSelection = lane("old-product-layer", () => staleSelectionIsCurrent, "selected")
  staleSelectionIsCurrent = false
  const selected = lane("new-product-layer", () => true, "selected")

  finishBlocker?.(true)
  assert.deepEqual(await Promise.all([blocker, background, staleSelection, selected]), [true, true, false, true])
  assert.deepEqual(started, ["blocker", "new-product-layer", "not-selected"])
  assert.equal(active, 0)
})

test("a selected request promotes and adopts an identical queued URI without a duplicate prefetch", async () => {
  let finishBlocker: ((value: boolean) => void) | undefined
  const started: string[] = []
  const lane = createPrioritySequentialPrefetchLane((uri) => {
    started.push(uri)
    if (uri === "blocker") return new Promise<boolean>((resolve) => { finishBlocker = resolve })
    return Promise.resolve(true)
  })

  const blocker = lane("blocker", () => true, "background")
  await Promise.resolve()
  let staleOwner = true
  const queuedBackground = lane("same-product-layer", () => staleOwner, "background")
  const promotedSelection = lane("same-product-layer", () => true, "selected")
  staleOwner = false
  assert.equal(promotedSelection, queuedBackground)

  finishBlocker?.(true)
  assert.deepEqual(await Promise.all([blocker, queuedBackground, promotedSelection]), [true, true, true])
  assert.deepEqual(started, ["blocker", "same-product-layer"])
})

test("selected preview publication is latest-only, transient, and unsubscribe-safe", () => {
  const received: { generation: number; sources: readonly unknown[] }[] = []
  const unsubscribe = subscribeToSelectedShopPreviewWarmup((request) => received.push(request))
  const first = publishSelectedShopPreviewWarmup([{ uri: "asset-a" }])
  const second = publishSelectedShopPreviewWarmup([])
  unsubscribe()
  publishSelectedShopPreviewWarmup([{ uri: "asset-b" }])

  assert.deepEqual(received.map((request) => request.sources), [[{ uri: "asset-a" }], []])
  assert.ok(second > first)
  assert.equal(received[1]?.generation, second)
})

test("selected admission enforces the session's decoded-byte budget", () => {
  const session = createWarmupSessionBudget(2, 400)
  assert.equal(admitWarmupUri("stale", { width: 10, height: 10 }, session), true)
  assert.equal(admitWarmupUri("stale", { width: 10, height: 10 }, session), true)
  assert.equal(session.seenUris.has("stale"), false, "admission is a reservation until native success")
  assert.equal(session.reservedUris.has("stale"), true)
  assert.equal(admitWarmupUri("next", { width: 10, height: 10 }, session), false)
  assert.equal(admitWarmupUri("unknown", undefined, session), false)
  settleWarmupUri("stale", false, session)
  assert.deepEqual([...session.seenUris], [])
  assert.equal(session.reservedUris.size, 0)
  assert.equal(admitWarmupUri("replacement", { width: 10, height: 10 }, session), true)
  settleWarmupUri("replacement", true, session)
  assert.deepEqual([...session.seenUris], ["replacement"])
  assert.equal(session.estimatedDecodedBytes, 400)
})

test("a stale queued selection consumes no session budget before the current selection starts", async () => {
  let finishBlocker: ((accepted: boolean) => void) | undefined
  const session = createWarmupSessionBudget(2, 800)
  const started: string[] = []
  const lane = createPrioritySequentialPrefetchLane((uri, isCurrent) => {
    if (!isCurrent()) return Promise.resolve(false)
    started.push(uri)
    if (uri === "blocker") return new Promise<boolean>((resolve) => { finishBlocker = resolve })
    return Promise.resolve(true)
  }, {
    onNativeStart: (uri) => admitWarmupUri(uri, { width: 10, height: 10 }, session),
    onNativeSettled: (uri, accepted) => settleWarmupUri(uri, accepted, session)
  })

  const blocker = lane("blocker", () => true, "background")
  await Promise.resolve()
  let staleSelectionCurrent = true
  const staleSelection = lane("stale-selection", () => staleSelectionCurrent, "selected")
  staleSelectionCurrent = false
  const currentSelection = lane("current-selection", () => true, "selected")
  finishBlocker?.(true)

  assert.deepEqual(await Promise.all([blocker, staleSelection, currentSelection]), [true, false, true])
  assert.deepEqual(started, ["blocker", "current-selection"])
  assert.deepEqual([...session.seenUris], ["blocker", "current-selection"])
  assert.equal(session.reservedUris.size, 0)
  assert.equal(session.estimatedDecodedBytes, 800)
})

test("normal native prefetch has a logical deadline; timeout retains budget and late success cannot complete a stale generation", async () => {
  const timers = createManualTimers()
  const session = createWarmupSessionBudget(2, 800)
  const native = deferred<boolean>()
  const completed = new Set<string>()
  const inFlight = new Map<string, Promise<boolean>>()
  let generationCurrent = true
  let nativeStarts = 0
  const lane = createPrioritySequentialPrefetchLane(() => {
    nativeStarts += 1
    return native.promise
  }, {
    logicalDeadlineMs: 50,
    uriCooldownMs: 300,
    now: timers.now,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onNativeStart: (uri) => admitWarmupUri(uri, { width: 10, height: 10 }, session),
    onNativeSettled: (uri, accepted) => settleWarmupUri(uri, accepted, session)
  })

  const run = prefetchCurrentSceneUris(
    ["slow"],
    (uri, priority) => lane(uri, () => generationCurrent, priority),
    () => generationCurrent,
    completed,
    inFlight
  )
  await flushMicrotasks()
  assert.equal(nativeStarts, 1)
  assert.equal(session.estimatedDecodedBytes, 400)
  assert.equal(session.reservedUris.has("slow"), true)

  generationCurrent = false
  timers.advanceBy(49)
  await flushMicrotasks()
  assert.equal(completed.has("slow"), false)
  timers.advanceBy(1)
  await run
  assert.equal(completed.has("slow"), false)
  assert.equal(session.reservedUris.has("slow"), true, "logical timeout is not native cancellation")

  const duringCooldown = await lane("slow", () => true, "selected")
  assert.equal(duringCooldown, false)
  assert.equal(nativeStarts, 1, "timed-out URI is not automatically retried")

  native.resolve(true)
  await flushMicrotasks()
  assert.equal(session.seenUris.has("slow"), true, "late native success remains charged")
  assert.equal(session.reservedUris.has("slow"), false)
  assert.equal(completed.has("slow"), false, "late native completion cannot publish into an old generation")
  timers.advanceBy(1_000)
  assert.equal(nativeStarts, 1, "settlement does not schedule an automatic retry")
})

test("an adopted logical timeout is not retried by stale-generation recovery", async () => {
  const timers = createManualTimers()
  const native = deferred<boolean>()
  let calls = 0
  let oldGenerationCurrent = true
  const lane = createPrioritySequentialPrefetchLane(() => {
    calls += 1
    return native.promise
  }, {
    logicalDeadlineMs: 5_000,
    uriCooldownMs: 30_000,
    now: timers.now,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  })
  const inFlight = new Map<string, Promise<boolean>>()
  const oldRun = prefetchCurrentSceneUris(
    ["timed-out-uri"],
    (uri, priority) => lane(uri, () => oldGenerationCurrent, priority),
    () => oldGenerationCurrent,
    undefined,
    inFlight
  )
  await flushMicrotasks()
  const newRun = prefetchCurrentSceneUris(
    ["timed-out-uri"],
    (uri, priority) => lane(uri, () => true, priority),
    () => true,
    undefined,
    inFlight
  )
  oldGenerationCurrent = false
  timers.advanceBy(4_999)
  await flushMicrotasks()
  assert.equal(calls, 1)
  timers.advanceBy(1)
  await Promise.all([oldRun, newRun])
  assert.equal(calls, 1, "logical timeout is terminal for this attempt, not a retry signal")
  native.resolve(true)
  await flushMicrotasks()
  assert.equal(calls, 1)
})

test("a timed-out normal job permits one selected rescue only; two unfinished native calls pause the queue", async () => {
  const timers = createManualTimers()
  const native = new Map<string, ReturnType<typeof deferred<boolean>>>()
  const started: string[] = []
  let activeNative = 0
  let maximumActiveNative = 0
  const lane = createPrioritySequentialPrefetchLane((uri) => {
    started.push(uri)
    activeNative += 1
    maximumActiveNative = Math.max(maximumActiveNative, activeNative)
    const request = deferred<boolean>()
    native.set(uri, request)
    void request.promise.finally(() => { activeNative -= 1 })
    return request.promise
  }, {
    logicalDeadlineMs: 50,
    uriCooldownMs: 300,
    now: timers.now,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  })

  const normal = lane("stalled-background", () => true, "background")
  await flushMicrotasks()
  const queuedBackground = lane("queued-background", () => true, "background")
  const selectedRescue = lane("selected-rescue", () => true, "selected")
  timers.advanceBy(50)
  assert.equal(await normal, false)
  await flushMicrotasks()
  assert.deepEqual(started, ["stalled-background", "selected-rescue"])

  const skippedAtSaturation = lane("new-after-saturation", () => true, "selected")
  await flushMicrotasks()
  assert.equal(await skippedAtSaturation, false, "a new selected request is skipped while both native calls remain unresolved")
  assert.deepEqual(started, ["stalled-background", "selected-rescue"], "saturated requests do not accumulate in a hidden queue")

  native.get("stalled-background")?.resolve(true)
  await flushMicrotasks()
  assert.equal(started.length, 2, "the remaining rescue still occupies the normal native slot")
  native.get("selected-rescue")?.resolve(true)
  assert.equal(await selectedRescue, true)
  await flushMicrotasks()
  assert.deepEqual(started, ["stalled-background", "selected-rescue", "queued-background"], "work admitted before saturation resumes after native capacity frees")
  native.get("queued-background")?.resolve(true)
  await queuedBackground
  await flushMicrotasks()
  assert.deepEqual(started, ["stalled-background", "selected-rescue", "queued-background"], "the skipped URI was not retained for later execution")

  const retriedAfterCapacity = lane("new-after-saturation", () => true, "selected")
  await flushMicrotasks()
  assert.deepEqual(started, ["stalled-background", "selected-rescue", "queued-background", "new-after-saturation"])
  native.get("new-after-saturation")?.resolve(true)
  assert.equal(await retriedAfterCapacity, true, "the URI can be requested normally after native capacity returns")
  assert.equal(maximumActiveNative, 2)
})

test("rapid selections cannot grow an unbounded queued warmup backlog", async () => {
  const firstNative = deferred<boolean>()
  const started: string[] = []
  const lane = createPrioritySequentialPrefetchLane((uri) => {
    started.push(uri)
    return uri === "first" ? firstNative.promise : Promise.resolve(true)
  })
  const first = lane("first", () => true)
  let oldGenerationCurrent = true
  const queued = Array.from({ length: 32 }, (_, index) =>
    lane(`old-${index}`, () => oldGenerationCurrent, "selected"))
  assert.equal(await lane("over-cap", () => true, "selected"), false)
  assert.deepEqual(started, ["first"])

  oldGenerationCurrent = false
  const fresh = lane("fresh", () => true, "selected")
  assert.deepEqual(await Promise.all(queued), Array(32).fill(false))
  firstNative.resolve(true)
  assert.equal(await first, true)
  assert.equal(await fresh, true)
  assert.deepEqual(started, ["first", "fresh"])
})

test("cancellation before native start consumes no budget and a settled native failure releases its reservation", async () => {
  const session = createWarmupSessionBudget(1, 400)
  const firstNative = deferred<boolean>()
  const started: string[] = []
  const lane = createPrioritySequentialPrefetchLane((uri) => {
    started.push(uri)
    return uri === "first" ? firstNative.promise : Promise.resolve(true)
  }, {
    onNativeStart: (uri) => admitWarmupUri(uri, { width: 10, height: 10 }, session),
    onNativeSettled: (uri, accepted) => settleWarmupUri(uri, accepted, session)
  })

  const first = lane("first", () => true)
  await flushMicrotasks()
  let canceled = false
  const skipped = lane("canceled-before-start", () => !canceled)
  canceled = true
  firstNative.resolve(false)
  assert.equal(await first, false)
  assert.equal(await skipped, false)
  assert.deepEqual(started, ["first"])
  assert.equal(session.estimatedDecodedBytes, 0)
  assert.equal(session.seenUris.size, 0)
  assert.equal(session.reservedUris.size, 0)
})

test("background and selected native starts share the same session budget", async () => {
  const session = createWarmupSessionBudget(1, 400)
  const started: string[] = []
  const lane = createPrioritySequentialPrefetchLane(async (uri) => {
    started.push(uri)
    return true
  }, {
    onNativeStart: (uri) => admitWarmupUri(uri, { width: 10, height: 10 }, session),
    onNativeSettled: (uri, accepted) => settleWarmupUri(uri, accepted, session)
  })
  assert.equal(await lane("background-asset", () => true, "background"), true)
  assert.equal(await lane("selected-asset", () => true, "selected"), false)
  assert.deepEqual(started, ["background-asset"])
  assert.deepEqual([...session.seenUris], ["background-asset"])
  assert.equal(session.estimatedDecodedBytes, 400)
})

test("an adopted current-generation prefetch failure is not immediately retried", async () => {
  const inFlight = new Map<string, Promise<boolean>>()
  let finish: ((value: boolean) => void) | undefined
  let calls = 0
  const prefetch = () => {
    calls += 1
    return new Promise<boolean>((resolve) => { finish = resolve })
  }
  const firstRun = prefetchCurrentSceneUris(["failed-uri"], prefetch, () => true, undefined, inFlight)
  const secondRun = prefetchCurrentSceneUris(["failed-uri"], prefetch, () => true, undefined, inFlight)

  finish?.(false)
  await Promise.all([firstRun, secondRun])

  assert.equal(calls, 1)
  assert.equal(inFlight.size, 0)
})
