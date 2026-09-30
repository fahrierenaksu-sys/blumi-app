import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { runInNewContext } from "node:vm"
import { fileURLToPath } from "node:url"
import test from "node:test"

const require = createRequire(import.meta.url)
const ts = require("typescript")
const here = dirname(fileURLToPath(import.meta.url))
const wardrobeFolder = join(here, "../features/avatarV2/wardrobe")
// The screen composes hooks and components from features/avatarV2/wardrobe;
// source-shape contracts read the screen and every module it delegates to.
const screenSource = [
  join(here, "WardrobeV2Screen.tsx"),
  ...readdirSync(wardrobeFolder)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file))
    .sort()
    .map((file) => join(wardrobeFolder, file))
].map((file) => readFileSync(file, "utf8")).join("\n")
const providerSource = readFileSync(
  join(here, "../features/avatarV2/state/AvatarV2Provider.tsx"),
  "utf8"
)
const avatarEquipLifecycleSource = readFileSync(
  join(here, "../features/avatarV2/avatarEquipLifecycle.ts"),
  "utf8"
)
const tryOnSource = readFileSync(
  join(here, "../features/avatarV2/wardrobe/wardrobeTryOn.ts"),
  "utf8"
)
const sourceFile = ts.createSourceFile(
  "wardrobeTryOn.ts",
  tryOnSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
)

function loadScreenHelpers(names) {
  const declarations = names.map((name) => {
    const declaration = sourceFile.statements.find((statement) =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name
    )
    assert.ok(declaration, `expected ${name} to be defined in the wardrobe try-on module`)
    return declaration.getText(sourceFile)
  })
  const compiled = ts.transpileModule(declarations.join("\n"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const context = { exports: {} }
  runInNewContext(compiled, context)
  return context.exports
}

const {
  wardrobeTryOnReducer: reduceTryOn,
  shouldHandleWardrobeTryOnCompletion: shouldHandleCompletion,
  runWardrobeTryOnSave: runTryOnSave,
  queueWardrobeTryOn: queueTryOn,
  clearQueuedWardrobeTryOn: clearQueuedTryOn,
  takeQueuedWardrobeTryOnIfReady: takeQueuedTryOn,
  confirmWardrobeTryOnIfReady: confirmTryOn,
  areWardrobeAvatarSelectionsEqual: avatarsEqual,
  resolveWardrobeTryOnConfirmation,
  shouldReportWardrobeTryOnSuccess,
  reportWardrobeTryOnSuccess,
  rebaseWardrobeTryOnSnapshot
} = loadScreenHelpers([
  "wardrobeTryOnReducer",
  "shouldHandleWardrobeTryOnCompletion",
  "runWardrobeTryOnSave",
  "queueWardrobeTryOn",
  "clearQueuedWardrobeTryOn",
  "takeQueuedWardrobeTryOnIfReady",
  "confirmWardrobeTryOnIfReady",
  "areWardrobeAvatarSelectionsEqual",
  "resolveWardrobeTryOnConfirmation",
  "shouldReportWardrobeTryOnSuccess",
  "reportWardrobeTryOnSuccess",
  "rebaseWardrobeTryOnSnapshot",
  "collectWardrobeTryOnTouches"
])

const originalAvatar = {
  bodyId: "body",
  faceId: "face",
  eyesId: "eyes",
  noseId: "nose",
  mouthId: "mouth",
  hairId: "old-hair",
  topId: "top",
  bottomId: "bottom",
  shoesId: "shoes",
  dressId: null,
  outerwearId: null,
  accessoryIds: []
}
const previewAvatar = { ...originalAvatar, hairId: "owned-new-hair" }
const ownedItem = { id: "owned-new-hair", type: "hair" }

function createHarness() {
  let state = null
  return {
    get state() { return state },
    dispatch(action) { state = reduceTryOn(state, action) }
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function areHookDependenciesEqual(previous, next) {
  return previous?.length === next?.length &&
    previous.every((value, index) => Object.is(value, next[index]))
}

function createProviderHookRuntime() {
  const slots = []
  let cursor = 0
  let scheduledEffects = []

  const react = {
    createContext: () => ({ Provider: "AvatarV2Context.Provider" }),
    useState(initialValue) {
      const index = cursor++
      if (!slots[index]) {
        slots[index] = {
          kind: "state",
          value: typeof initialValue === "function" ? initialValue() : initialValue
        }
      }
      return [
        slots[index].value,
        (nextValue) => {
          const previous = slots[index].value
          slots[index].value = typeof nextValue === "function"
            ? nextValue(previous)
            : nextValue
        }
      ]
    },
    useRef(initialValue) {
      const index = cursor++
      if (!slots[index]) slots[index] = { kind: "ref", current: initialValue }
      return slots[index]
    },
    useMemo(factory, dependencies) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || !areHookDependenciesEqual(previous.dependencies, dependencies)) {
        slots[index] = { kind: "memo", dependencies, value: factory() }
      }
      return slots[index].value
    },
    useCallback(callback, dependencies) {
      return react.useMemo(() => callback, dependencies)
    },
    useEffect(effect, dependencies) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || !areHookDependenciesEqual(previous.dependencies, dependencies)) {
        scheduledEffects.push({ index, effect, dependencies, previous })
      }
    },
    useContext() {
      throw new Error("Context reads are not part of this Provider boundary test")
    }
  }

  function render(Component, props) {
    cursor = 0
    scheduledEffects = []
    const element = Component(props)
    const effects = scheduledEffects
    scheduledEffects = []
    for (const scheduled of effects) {
      scheduled.previous?.cleanup?.()
      const cleanup = scheduled.effect()
      slots[scheduled.index] = {
        kind: "effect",
        dependencies: scheduled.dependencies,
        cleanup
      }
    }
    return element.props.value
  }

  function unmount() {
    for (const slot of slots) slot?.cleanup?.()
  }

  return { react, render, unmount }
}

function transpileCommonJs(source, filename) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText
  const module = { exports: {} }
  runInNewContext(output, {
    exports: module.exports,
    module,
    require: () => ({})
  })
  return module.exports
}

function createAvatarProviderHarness({ storageScopeId = "owner-a", onSaveAvatar } = {}) {
  const hookRuntime = createProviderHookRuntime()
  const lifecycleModule = transpileCommonJs(
    avatarEquipLifecycleSource,
    "avatarEquipLifecycle.ts"
  )
  const mockedReactJsxRuntime = {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props })
  }
  const mockModules = {
    react: hookRuntime.react,
    "react/jsx-runtime": mockedReactJsxRuntime,
    "@react-native-async-storage/async-storage": {
      getItem: async () => null,
      setItem: async () => undefined
    },
    "../avatarV2Catalog": { AVATAR_V2_CATALOG: [] },
    "../../inventory/inventoryStore": {
      useInventoryStore: () => ({ inventory: { ownedAvatarItemIds: [] } })
    },
    "../avatarV2Selectors": {
      canEquipAvatarV2Item: () => true,
      equipAvatarV2Item: (avatar, item) => ({ ...avatar, hairId: item.id }),
      resolveAvatarV2: (avatar) => avatar
    },
    "../qa/avatarQaInventory": {
      createAvatarQaInventory: (ownedItemIds) => ({ ownedItemIds }),
      applyDisposableAvatarEquip: (avatar, item, equip) => equip(avatar, item),
      getAvatarQaPersistencePolicy: () => ({
        allowLocalPersistence: false,
        allowRemotePersistence: true
      }),
      isAvatarQaUnlockEnabled: () => false
    },
    "../../capabilities/capabilityApi": {
      createFailClosedCapabilityResolution: () => ({ capabilities: {} })
    },
    "../avatarV2Persistence": {
      AVATAR_V2_STORAGE_KEY: "avatar",
      getAvatarV2StorageKey: (scopeId) => `avatar:${scopeId}`,
      resolveInitialAvatarV2: () => originalAvatar,
      shouldUseLocalAvatarPersistence: () => false
    },
    "../avatarStarterModel": {
      applyOnboardingStarterBody: (avatar) => avatar,
      shouldRefreshAvatarForStarterChange: (input) =>
        input.previousSelectionRevision !== input.nextSelectionRevision
    },
    "../avatarSelectionModel": {
      loadoutToUserAvatar: (loadout) => loadout,
      normalizeCompleteAvatarSelection: (selection) =>
        selection?.loadout && Number.isInteger(selection.revision) ? selection : null
    },
    "../avatarEquipSave": {
      runAvatarEquipSave: async ({ nextAvatar, save }) => {
        try {
          return { ok: true, saved: await save(nextAvatar) }
        } catch (error) {
          return { ok: false, errorMessage: error.message }
        }
      }
    },
    "../avatarEquipLifecycle": lifecycleModule
  }
  const providerModule = { exports: {} }
  const providerJs = ts.transpileModule(providerSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: "AvatarV2Provider.tsx"
  }).outputText
  runInNewContext(providerJs, {
    exports: providerModule.exports,
    module: providerModule,
    require: (specifier) => {
      assert.ok(mockModules[specifier], `unexpected Provider dependency: ${specifier}`)
      return mockModules[specifier]
    },
    __DEV__: false,
    process: { env: {} },
    AbortController,
    setTimeout,
    clearTimeout
  })

  const Provider = providerModule.exports.AvatarV2Provider
  let currentProps = {
    children: null,
    storageScopeId,
    requireServerInventory: true,
    initialAvatarSelection: { revision: 1, loadout: originalAvatar },
    onSaveAvatar,
    resolvedCapabilities: {}
  }
  const render = () => hookRuntime.render(Provider, currentProps)
  let value = render()
  value = render()

  return {
    get value() { return value },
    rerender() {
      value = render()
      return value
    },
    refreshSelection(selection) {
      currentProps = { ...currentProps, initialAvatarSelection: selection }
      value = render()
      value = render()
      return value
    },
    switchOwner(nextStorageScopeId, selection) {
      currentProps = {
        ...currentProps,
        storageScopeId: nextStorageScopeId,
        initialAvatarSelection: selection
      }
      value = render()
      value = render()
      return value
    },
    unmount: hookRuntime.unmount
  }
}

test("owned item previews immediately and stays pending until the saved avatar is confirmed", async () => {
  assert.match(screenSource, /const displayedAvatar = pendingTryOn\?\.previewAvatar \?\? avatar/)
  assert.match(screenSource, /avatar=\{displayedAvatar\}/)
  const harness = createHarness()
  const saveResponse = deferred()
  const activeRequestRef = { current: null }
  let canonicalAvatar = originalAvatar
  const save = runTryOnSave({
    requestId: 1,
    item: ownedItem,
    pending: { requestId: 1, item: ownedItem, previewAvatar, status: "saving" },
    baselineAvatar: originalAvatar,
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: () => saveResponse.promise
  })

  assert.notEqual(save, null)
  assert.equal(harness.state.status, "saving")
  assert.equal(harness.state.previewAvatar, previewAvatar)
  assert.equal(canonicalAvatar, originalAvatar)
  assert.equal(confirmTryOn({
    avatar: canonicalAvatar,
    isSaving: true,
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "waiting")

  saveResponse.resolve({ ok: true, persistence: "acknowledged", application: "applied" })
  await save
  assert.equal(harness.state.status, "awaiting-confirmation")
  assert.equal(activeRequestRef.current.status, "awaiting-confirmation")
  assert.equal(confirmTryOn({
    avatar: originalAvatar,
    isSaving: false,
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "waiting")
  assert.equal(activeRequestRef.current.status, "awaiting-confirmation")

  canonicalAvatar = previewAvatar
  assert.equal(avatarsEqual(canonicalAvatar, previewAvatar), true)
  assert.equal(confirmTryOn({
    avatar: canonicalAvatar,
    isSaving: false,
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "confirmed")
  assert.equal(harness.state, null)
  assert.equal(activeRequestRef.current, null)
})

test("stale provider ACK is not an applied wardrobe success and releases the exact latest queue", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const queuedRequestRef = { current: null }
  const saveResponse = deferred()
  const latestItem = { id: "latest-top", type: "top" }
  const latestAvatar = { ...previewAvatar, topId: latestItem.id }
  let canonicalAvatar = originalAvatar
  let isSaving = true
  const save = runTryOnSave({
    requestId: 30,
    item: ownedItem,
    pending: { requestId: 30, item: ownedItem, previewAvatar, status: "saving" },
    baselineAvatar: originalAvatar,
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: () => saveResponse.promise
  })
  queueTryOn({
    pending: { requestId: 31, item: latestItem, previewAvatar: latestAvatar, status: "saving" },
    activeRequestRef,
    queuedRequestRef,
    dispatch: (action) => harness.dispatch(action)
  })

  // A server ACK may arrive after Provider lifecycle invalidation; it is not an
  // assertion that the Provider applied that selection to its avatar state.
  isSaving = false
  saveResponse.resolve({ ok: true, persistence: "acknowledged", application: "superseded" })
  await save
  assert.equal(canonicalAvatar, originalAvatar)
  assert.equal(activeRequestRef.current, null)
  assert.equal(harness.state.status, "saving")
  assert.equal(shouldReportWardrobeTryOnSuccess("superseded"), false)
  assert.equal(harness.state.requestId, 31)
  assert.equal(harness.state.previewAvatar, latestAvatar)
  const queued = takeQueuedTryOn({ isSaving, activeRequestRef, queuedRequestRef })
  assert.equal(queued.item, latestItem)
  assert.equal(queued.previewAvatar, latestAvatar)
  assert.doesNotMatch(screenSource, /WARDROBE_TRY_ON_CONFIRMATION_GRACE_MS/)
})

test("wardrobe equipped success waits for the exact canonical avatar, not merely save ACK", () => {
  const activeRequest = {
    requestId: 32,
    item: ownedItem,
    previewAvatar,
    baselineAvatar: originalAvatar,
    persistence: "acknowledged",
    application: "applied",
    status: "awaiting-confirmation"
  }
  const activeRequestRef = { current: activeRequest }
  assert.equal(resolveWardrobeTryOnConfirmation({
    activeRequest,
    activeRequestRef,
    avatar: originalAvatar,
    isSaving: false
  }), "waiting")
  assert.equal(shouldReportWardrobeTryOnSuccess("waiting"), false)
  assert.equal(resolveWardrobeTryOnConfirmation({
    activeRequest,
    activeRequestRef,
    avatar: previewAvatar,
    isSaving: false
  }), "confirmed")
  assert.equal(shouldReportWardrobeTryOnSuccess("confirmed"), true)
})

test("confirmation safely waits when the active request was cleared before the effect runs", () => {
  const activeRequestRef = { current: null }
  const actions = []

  assert.equal(confirmTryOn({
    avatar: originalAvatar,
    isSaving: false,
    activeRequestRef,
    dispatch: (action) => actions.push(action)
  }), "waiting")
  assert.deepEqual(actions, [])
})

test("a queued full snapshot rebases user-changed fields while preserving remote untouched fields", () => {
  const base = {
    ...originalAvatar,
    accessoryIds: ["base-accessory", "remove-me"]
  }
  const intended = {
    ...base,
    topId: "user-top",
    accessoryIds: ["base-accessory", "user-accessory"]
  }
  const canonical = {
    ...base,
    hairId: "remote-hair",
    bottomId: "remote-bottom",
    accessoryIds: ["base-accessory", "remove-me", "remote-accessory"]
  }

  const rebased = rebaseWardrobeTryOnSnapshot(base, intended, canonical)
  assert.equal(rebased.topId, "user-top")
  assert.equal(rebased.hairId, "remote-hair")
  assert.equal(rebased.bottomId, "remote-bottom")
  assert.deepEqual([...rebased.accessoryIds].sort(), [
    "base-accessory",
    "remote-accessory",
    "user-accessory"
  ])
  assert.equal(intended.hairId, base.hairId)
  assert.deepEqual(intended.accessoryIds, ["base-accessory", "user-accessory"])
})

test("save failure and server conflict both roll back the preview and release the tap lock", async () => {
  for (const result of [
    { ok: false, reason: "error" },
    { ok: false, reason: "conflict" }
  ]) {
    const harness = createHarness()
    const activeRequestRef = { current: null }
    const saveResponse = deferred()
    const save = runTryOnSave({
      requestId: 2,
      item: ownedItem,
      pending: { requestId: 2, item: ownedItem, previewAvatar, status: "saving" },
      activeRequestRef,
      dispatch: (action) => harness.dispatch(action),
      save: () => saveResponse.promise
    })

    assert.equal(harness.state.previewAvatar, previewAvatar)
    saveResponse.resolve(result)
    await save
    assert.equal(harness.state, null)
    assert.equal(activeRequestRef.current, null)
  }
})

test("a rejected save promise rolls the preview back", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const saveResponse = deferred()
  const save = runTryOnSave({
    requestId: 6,
    item: ownedItem,
    pending: { requestId: 6, item: ownedItem, previewAvatar, status: "saving" },
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: () => saveResponse.promise
  })

  assert.equal(harness.state.previewAvatar, previewAvatar)
  saveResponse.reject(new Error("offline"))
  assert.equal(await save, undefined)
  assert.equal(harness.state, null)
  assert.equal(activeRequestRef.current, null)
})

test("rapid taps preview the latest choice immediately and serialize only its save", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const queuedRequestRef = { current: null }
  const firstResponse = deferred()
  const latestResponse = deferred()
  const middleItem = { id: "middle-hair", type: "hair" }
  const latestItem = { id: "latest-hair", type: "hair" }
  const middleAvatar = { ...originalAvatar, hairId: middleItem.id }
  const latestAvatar = { ...originalAvatar, hairId: latestItem.id }
  const savedItems = []
  const firstSave = runTryOnSave({
    requestId: 3,
    item: ownedItem,
    pending: { requestId: 3, item: ownedItem, previewAvatar, status: "saving" },
    baselineAvatar: originalAvatar,
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: (avatar) => { savedItems.push(avatar.hairId); return firstResponse.promise }
  })

  for (const pending of [
    { requestId: 4, item: middleItem, previewAvatar: middleAvatar, status: "saving" },
    { requestId: 5, item: latestItem, previewAvatar: latestAvatar, status: "saving" }
  ]) {
    assert.equal(queueTryOn({
      pending, activeRequestRef, queuedRequestRef,
      dispatch: (action) => harness.dispatch(action)
    }), true)
  }
  assert.equal(harness.state.previewAvatar, latestAvatar)
  assert.equal(queuedRequestRef.current.item, latestItem)
  assert.deepEqual(savedItems, [ownedItem.id])
  assert.equal(takeQueuedTryOn({ isSaving: true, activeRequestRef, queuedRequestRef }), null)

  firstResponse.resolve({ ok: true, persistence: "acknowledged", application: "applied" })
  await firstSave
  assert.equal(takeQueuedTryOn({ isSaving: false, activeRequestRef, queuedRequestRef }), null)
  assert.equal(confirmTryOn({
    avatar: previewAvatar, isSaving: false, activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "confirmed")
  const latest = takeQueuedTryOn({ isSaving: false, activeRequestRef, queuedRequestRef })
  assert.equal(latest.item, latestItem)
  assert.equal(queuedRequestRef.current, null)
  const latestSave = runTryOnSave({
    requestId: latest.requestId,
    item: latest.item,
    pending: { ...latest, status: "saving" },
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: (avatar) => { savedItems.push(avatar.hairId); return latestResponse.promise }
  })
  assert.deepEqual(savedItems, [ownedItem.id, latestItem.id])
  assert.equal(harness.state.previewAvatar, latestAvatar)
  latestResponse.resolve({ ok: true, persistence: "acknowledged", application: "applied" })
  await latestSave
  assert.equal(confirmTryOn({
    avatar: latestAvatar, isSaving: false, activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "confirmed")
  assert.equal(harness.state, null)
  assert.equal(activeRequestRef.current, null)
})

test("hair H0 to H1 to H0 saves the final intent through the real queue and rebase", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const queuedRequestRef = { current: null }
  const firstResponse = deferred()
  const first = runTryOnSave({
    requestId: 30, pending: { requestId: 30, item: ownedItem, previewAvatar, status: "saving" },
    baselineAvatar: originalAvatar, activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: () => firstResponse.promise
  })
  const resetItem = { id: originalAvatar.hairId, type: "hair" }
  queueTryOn({
    pending: { requestId: 31, item: resetItem, previewAvatar: originalAvatar, status: "saving" },
    activeRequestRef, queuedRequestRef, dispatch: (action) => harness.dispatch(action)
  })
  firstResponse.resolve({ ok: true, persistence: "acknowledged", application: "applied", canonicalAvatar: previewAvatar })
  await first
  assert.equal(confirmTryOn({
    avatar: previewAvatar, isSaving: false, activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "confirmed")
  const queued = takeQueuedTryOn({ isSaving: false, activeRequestRef, queuedRequestRef })
  const next = rebaseWardrobeTryOnSnapshot(
    queued.baseAvatar, queued.previewAvatar, previewAvatar, queued.touched
  )
  let savedAvatar
  const result = await runTryOnSave({
    requestId: queued.requestId,
    pending: { ...queued, previewAvatar: next, status: "saving" },
    baselineAvatar: previewAvatar, activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: async (avatar) => {
      savedAvatar = avatar
      return { ok: true, persistence: "acknowledged", application: "applied", canonicalAvatar: avatar }
    }
  })
  assert.equal(result.ok, true)
  assert.equal(savedAvatar.hairId, originalAvatar.hairId)
  assert.equal(confirmTryOn({
    avatar: originalAvatar, isSaving: false, activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "confirmed")
})

test("accessory off to on to off preserves removal after the first save", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const queuedRequestRef = { current: null }
  const accessory = { id: "owned-accessory", type: "accessory" }
  const withAccessory = { ...originalAvatar, accessoryIds: [accessory.id] }
  const firstResponse = deferred()
  const first = runTryOnSave({
    requestId: 32, pending: { requestId: 32, item: accessory, previewAvatar: withAccessory, status: "saving" },
    baselineAvatar: originalAvatar, activeRequestRef,
    dispatch: (action) => harness.dispatch(action), save: () => firstResponse.promise
  })
  queueTryOn({
    pending: { requestId: 33, item: accessory, previewAvatar: originalAvatar, status: "saving" },
    activeRequestRef, queuedRequestRef, dispatch: (action) => harness.dispatch(action)
  })
  firstResponse.resolve({ ok: true, persistence: "acknowledged", application: "applied", canonicalAvatar: withAccessory })
  await first
  assert.equal(confirmTryOn({
    avatar: withAccessory, isSaving: false, activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "confirmed")
  const queued = takeQueuedTryOn({ isSaving: false, activeRequestRef, queuedRequestRef })
  const next = rebaseWardrobeTryOnSnapshot(
    queued.baseAvatar, queued.previewAvatar, withAccessory, queued.touched
  )
  let savedAvatar
  await runTryOnSave({
    requestId: queued.requestId,
    pending: { ...queued, previewAvatar: next, status: "saving" },
    baselineAvatar: withAccessory, activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: async (avatar) => {
      savedAvatar = avatar
      return { ok: true, persistence: "acknowledged", application: "applied", canonicalAvatar: avatar }
    }
  })
  assert.deepEqual([...savedAvatar.accessoryIds], [])
})

test("applied response with unchanged canonical baseline releases active lock without false success", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const queuedRequestRef = { current: null }
  const response = deferred()
  const first = runTryOnSave({
    requestId: 34, pending: { requestId: 34, item: ownedItem, previewAvatar, status: "saving" },
    baselineAvatar: originalAvatar, activeRequestRef,
    dispatch: (action) => harness.dispatch(action), save: () => response.promise
  })
  const nextItem = { id: "owned-top", type: "top" }
  const nextAvatar = { ...previewAvatar, topId: nextItem.id }
  queueTryOn({
    pending: { requestId: 35, item: nextItem, previewAvatar: nextAvatar, status: "saving" },
    activeRequestRef, queuedRequestRef, dispatch: (action) => harness.dispatch(action)
  })
  response.resolve({ ok: true, persistence: "acknowledged", application: "applied", canonicalAvatar: originalAvatar })
  await first
  const confirmation = confirmTryOn({
    avatar: originalAvatar, isSaving: false, activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  })
  assert.equal(shouldReportWardrobeTryOnSuccess(confirmation), false)
  assert.equal(activeRequestRef.current, null)
  assert.equal(harness.state.requestId, 35)
  const queued = takeQueuedTryOn({ isSaving: false, activeRequestRef, queuedRequestRef })
  assert.equal(queued.requestId, 35)
  const next = rebaseWardrobeTryOnSnapshot(
    queued.baseAvatar, queued.previewAvatar, originalAvatar, queued.touched
  )
  let savedAvatar
  await runTryOnSave({
    requestId: queued.requestId,
    pending: { ...queued, previewAvatar: next, status: "saving" },
    baselineAvatar: originalAvatar, activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: async (avatar) => {
      savedAvatar = avatar
      return { ok: true, persistence: "acknowledged", application: "applied", canonicalAvatar: avatar }
    }
  })
  assert.equal(savedAvatar.topId, nextItem.id)
  assert.equal(confirmTryOn({
    avatar: savedAvatar, isSaving: false, activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "confirmed")
  assert.equal(harness.state, null)
})

test("a failed first save does not discard the latest queued tap", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const queuedRequestRef = { current: null }
  const response = deferred()
  const firstSave = runTryOnSave({
    requestId: 10, item: ownedItem,
    pending: { requestId: 10, item: ownedItem, previewAvatar, status: "saving" },
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: () => response.promise
  })
  const latestItem = { id: "latest-hair", type: "hair" }
  const latestAvatar = { ...originalAvatar, hairId: latestItem.id }
  queueTryOn({
    pending: { requestId: 11, item: latestItem, previewAvatar: latestAvatar, status: "saving" },
    activeRequestRef, queuedRequestRef,
    dispatch: (action) => harness.dispatch(action)
  })
  response.resolve({ ok: false, reason: "conflict" })
  await firstSave
  assert.equal(harness.state.previewAvatar, latestAvatar)
  assert.equal(takeQueuedTryOn({ isSaving: true, activeRequestRef, queuedRequestRef }), null)
  assert.equal(takeQueuedTryOn({ isSaving: false, activeRequestRef, queuedRequestRef }).item, latestItem)
  assert.match(screenSource, /rebaseWardrobeTryOnSnapshot\(\s*queued\.baseAvatar,\s*queued\.previewAvatar,\s*avatar,\s*queued\.touched\s*\)/)
})

test("queued accessory toggle saves the exact latest preview selection", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const targetAvatar = { ...originalAvatar, accessoryIds: [] }
  let savedAvatar
  const result = await runTryOnSave({
    requestId: 20,
    item: { id: "accessory-toggle", type: "accessory" },
    pending: {
      requestId: 20,
      item: { id: "accessory-toggle", type: "accessory" },
      previewAvatar: targetAvatar,
      status: "saving"
    },
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: async (avatar) => {
      savedAvatar = avatar
      return { ok: true, persistence: "acknowledged", application: "applied" }
    }
  })

  assert.equal(result.ok, true)
  assert.equal(savedAvatar, targetAvatar)
})

test("changing category drops a queued action but does not cancel the active save", () => {
  const harness = createHarness()
  const activeRequestRef = {
    current: { requestId: 1, previewAvatar, status: "saving" }
  }
  const queuedRequestRef = {
    current: { requestId: 2, item: ownedItem, previewAvatar }
  }
  const previewAvatarRef = { current: previewAvatar }
  harness.dispatch({
    type: "begin",
    pending: { requestId: 2, item: ownedItem, previewAvatar, status: "saving" }
  })

  clearQueuedTryOn({ queuedRequestRef, previewAvatarRef, dispatch: (action) => harness.dispatch(action) })

  assert.equal(queuedRequestRef.current, null)
  assert.equal(previewAvatarRef.current, null)
  assert.equal(activeRequestRef.current.requestId, 1)
  assert.equal(harness.state, null)
})

test("a save resolving after navigation blur cannot restore preview or notify the stale screen", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const saveResponse = deferred()
  let screenGeneration = 7
  const requestGeneration = screenGeneration
  let dispatchCount = 0
  const save = runTryOnSave({
    requestId: 8,
    item: ownedItem,
    pending: { requestId: 8, item: ownedItem, previewAvatar, status: "saving" },
    activeRequestRef,
    dispatch: (action) => {
      dispatchCount += 1
      harness.dispatch(action)
    },
    save: () => saveResponse.promise
  })

  assert.equal(harness.state.previewAvatar, previewAvatar)
  activeRequestRef.current = null
  screenGeneration += 1
  harness.dispatch({ type: "dismiss-preview" })
  const dispatchesAtBlur = dispatchCount

  const staleAcknowledgement = {
    ok: true,
    persistence: "acknowledged",
    application: "superseded"
  }
  saveResponse.resolve(staleAcknowledgement)
  assert.deepEqual(await save, staleAcknowledgement)
  assert.equal(harness.state, null)
  assert.equal(dispatchCount, dispatchesAtBlur)
  assert.equal(shouldHandleCompletion({
    isMounted: true,
    requestGeneration,
    currentScreenGeneration: screenGeneration
  }), false)
  assert.equal(shouldHandleCompletion({
    isMounted: false,
    requestGeneration: screenGeneration,
    currentScreenGeneration: screenGeneration
  }), false)
  assert.match(screenSource, /screenGenerationRef\.current \+= 1[\s\S]*?activeTryOnRequestRef\.current = null/)
  assert.match(screenSource, /if \(!shouldHandleWardrobeTryOnCompletion\(/)
})

test("an older response cannot clear a newer in-flight selection", async () => {
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const olderResponse = deferred()
  const newerResponse = deferred()
  const olderSave = runTryOnSave({
    requestId: 12, item: ownedItem,
    pending: { requestId: 12, item: ownedItem, previewAvatar, status: "saving" },
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: () => olderResponse.promise
  })

  activeRequestRef.current = null
  harness.dispatch({ type: "dismiss-preview" })
  const newerItem = { id: "newer-hair", type: "hair" }
  const newerAvatar = { ...originalAvatar, hairId: newerItem.id }
  const newerSave = runTryOnSave({
    requestId: 13, item: newerItem,
    pending: { requestId: 13, item: newerItem, previewAvatar: newerAvatar, status: "saving" },
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: () => newerResponse.promise
  })

  olderResponse.resolve({ ok: false })
  await olderSave
  assert.equal(activeRequestRef.current.requestId, 13)
  assert.equal(harness.state.previewAvatar, newerAvatar)

  newerResponse.resolve({ ok: true, persistence: "acknowledged", application: "applied" })
  await newerSave
  assert.equal(confirmTryOn({
    avatar: newerAvatar, isSaving: false, activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  }), "confirmed")
  assert.equal(harness.state, null)
})

test("category changes and navigation blur dismiss the visual preview", () => {
  const harness = createHarness()
  harness.dispatch({
    type: "begin",
    pending: { requestId: 5, item: ownedItem, previewAvatar, status: "saving" }
  })
  harness.dispatch({ type: "dismiss-preview" })
  assert.equal(harness.state, null)

  assert.match(screenSource, /navigation\.addListener\("blur",[\s\S]*?type: "dismiss-preview"/)
  assert.match(screenSource, /dismissTryOnPreview\(\)\s*setSelectedCategory\(categoryId\)/)
  assert.match(screenSource, /clearQueuedWardrobeTryOn\(\{[\s\S]*?dispatch: dispatchTryOn/)
  assert.match(screenSource, /!canEquipItem\(item\)/)
  assert.match(screenSource, /isMountedRef\.current = false[\s\S]*?activeTryOnRequestRef\.current = null/)
})

test("an accepted same-owner refresh confirms the wardrobe save and releases its queued selection", async () => {
  const serverSave = deferred()
  const provider = createAvatarProviderHarness({ onSaveAvatar: () => serverSave.promise })
  const harness = createHarness()
  const activeRequestRef = { current: null }
  const queuedRequestRef = { current: null }
  const nextItem = { id: "queued-top", type: "top" }
  const queuedAvatar = { ...previewAvatar, topId: nextItem.id }

  const saving = runTryOnSave({
    requestId: 60,
    item: ownedItem,
    pending: { requestId: 60, item: ownedItem, previewAvatar, status: "saving" },
    baselineAvatar: originalAvatar,
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action),
    save: provider.value.saveAvatar
  })
  assert.notEqual(saving, null)
  provider.rerender()
  assert.equal(provider.value.isSaving, true)

  queueTryOn({
    pending: { requestId: 61, item: nextItem, previewAvatar: queuedAvatar, status: "saving" },
    activeRequestRef,
    queuedRequestRef,
    dispatch: (action) => harness.dispatch(action)
  })

  // The session refresh publishes the accepted canonical loadout before the
  // original request continuation gets a chance to commit its old generation.
  provider.refreshSelection({ revision: 2, loadout: previewAvatar })
  assert.equal(provider.value.avatar, previewAvatar)
  assert.equal(provider.value.isSaving, false)
  serverSave.resolve({
    kind: "updated",
    selection: { revision: 2, loadout: previewAvatar }
  })

  const result = await saving
  assert.equal(result.ok, true)
  assert.equal(result.persistence, "acknowledged")
  assert.equal(result.application, "applied")
  assert.equal(result.selection.revision, 2)
  assert.equal(result.canonicalAvatar, previewAvatar)
  assert.equal(activeRequestRef.current.status, "awaiting-confirmation")
  const requestBeforeConfirmation = activeRequestRef.current
  const confirmation = confirmTryOn({
    avatar: provider.value.avatar,
    isSaving: provider.value.isSaving,
    activeRequestRef,
    dispatch: (action) => harness.dispatch(action)
  })
  assert.equal(confirmation, "confirmed")
  assert.equal(shouldReportWardrobeTryOnSuccess(confirmation), true)
  const queuedSuccessEvents = []
  let queuedSuccessHaptics = 0
  assert.equal(reportWardrobeTryOnSuccess({
    confirmation,
    activeRequest: requestBeforeConfirmation,
    hasQueuedRequest: true,
    captureProductEvent: (...args) => queuedSuccessEvents.push(args),
    hapticSuccess: () => { queuedSuccessHaptics += 1 }
  }), true)
  assert.equal(queuedSuccessEvents.length, 1)
  assert.equal(queuedSuccessEvents[0][0], "wardrobe_item_equipped")
  assert.equal(queuedSuccessEvents[0][1].item_type, "hair")
  assert.equal(queuedSuccessHaptics, 0)

  const unqueuedSuccessEvents = []
  let unqueuedSuccessHaptics = 0
  assert.equal(reportWardrobeTryOnSuccess({
    confirmation,
    activeRequest: requestBeforeConfirmation,
    hasQueuedRequest: false,
    captureProductEvent: (...args) => unqueuedSuccessEvents.push(args),
    hapticSuccess: () => { unqueuedSuccessHaptics += 1 }
  }), true)
  assert.equal(unqueuedSuccessEvents.length, 1)
  assert.equal(unqueuedSuccessHaptics, 1)

  const queued = takeQueuedTryOn({
    isSaving: provider.value.isSaving,
    activeRequestRef,
    queuedRequestRef
  })
  assert.equal(queued.item, nextItem)
  assert.equal(queued.previewAvatar, queuedAvatar)
})

test("a different-owner Provider completion and a canonical mismatch cannot report success or lock the queue", async (t) => {
  await t.test("scope change cannot confirm an old save even if the new owner has the same avatar", async () => {
    const serverSave = deferred()
    const provider = createAvatarProviderHarness({ onSaveAvatar: () => serverSave.promise })
    const harness = createHarness()
    const activeRequestRef = { current: null }
    const queuedRequestRef = { current: null }
    const nextItem = { id: "queued-after-scope-switch", type: "top" }
    const queuedAvatar = { ...previewAvatar, topId: nextItem.id }
    const saving = runTryOnSave({
      requestId: 65,
      item: ownedItem,
      pending: { requestId: 65, item: ownedItem, previewAvatar, status: "saving" },
      baselineAvatar: originalAvatar,
      activeRequestRef,
      dispatch: (action) => harness.dispatch(action),
      save: provider.value.saveAvatar
    })
    queueTryOn({
      pending: { requestId: 66, item: nextItem, previewAvatar: queuedAvatar, status: "saving" },
      activeRequestRef,
      queuedRequestRef,
      dispatch: (action) => harness.dispatch(action)
    })

    provider.switchOwner("owner-b", { revision: 2, loadout: previewAvatar })
    serverSave.resolve({
      kind: "updated",
      selection: { revision: 2, loadout: previewAvatar }
    })
    const result = await saving

    assert.equal(provider.value.avatar, previewAvatar)
    assert.equal(result.application, "superseded")
    assert.equal(result.canonicalAvatar, undefined)
    assert.equal(activeRequestRef.current, null)
    assert.equal(shouldReportWardrobeTryOnSuccess("superseded"), false)
    let successSignals = 0
    assert.equal(reportWardrobeTryOnSuccess({
      confirmation: "superseded",
      activeRequest: { item: ownedItem },
      hasQueuedRequest: false,
      captureProductEvent: () => { successSignals += 1 },
      hapticSuccess: () => { successSignals += 1 }
    }), false)
    assert.equal(successSignals, 0)
    const queued = takeQueuedTryOn({
      isSaving: provider.value.isSaving,
      activeRequestRef,
      queuedRequestRef
    })
    assert.equal(queued.item, nextItem)
  })

  await t.test("unmounted owner", async () => {
    const serverSave = deferred()
    const provider = createAvatarProviderHarness({ onSaveAvatar: () => serverSave.promise })
    const harness = createHarness()
    const activeRequestRef = { current: null }
    const queuedRequestRef = { current: null }
    const nextItem = { id: "queued-after-owner-switch", type: "top" }
    const queuedAvatar = { ...previewAvatar, topId: nextItem.id }
    const saving = runTryOnSave({
      requestId: 70,
      item: ownedItem,
      pending: { requestId: 70, item: ownedItem, previewAvatar, status: "saving" },
      baselineAvatar: originalAvatar,
      activeRequestRef,
      dispatch: (action) => harness.dispatch(action),
      save: provider.value.saveAvatar
    })
    queueTryOn({
      pending: { requestId: 71, item: nextItem, previewAvatar: queuedAvatar, status: "saving" },
      activeRequestRef,
      queuedRequestRef,
      dispatch: (action) => harness.dispatch(action)
    })

    provider.unmount()
    serverSave.resolve({
      kind: "updated",
      selection: { revision: 2, loadout: previewAvatar }
    })
    const result = await saving

    assert.equal(result.application, "superseded")
    assert.equal(result.canonicalAvatar, undefined)
    assert.equal(activeRequestRef.current, null)
    assert.equal(shouldReportWardrobeTryOnSuccess("superseded"), false)
    const queued = takeQueuedTryOn({
      isSaving: false,
      activeRequestRef,
      queuedRequestRef
    })
    assert.equal(queued.item, nextItem)
  })

  await t.test("server and refreshed Provider agree with each other but not the requested try-on", async () => {
    const serverSave = deferred()
    const provider = createAvatarProviderHarness({ onSaveAvatar: () => serverSave.promise })
    const harness = createHarness()
    const activeRequestRef = { current: null }
    const queuedRequestRef = { current: null }
    const wrongCanonicalAvatar = { ...originalAvatar, hairId: "normalized-other-hair" }
    const nextItem = { id: "queued-after-mismatch", type: "top" }
    const queuedAvatar = { ...wrongCanonicalAvatar, topId: nextItem.id }
    const saving = runTryOnSave({
      requestId: 80,
      item: ownedItem,
      pending: { requestId: 80, item: ownedItem, previewAvatar, status: "saving" },
      baselineAvatar: originalAvatar,
      activeRequestRef,
      dispatch: (action) => harness.dispatch(action),
      save: provider.value.saveAvatar
    })
    queueTryOn({
      pending: { requestId: 81, item: nextItem, previewAvatar: queuedAvatar, status: "saving" },
      activeRequestRef,
      queuedRequestRef,
      dispatch: (action) => harness.dispatch(action)
    })

    provider.refreshSelection({ revision: 2, loadout: wrongCanonicalAvatar })
    serverSave.resolve({
      kind: "updated",
      selection: { revision: 2, loadout: wrongCanonicalAvatar }
    })
    const result = await saving

    assert.equal(provider.value.avatar, wrongCanonicalAvatar)
    assert.equal(result, undefined)
    assert.equal(activeRequestRef.current, null)
    assert.equal(shouldReportWardrobeTryOnSuccess("failed"), false)
    let successSignals = 0
    assert.equal(reportWardrobeTryOnSuccess({
      confirmation: "failed",
      activeRequest: { item: ownedItem },
      hasQueuedRequest: false,
      captureProductEvent: () => { successSignals += 1 },
      hapticSuccess: () => { successSignals += 1 }
    }), false)
    assert.equal(successSignals, 0)
    const queued = takeQueuedTryOn({
      isSaving: provider.value.isSaving,
      activeRequestRef,
      queuedRequestRef
    })
    assert.equal(queued.item, nextItem)
  })
})
