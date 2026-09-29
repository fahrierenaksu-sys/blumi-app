import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"
import { canEditRoomV2Decor } from "./roomV2EditGate"
import { readPersonalRoomSyncMetadata, resolvePersonalRoomHydration } from "./personalRoomDecorSyncModel"
import type { PersonalRoomDecorSnapshot, SavePersonalRoomDecorResult } from "./personalRoomDecorApi"
import type { UserRoomDecor } from "./roomV2.types"
import { createReconnectTransitionTracker } from "../realtime/reconnectTransitionTracker"
import type { RealtimeConnectionStatus } from "../realtime/realtimeClient"

const decor = (roomShellId: string): UserRoomDecor => ({ roomShellId, placedItems: [] })
const snapshot = (revision: number, room: UserRoomDecor): PersonalRoomDecorSnapshot => ({
  userId: "fixture-owner", revision, decor: room, updatedAt: "2026-09-29T00:00:00.000Z"
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Render the actual provider with deterministic hooks, timers and deferred I/O.
// This exercises effect dependencies/cleanup as well as callback bodies, without
// loading native assets or touching storage/network outside this fixture.
function providerFixture(options?: {
  cache?: Map<string, string>
  server?: PersonalRoomDecorSnapshot
}) {
  const file = resolve(process.cwd().endsWith("apps/mobile") ? "src" : "apps/mobile/src",
    "features/roomV2/state/RoomV2Provider.tsx")
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  type Slot = { value?: any; deps?: readonly unknown[]; cleanup?: () => void }
  const slots: Slot[] = [], effects: { slot: Slot; run: () => void | (() => void) }[] = []
  let index = 0, dirty = false, mounted = true, output: any
  let token = "fixture-a", scope = "fixture-owner", server = options?.server ?? snapshot(5, decor("base"))
  let realtimeStatus: RealtimeConnectionStatus = "connected"
  const realtimeStatusListeners = new Set<(status: RealtimeConnectionStatus) => void>()
  const cache = new Map<string, string>(options?.cache ?? [
    [scope, JSON.stringify(server.decor)],
    [`${scope}:server-sync`, JSON.stringify({ revision: 5, decorJson: JSON.stringify(server.decor) })]
  ])
  const cacheWrites: [string, string][][] = [], stateWrites: unknown[] = [], timers = new Map<number, () => void>()
  let timerId = 0, nextCacheGate: ReturnType<typeof deferred<void>> | undefined
  let localReadCount = 0
  const localReadGates: ReturnType<typeof deferred<any>>[] = []
  const reads: { token: string; signal?: AbortSignal }[] = []
  const readGates: ReturnType<typeof deferred<PersonalRoomDecorSnapshot | null>>[] = []
  const saves: {
    token: string; input: { expectedRevision: number; decor: UserRoomDecor };
    result: ReturnType<typeof deferred<SavePersonalRoomDecorResult>>
  }[] = []
  const same = (left?: readonly unknown[], right?: readonly unknown[]) =>
    Boolean(left && right && left.length === right.length && left.every((v, i) => Object.is(v, right[i])))
  const slot = () => slots[index++] ?? (slots[index - 1] = {})
  const useMemo = (work: () => any, deps: readonly unknown[]) => {
    const current = slot()
    if (!same(current.deps, deps)) { current.value = work(); current.deps = deps }
    return current.value
  }
  const ownedItems: string[] = []
  const react = {
    createContext: () => ({ Provider: "provider" }), useContext: () => null,
    useState: (initial: any) => {
      const current = slot()
      if (!("value" in current)) current.value = typeof initial === "function" ? initial() : initial
      return [current.value, (next: any) => {
        stateWrites.push(next)
        const value = typeof next === "function" ? next(current.value) : next
        if (!Object.is(value, current.value)) { current.value = value; dirty = true }
      }]
    },
    useRef: (initial: any) => { const current = slot(); return current.value ??= { current: initial } },
    useMemo, useCallback: (callback: any, deps: readonly unknown[]) => {
      const current = slot()
      if (!same(current.deps, deps)) { current.value = callback; current.deps = deps }
      return current.value
    },
    useEffect: (run: () => void | (() => void), deps: readonly unknown[]) => {
      const current = slot()
      if (!same(current.deps, deps)) { current.deps = deps; effects.push({ slot: current, run }) }
    }
  }
  const writeCache = async (entries: [string, string][]) => {
    cacheWrites.push(entries)
    const gate = nextCacheGate
    nextCacheGate = undefined
    if (gate) await gate.promise
    for (const [key, value] of entries) cache.set(key, value)
  }
  const modules: Record<string, unknown> = {
    react,
    "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }) },
    "@react-native-async-storage/async-storage": {
      getItem: async (key: string) => cache.get(key) ?? null,
      setItem: async (key: string, value: string) => writeCache([[key, value]]), multiSet: writeCache
    },
    "../../persistence/accountScopedStorage": {
      loadAccountScopedStorage: async (input: { entries: { scopedKey: string }[] }) => {
        localReadCount += 1
        const gate = localReadGates.shift()
        return gate ? gate.promise : {
          status: "ready", rawValues: input.entries.map((entry) => cache.get(entry.scopedKey) ?? null)
        }
      }
    },
    "../roomV2.mock": { DEFAULT_ROOM_V2_SHELL_ID: "default" },
    "../../realtime/globalRealtimeProvider": {
      getGlobalStatus: () => realtimeStatus,
      subscribeToStatus: (listener: (status: RealtimeConnectionStatus) => void) => {
        realtimeStatusListeners.add(listener)
        return () => realtimeStatusListeners.delete(listener)
      }
    },
    "../../realtime/reconnectTransitionTracker": { createReconnectTransitionTracker },
    "../../inventory/inventoryStore": { useInventoryStore: () => ({
      inventory: { ownedRoomItemIds: ownedItems }, isReady: true
    }) },
    "../roomV2Persistence": {
      LEGACY_ROOM_V2_DECOR_STORAGE_KEY: "legacy",
      readStoredRoomV2Decor: (raw: string | null) => raw
        ? { status: "ready", decor: JSON.parse(raw) } : { status: "missing" }
    },
    "../roomV2EditGate": { canEditRoomV2Decor },
    "../roomV2ExistingDecorEditGate": { isRoomV2ExistingDecorOnlyEdit: () => true },
    "../roomV2DecorActions": { selectRoomV2Shell: (room: UserRoomDecor, id: string) => ({ ...room, roomShellId: id }) },
    "../roomV2ProviderRuntime": { resolveRoomV2ProviderRuntimeConfig: (input: { storageScopeId: string }) => ({
      storageKey: input.storageScopeId, migrationMarkerKey: "migration", ownedRoomItemIds: ownedItems,
      inventoryReadyForRoomEdits: true
    }) },
    "../personalRoomDecorApi": {
      fetchPersonalRoomDecor: async (_url: string, sessionToken: string, _fetch: unknown, signal?: AbortSignal) => {
        reads.push({ token: sessionToken, signal })
        const gate = readGates.shift()
        return gate ? gate.promise : structuredClone(server)
      },
      savePersonalRoomDecor: async (_url: string, sessionToken: string, input: { expectedRevision: number; decor: UserRoomDecor }) => {
        const result = deferred<SavePersonalRoomDecorResult>()
        saves.push({ token: sessionToken, input, result })
        return result.promise
      }
    },
    "../personalRoomDecorSyncModel": { readPersonalRoomSyncMetadata, resolvePersonalRoomHydration },
    "../roomV2PersistenceErrorCopy": { getRoomV2PersistenceErrorMessageForDisplay: () => "Safe failure" }
  }
  const module = { exports: {} as any }
  vm.runInNewContext(code, {
    module, exports: module.exports, require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`)
      return modules[name]
    }, Error, AbortController, JSON, Promise, __DEV__: false,
    fetch: () => { throw new Error("Real network forbidden") },
    setTimeout: (run: () => void) => { timers.set(++timerId, run); return timerId },
    clearTimeout: (id: number) => timers.delete(id)
  })
  function render() {
    if (!mounted) return
    dirty = false; index = 0
    output = module.exports.RoomV2Provider({ children: null, storageScopeId: scope,
      requireServerInventory: true, baseHttpUrl: "https://fixture.invalid", serverSessionToken: token })
    const pending = effects.splice(0)
    for (const entry of pending) entry.slot.cleanup?.()
    for (const entry of pending) entry.slot.cleanup = entry.run() || undefined
  }
  async function settle() {
    for (let i = 0; i < 8; i += 1) {
      await new Promise<void>((yes) => setImmediate(yes))
      if (dirty && mounted) render()
    }
  }
  render()
  return {
    settle, saves, reads, cache, cacheWrites, stateWrites,
    localReadCount: () => localReadCount,
    value: () => output.props.value as any,
    rotate: () => { token = `${token}-rotated`; render() },
    changeScope: () => { scope = "fixture-other-owner"; render() },
    setServer: (next: PersonalRoomDecorSnapshot) => { server = next },
    delayRead: () => { const gate = deferred<PersonalRoomDecorSnapshot | null>(); readGates.push(gate); return gate },
    delayLocalRead: () => { const gate = deferred<any>(); localReadGates.push(gate); return gate },
    delayCache: () => { const gate = deferred<void>(); nextCacheGate = gate; return gate },
    fireTimers: () => { for (const [id, run] of [...timers]) { timers.delete(id); run() } },
    emitRealtimeStatus: (status: RealtimeConnectionStatus) => {
      realtimeStatus = status
      for (const listener of [...realtimeStatusListeners]) listener(status)
    },
    realtimeStatusListenerCount: () => realtimeStatusListeners.size,
    unmount: () => { mounted = false; for (const current of slots) current.cleanup?.() }
  }
}

test("production room retries one same-owner hydration on reconnect and keeps a pending draft", async () => {
  const f = providerFixture()
  await f.settle()
  assert.equal(f.reads.length, 1)
  assert.equal(f.realtimeStatusListenerCount(), 1)

  assert.equal(f.value().setUserRoomDecor(decor("pending-room-draft")), true)
  await f.settle()
  f.emitRealtimeStatus("connected")
  await f.settle()
  assert.equal(f.reads.length, 1, "duplicate connected status must not retry hydration")

  f.emitRealtimeStatus("reconnecting")
  f.emitRealtimeStatus("connected")
  await f.settle()

  assert.equal(f.reads.length, 2, "one reconnect must trigger one authenticated room GET")
  assert.equal(f.value().userRoomDecor.roomShellId, "pending-room-draft")
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "base")
  assert.equal(f.value().persistenceState, "ready")
  assert.equal(f.realtimeStatusListenerCount(), 1, "rerenders must not duplicate the account/token subscription")
  f.unmount()
  assert.equal(f.realtimeStatusListenerCount(), 0, "unmount must clean up the reconnect subscription")
})

test("initial room GET starts alongside local decor read after hydration drains", async () => {
  const cachedDecor = decor("server-room")
  const f = providerFixture({
    cache: new Map([
      ["fixture-owner", JSON.stringify(cachedDecor)],
      ["fixture-owner:server-sync", JSON.stringify({
        revision: 5,
        decorJson: JSON.stringify(cachedDecor)
      })]
    ]),
    server: snapshot(5, decor("server-room"))
  })
  const localRead = f.delayLocalRead()
  const serverRead = f.delayRead()

  await f.settle()

  assert.equal(f.localReadCount(), 1, "the local decor read should have started")
  assert.equal(f.reads.length, 1, "the authenticated GET should not wait for local storage")
  assert.equal(f.value().persistenceState, "loading")
  assert.equal(f.value().userRoomDecor.roomShellId, "default")

  localRead.resolve({ status: "ready", rawValues: [JSON.stringify(cachedDecor)], migrated: false })
  await f.settle()
  assert.equal(f.value().persistenceState, "loading", "neither read alone resolves authority")
  assert.equal(f.value().userRoomDecor.roomShellId, "default")

  serverRead.resolve(snapshot(5, decor("server-room")))
  await f.settle()
  assert.equal(f.value().userRoomDecor.roomShellId, "server-room")
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "server-room")
  assert.equal(f.value().persistenceState, "ready")
  assert.equal(f.saves.length, 0, "parallel hydration must not turn cache data into a write")
  f.unmount()
})

test("rotation waits for obsolete autosave, rereads authority and preserves newer pending edit", async () => {
  const f = providerFixture()
  await f.settle()
  f.value().setUserRoomDecor(decor("first-edit"))
  await f.settle(); f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 1)
  f.value().setUserRoomDecor(decor("newer-edit"))
  await f.settle()
  const reads = f.reads.length
  f.rotate(); await f.settle()
  assert.equal(f.reads.length, reads)
  f.rotate(); await f.settle()
  assert.equal(f.reads.length, reads)
  f.setServer(snapshot(6, decor("first-edit")))
  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("first-edit")) })
  await f.settle()
  assert.equal(f.value().userRoomDecor.roomShellId, "newer-edit")
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "first-edit")
  assert.equal(f.value().persistenceState, "ready")
  f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 2)
  assert.equal(f.saves[1].input.expectedRevision, 6)
  assert.equal(f.saves[1].input.decor.roomShellId, "newer-edit")
  f.saves[1].result.resolve({ kind: "saved", snapshot: snapshot(7, decor("newer-edit")) })
  await f.settle()
  assert.equal(JSON.parse(f.cache.get("fixture-owner:server-sync")!).revision, 7)
  f.unmount()
})

test("newer server revision stays canonical while an obsolete autosave's newer draft remains conflicted", async () => {
  const f = providerFixture()
  await f.settle()
  f.value().setUserRoomDecor(decor("first-edit"))
  await f.settle(); f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 1)
  f.value().setUserRoomDecor(decor("newer-edit"))
  await f.settle()
  f.rotate(); await f.settle()
  f.setServer(snapshot(9, decor("remote-room")))
  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("first-edit")) })
  await f.settle()
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "remote-room")
  assert.equal(f.value().userRoomDecor.roomShellId, "newer-edit")
  assert.equal(f.value().persistenceState, "failed")
  f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 1)
  assert.equal(JSON.parse(f.cache.get("fixture-owner:server-sync")!).revision, 9)
  assert.equal(JSON.parse(f.cache.get("fixture-owner")!).roomShellId, "newer-edit")
  f.unmount()
})

for (const kind of ["saved", "error"] as const) {
  test(`obsolete explicit save ${kind} cannot overwrite fresh hydration or its cache`, async () => {
    const f = providerFixture()
    await f.settle()
    const saving = f.value().saveUserRoomDecorConfirmed(decor("editor-draft"))
    await f.settle()
    f.rotate(); await f.settle()
    f.setServer(snapshot(9, decor("external-server-room")))
    if (kind === "saved") f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("editor-draft")) })
    else f.saves[0].result.reject(new Error("Request outcome unknown"))
    assert.equal((await saving).status, "failed")
    await f.settle()
    assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "external-server-room")
    assert.equal(f.value().userRoomDecor.roomShellId, "external-server-room")
    assert.equal(f.value().persistenceState, "ready")
    f.fireTimers(); await f.settle()
    assert.equal(f.saves.length, 1)
    assert.equal(JSON.parse(f.cache.get("fixture-owner:server-sync")!).revision, 9)
    assert.equal(JSON.parse(f.cache.get("fixture-owner")!).roomShellId, "external-server-room")
    f.unmount()
  })
}

test("started cache write drains before new hydration and stale cache errors cannot fail it", async () => {
  const f = providerFixture()
  await f.settle()
  const saving = f.value().saveUserRoomDecorConfirmed(decor("editor-draft"))
  await f.settle()
  const cacheGate = f.delayCache()
  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("editor-draft")) })
  await f.settle()
  const reads = f.reads.length
  const localReads = f.localReadCount()
  f.setServer(snapshot(9, decor("fresh-server")))
  f.rotate(); await f.settle()
  assert.equal(f.reads.length, reads)
  assert.equal(f.localReadCount(), localReads, "new local reads must also wait for the old cache write")
  cacheGate.reject(new Error("Old cache write failed"))
  assert.equal((await saving).status, "failed")
  await f.settle()
  assert.equal(f.localReadCount(), localReads + 1)
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "fresh-server")
  assert.equal(JSON.parse(f.cache.get("fixture-owner:server-sync")!).revision, 9)
  f.unmount()
})

test("same-owner refresh after explicit save response never replays pre-save decor", async () => {
  const f = providerFixture()
  await f.settle()

  const cacheGate = f.delayCache()
  const saving = f.value().saveUserRoomDecorConfirmed(decor("explicit-new"))
  await f.settle()
  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("explicit-new")) })
  await f.settle()

  // The server has committed revision 6, but its AsyncStorage write is still
  // pending. Rotating a same-owner token must hydrate from that commit, not O.
  f.setServer(snapshot(6, decor("explicit-new")))
  f.rotate()
  await f.settle()
  cacheGate.resolve()

  const saveResult = await saving
  await f.settle()
  const visibleAfterRefresh = f.value().userRoomDecor.roomShellId
  f.fireTimers()
  await f.settle()
  const staleReplay = f.saves[1]?.input.decor.roomShellId
  f.unmount()
  f.saves[1]?.result.reject(new Error("Unexpected stale replay"))
  await f.settle()

  assert.equal(saveResult.status, "failed", "the explicit call belongs to the superseded hydration generation")
  assert.equal(visibleAfterRefresh, "explicit-new")
  assert.equal(staleReplay, undefined, "the pre-save room must never be autosaved over revision 6")
})

test("queued autosave snapshot cannot overwrite a newer explicit commit", async () => {
  const f = providerFixture()
  await f.settle()

  // Hold the local write for an older provider snapshot. The explicit editor
  // save can complete while this autosave continuation is still queued.
  const autosaveCacheGate = f.delayCache()
  assert.equal(f.value().setUserRoomDecor(decor("queued-old")), true)
  await f.settle()
  const saving = f.value().saveUserRoomDecorConfirmed(decor("explicit-new"))
  await f.settle()
  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("explicit-new")) })
  await f.settle()
  autosaveCacheGate.resolve()

  const saveResult = await saving
  f.fireTimers()
  await f.settle()
  const staleFollowup = f.saves[1]?.input.decor.roomShellId
  const visibleAfterCommit = f.value().userRoomDecor.roomShellId
  const cachedAfterCommit = JSON.parse(f.cache.get("fixture-owner")!).roomShellId
  f.unmount()
  f.saves[1]?.result.reject(new Error("Unexpected stale autosave"))
  await f.settle()

  assert.equal(saveResult.status, "saved")
  assert.equal(visibleAfterCommit, "explicit-new")
  assert.equal(cachedAfterCommit, "explicit-new", "an older queued snapshot must not replace the committed local cache")
  assert.equal(staleFollowup, undefined, "an older queued cache snapshot must not be sent after the explicit commit")
})

test("latest local edit made during explicit save survives and follows its committed revision", async () => {
  const f = providerFixture()
  await f.settle()

  const saving = f.value().saveUserRoomDecorConfirmed(decor("explicit-new"))
  await f.settle()
  assert.equal(f.value().setUserRoomDecor(decor("latest-unsaved")), true)
  await f.settle()
  f.fireTimers() // The autosave can queue while the explicit request is in flight.

  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("explicit-new")) })
  assert.equal((await saving).status, "saved")
  await f.settle()
  assert.equal(f.value().userRoomDecor.roomShellId, "latest-unsaved")

  f.fireTimers()
  await f.settle()
  assert.equal(f.saves.length, 2)
  assert.equal(f.saves[1].input.expectedRevision, 6)
  assert.equal(f.saves[1].input.decor.roomShellId, "latest-unsaved")
  f.saves[1].result.resolve({ kind: "saved", snapshot: snapshot(7, decor("latest-unsaved")) })
  await f.settle()
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "latest-unsaved")
  f.unmount()
})

test("owner switch during acknowledged-save cache write keeps the new account isolated", async () => {
  const f = providerFixture()
  await f.settle()

  const cacheGate = f.delayCache()
  const saving = f.value().saveUserRoomDecorConfirmed(decor("owner-a-commit"))
  await f.settle()
  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("owner-a-commit")) })
  await f.settle()

  f.setServer({ ...snapshot(1, decor("owner-b-room")), userId: "fixture-other-owner" })
  f.changeScope()
  await f.settle()
  assert.equal(f.value().userRoomDecor.roomShellId, "default")
  cacheGate.resolve()

  assert.equal((await saving).status, "failed")
  await f.settle()
  assert.equal(f.value().userRoomDecor.roomShellId, "owner-b-room")
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "owner-b-room")
  assert.equal(f.cache.get("fixture-owner"), JSON.stringify(decor("owner-a-commit")))
  assert.notEqual(f.cache.get("fixture-other-owner"), JSON.stringify(decor("owner-a-commit")))
  f.unmount()
})

test("unmount drops late explicit save success/error without state or cache publication", async () => {
  for (const failure of [false, true]) {
    const f = providerFixture()
    await f.settle()
    const saving = f.value().saveUserRoomDecorConfirmed(decor("draft"))
    await f.settle()
    f.unmount()
    const writes = f.cacheWrites.length, updates = f.stateWrites.length
    if (failure) f.saves[0].result.reject(new Error("Late failure"))
    else f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("draft")) })
    assert.equal((await saving).status, "failed")
    await f.settle()
    assert.equal(f.cacheWrites.length, writes)
    assert.equal(f.stateWrites.length, updates)
  }
})

test("same-commit room edit survives token refresh when its cache write has not drained", async () => {
  const f = providerFixture()
  await f.settle()

  const cacheWrite = f.delayCache()
  const refreshRead = f.delayRead()
  assert.equal(f.value().setUserRoomDecor(decor("same-commit-draft")), true)
  f.rotate()
  await f.settle()

  assert.equal(f.reads.at(-1)?.token, "fixture-a-rotated")
  assert.equal(f.value().persistenceState, "ready")
  assert.equal(f.value().userRoomDecor.roomShellId, "same-commit-draft")

  refreshRead.resolve(snapshot(5, decor("base")))
  await f.settle()
  assert.equal(f.value().persistenceState, "ready")
  assert.equal(f.value().userRoomDecor.roomShellId, "same-commit-draft")

  cacheWrite.resolve()
  await f.settle()
  f.fireTimers()
  await f.settle()
  assert.equal(f.saves.length, 1)
  assert.equal(f.saves[0].input.decor.roomShellId, "same-commit-draft")
  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("same-commit-draft")) })
  await f.settle()
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "same-commit-draft")
  f.unmount()
})

test("room edit accepted during same-owner refresh is retained and saved instead of falsely succeeding", async () => {
  const f = providerFixture()
  await f.settle()

  const refreshRead = f.delayRead()
  f.rotate()
  await f.settle()
  assert.equal(f.value().persistenceState, "ready")
  assert.equal(f.value().userRoomDecor.roomShellId, "base")

  assert.equal(f.value().setUserRoomDecor(decor("during-refresh-edit")), true)
  await f.settle()
  assert.equal(f.value().userRoomDecor.roomShellId, "during-refresh-edit")
  refreshRead.resolve(snapshot(5, decor("base")))
  await f.settle()

  assert.equal(f.value().persistenceState, "ready")
  assert.equal(f.value().userRoomDecor.roomShellId, "during-refresh-edit")
  f.fireTimers()
  await f.settle()
  assert.equal(f.saves.length, 1)
  assert.equal(f.saves[0].input.decor.roomShellId, "during-refresh-edit")
  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(6, decor("during-refresh-edit")) })
  await f.settle()
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "during-refresh-edit")
  f.unmount()
})

test("same-owner refresh with newer server revision retains the live draft as an explicit conflict", async () => {
  const f = providerFixture()
  await f.settle()
  const refreshRead = f.delayRead()
  f.rotate(); await f.settle()
  assert.equal(f.value().setUserRoomDecor(decor("latest-draft")), true)
  await f.settle()
  refreshRead.resolve(snapshot(9, decor("remote-canonical")))
  await f.settle()

  assert.equal(f.value().userRoomDecor.roomShellId, "latest-draft")
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "remote-canonical")
  assert.equal(f.value().persistenceState, "failed")
  assert.equal(JSON.parse(f.cache.get("fixture-owner")!).roomShellId, "latest-draft")
  f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 0, "a conflict must not silently overwrite remote revision 9")

  const retry = f.value().saveUserRoomDecorConfirmed(decor("latest-draft"))
  await f.settle()
  assert.equal(f.saves[0].input.expectedRevision, 9)
  f.saves[0].result.resolve({ kind: "saved", snapshot: snapshot(10, decor("latest-draft")) })
  assert.equal((await retry).status, "saved")
  await f.settle(); f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 1, "the unchanged acknowledged decor must not send a duplicate PUT")
  assert.equal(f.value().persistenceState, "ready")
  f.unmount()
})

test("explicit 409 keeps an edit made while saving and waits for user retry", async () => {
  const f = providerFixture()
  await f.settle()
  const saving = f.value().saveUserRoomDecorConfirmed(decor("explicit-old"))
  await f.settle()
  assert.equal(f.value().setUserRoomDecor(decor("latest-draft")), true)
  await f.settle()
  f.saves[0].result.resolve({ kind: "conflict", current: snapshot(9, decor("remote-canonical")) })
  assert.equal((await saving).status, "conflict")
  await f.settle(); f.fireTimers(); await f.settle()

  assert.equal(f.value().userRoomDecor.roomShellId, "latest-draft")
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "remote-canonical")
  assert.equal(f.value().persistenceState, "failed")
  assert.equal(JSON.parse(f.cache.get("fixture-owner")!).roomShellId, "latest-draft")
  assert.equal(f.saves.length, 1, "409 must not start an automatic retry loop")

  const retry = f.value().saveUserRoomDecorConfirmed(decor("latest-draft"))
  await f.settle()
  assert.equal(f.saves[1].input.expectedRevision, 9)
  f.saves[1].result.resolve({ kind: "saved", snapshot: snapshot(10, decor("latest-draft")) })
  assert.equal((await retry).status, "saved")
  await f.settle(); f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 2)
  f.unmount()
})

test("autosave 409 keeps a newer local edit without retrying until explicit confirmation", async () => {
  const f = providerFixture()
  await f.settle()
  assert.equal(f.value().setUserRoomDecor(decor("autosave-old")), true)
  await f.settle(); f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 1)
  assert.equal(f.value().setUserRoomDecor(decor("latest-draft")), true)
  await f.settle()
  f.saves[0].result.resolve({ kind: "conflict", current: snapshot(9, decor("remote-canonical")) })
  await f.settle(); f.fireTimers(); await f.settle()

  assert.equal(f.value().userRoomDecor.roomShellId, "latest-draft")
  assert.equal(f.value().confirmedPersistedRoomDecor.roomShellId, "remote-canonical")
  assert.equal(f.value().persistenceState, "failed")
  assert.equal(JSON.parse(f.cache.get("fixture-owner")!).roomShellId, "latest-draft")
  assert.equal(f.saves.length, 1)

  const retry = f.value().saveUserRoomDecorConfirmed(decor("latest-draft"))
  await f.settle()
  assert.equal(f.saves[1].input.expectedRevision, 9)
  f.saves[1].result.resolve({ kind: "saved", snapshot: snapshot(10, decor("latest-draft")) })
  assert.equal((await retry).status, "saved")
  await f.settle(); f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 2)
  f.unmount()
})

test("conflicted draft survives provider remount without an implicit PUT", async () => {
  const f = providerFixture()
  await f.settle()
  const saving = f.value().saveUserRoomDecorConfirmed(decor("explicit-old"))
  await f.settle()
  f.value().setUserRoomDecor(decor("latest-draft"))
  await f.settle()
  f.saves[0].result.resolve({ kind: "conflict", current: snapshot(9, decor("remote-canonical")) })
  assert.equal((await saving).status, "conflict")
  await f.settle()
  const savedCache = new Map(f.cache)
  f.unmount()

  const reloaded = providerFixture({ cache: savedCache, server: snapshot(9, decor("remote-canonical")) })
  await reloaded.settle(); reloaded.fireTimers(); await reloaded.settle()
  assert.equal(reloaded.value().userRoomDecor.roomShellId, "latest-draft")
  assert.equal(reloaded.value().confirmedPersistedRoomDecor.roomShellId, "remote-canonical")
  assert.equal(reloaded.value().persistenceState, "failed")
  assert.equal(reloaded.saves.length, 0)
  reloaded.unmount()
})

test("a second 409 does not loop and a later explicit retry can still complete", async () => {
  const f = providerFixture()
  await f.settle()
  const first = f.value().saveUserRoomDecorConfirmed(decor("first-save"))
  await f.settle()
  f.value().setUserRoomDecor(decor("latest-draft"))
  await f.settle()
  f.saves[0].result.resolve({ kind: "conflict", current: snapshot(9, decor("remote-one")) })
  assert.equal((await first).status, "conflict")
  await f.settle()
  const second = f.value().saveUserRoomDecorConfirmed(decor("latest-draft"))
  await f.settle()
  assert.equal(f.saves[1].input.expectedRevision, 9)
  f.saves[1].result.resolve({ kind: "conflict", current: snapshot(10, decor("remote-two")) })
  assert.equal((await second).status, "conflict")
  await f.settle(); f.fireTimers(); await f.settle()
  assert.equal(f.value().userRoomDecor.roomShellId, "latest-draft")
  assert.equal(JSON.parse(f.cache.get("fixture-owner")!).roomShellId, "latest-draft")
  assert.equal(JSON.parse(f.cache.get("fixture-owner:server-sync")!).requiresExplicitSave, true)
  assert.equal(f.saves.length, 2)

  const third = f.value().saveUserRoomDecorConfirmed(decor("latest-draft"))
  await f.settle()
  assert.equal(f.saves[2].input.expectedRevision, 10)
  f.saves[2].result.resolve({ kind: "saved", snapshot: snapshot(11, decor("latest-draft")) })
  assert.equal((await third).status, "saved")
  await f.settle(); f.fireTimers(); await f.settle()
  assert.equal(f.saves.length, 3)
  assert.equal(f.value().persistenceState, "ready")
  assert.equal(JSON.parse(f.cache.get("fixture-owner:server-sync")!).requiresExplicitSave, undefined)
  f.unmount()
})

test("owner switch clears the previous room immediately and ignores its late hydration", async () => {
  const f = providerFixture()
  await f.settle()
  assert.equal(f.value().setUserRoomDecor(decor("owner-a-room")), true)
  await f.settle()

  const staleOwnerRead = f.delayRead()
  f.rotate()
  await f.settle()
  const staleRequest = f.reads.at(-1)
  assert.equal(f.value().userRoomDecor.roomShellId, "owner-a-room")

  const newOwnerRead = f.delayRead()
  f.changeScope()
  assert.equal(f.value().persistenceState, "loading")
  assert.equal(f.value().userRoomDecor.roomShellId, "default")
  assert.equal(f.value().confirmedPersistedRoomDecor, undefined)
  await f.settle()
  assert.equal(staleRequest?.signal?.aborted, true)

  staleOwnerRead.resolve(snapshot(9, decor("stale-owner-a-room")))
  await f.settle()
  assert.equal(f.value().userRoomDecor.roomShellId, "default")

  newOwnerRead.resolve(snapshot(1, decor("owner-b-room")))
  await f.settle()
  assert.equal(f.value().persistenceState, "ready")
  assert.equal(f.value().userRoomDecor.roomShellId, "owner-b-room")
  f.unmount()
})
