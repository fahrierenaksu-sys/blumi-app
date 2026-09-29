import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const rootSource = read("../../navigation/RootNavigator.tsx")
const rootFile = ts.createSourceFile("RootNavigator.tsx", rootSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function rootCallback(name, bindings) {
  let initializer
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      initializer = node.initializer
    }
    ts.forEachChild(node, visit)
  }
  visit(rootFile)
  assert.ok(initializer, `${name} must have an initializer`)
  const executable = ts.transpileModule(`(${initializer.getText(rootFile)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  return runInNewContext(executable, { useCallback: (callback) => callback, ...bindings })
}

// Execute production event logic with injected native APIs. This does not model
// React scheduling, notification OS persistence, or native navigation rendering.
function createRuntime({ ready = true, response = null, onResponse } = {}) {
  let hookIndex = 0
  let scheduledEffects = []
  const hookValues = []
  const mountedEffects = new Map()
  const navigations = []
  const errors = []
  const responseOwnerMaps = []
  let lastResponse = response
  let clearCount = 0
  let listener
  let responseSubscriptionCount = 0
  let responseUnsubscriptionCount = 0
  let readyGeneration = 0
  const notifications = {
    setNotificationHandler: () => {},
    addPushTokenListener: () => ({ remove: () => {} }),
    addNotificationResponseReceivedListener: (callback) => {
      responseSubscriptionCount += 1
      listener = callback
      return { remove: () => { responseUnsubscriptionCount += 1; listener = undefined } }
    },
    getLastNotificationResponseAsync: async () => lastResponse,
    clearLastNotificationResponseAsync: async () => { clearCount += 1; lastResponse = null }
  }
  const actor = {
    session: { mode: "production", userId: "user-one", sessionId: "session-one", sessionToken: "token-one" },
    profile: { userId: "user-one" }
  }
  let currentActor = actor
  let currentResponseCallback = onResponse
  const navigationRef = {
    isReady: () => ready,
    navigate: (...args) => { navigations.push(args) }
  }
  const react = {
    useCallback: (callback) => { hookIndex += 1; return callback },
    useRef: (current) => {
      const index = hookIndex++
      hookValues[index] ??= { current }
      return hookValues[index]
    },
    useState: (value) => {
      const index = hookIndex++
      hookValues[index] ??= value
      return [hookValues[index], () => {}]
    },
    useEffect: (effect, dependencies) => {
      const index = hookIndex++
      scheduledEffects.push({ index, effect, dependencies })
    }
  }
  const mocks = {
    react,
    "react-native": { Platform: { OS: "ios" }, AppState: { addEventListener: () => ({ remove: () => {} }) } },
    "expo-constants": {},
    "expo-device": { isDevice: false },
    "expo-notifications": notifications,
    "../../config/env": { MOBILE_HTTP_BASE_URL: "https://api.blumi.test" },
    "../../observability/crashReporting": { captureAppException: (error) => errors.push(error) },
    "./notificationApi": {
      updateNotificationPreferences: async () => {},
      registerDevice: async () => { throw new Error("Unexpected device registration") },
      removeDevice: async () => { throw new Error("Unexpected device removal") }
    }
  }
  const modules = new Map()
  function load(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    assert.ok([
      "./usePushRegistration", "./notificationTimeZoneSync",
      "./notificationRuntimePolicy", "./pushRegistrationCoordinator", "./notificationRouting"
    ].includes(name), `Unexpected dependency: ${name}`)
    if (modules.has(name)) return modules.get(name)
    const module = { exports: {} }
    modules.set(name, module.exports)
    const executable = ts.transpileModule(read(`${name}.ts`), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText
    const context = {
      module, exports: module.exports, require: load, __DEV__: false,
      AbortController, fetch: () => { throw new Error("Network access is forbidden in this test") }
    }
    if (name === "./usePushRegistration") {
      context.Map = class TrackedMap extends Map {
        constructor(...args) {
          super(...args)
          responseOwnerMaps.push(this)
        }
      }
    }
    runInNewContext(executable, context)
    return module.exports
  }
  const sessionBindings = {
    sessionEntryRoute: "Main",
    isAccountRestricted: false,
    isCurrentSession: (expected) => expected.profile.userId === currentActor?.profile.userId &&
      expected.session.sessionId === currentActor?.session.sessionId &&
      expected.session.sessionToken === currentActor?.session.sessionToken,
    navigationRef,
    resolveNotificationDestination: load("./notificationRouting").resolveNotificationDestination
  }
  const routeResponse = rootCallback("handleNotificationResponseData", sessionBindings)
  currentResponseCallback ??= routeResponse
  const registration = load("./usePushRegistration").usePushRegistration
  const renderHook = (sessionActor, callback = currentResponseCallback) => {
    hookIndex = 0
    scheduledEffects = []
    registration(sessionActor, callback, readyGeneration)
    for (const next of scheduledEffects) {
      const previous = mountedEffects.get(next.index)
      const dependenciesChanged = !previous || !next.dependencies ||
        previous.dependencies.length !== next.dependencies.length ||
        next.dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))
      if (!dependenciesChanged) continue
      previous?.cleanup?.()
      const cleanup = next.effect()
      mountedEffects.set(next.index, { dependencies: next.dependencies, cleanup })
    }
  }
  const navigationReady = rootCallback("handleNavigationReady", {
    ...sessionBindings,
    setIsNavigationReady: (value) => { ready = value },
    setNavigationReadyGeneration: (update) => { readyGeneration = update(readyGeneration) },
    syncCurrentRouteName: () => {},
    sessionEntryRoute: "Main",
    markOnboardingContentReady: () => {}
  })
  renderHook(actor)
  return {
    navigations, errors,
    get observedResponseOwnerCount() { return responseOwnerMaps[0]?.size ?? 0 },
    get pendingResponseCount() { return responseOwnerMaps[1]?.size ?? 0 },
    get responseSubscriptionCount() { return responseSubscriptionCount },
    get responseUnsubscriptionCount() { return responseUnsubscriptionCount },
    get clearCount() { return clearCount },
    navigationReady: () => { navigationReady(); renderHook(currentActor) },
    acceptResponse: routeResponse,
    setCurrentActor: (value) => { currentActor = value },
    startSession: (value) => { currentActor = value; renderHook(value) },
    renderWithCallback: (callback) => { currentResponseCallback = callback; renderHook(currentActor, callback) },
    rerenderWithEquivalentCallback: () => {
      const previous = currentResponseCallback
      currentResponseCallback = (data, expectedActor) => previous(data, expectedActor)
      renderHook(currentActor, currentResponseCallback)
    },
    emit: (value) => { assert.ok(listener); listener(value) },
    dispose: () => {
      for (const effect of mountedEffects.values()) effect.cleanup?.()
      mountedEffects.clear()
    }
  }
}

const response = {
  notification: { request: { identifier: "notification-one", content: {
    data: { type: "chat.message", threadId: "thread-one" }
  } } }
}
const settle = async () => { await new Promise(setImmediate); await new Promise(setImmediate) }

test("a cached response delivered after navigation readiness opens its thread and is consumed once", async (t) => {
  const runtime = createRuntime({ response })
  t.after(runtime.dispose)
  await settle()
  assert.deepEqual(runtime.errors, [])
  assert.equal(runtime.navigations.length, 1)
  assert.equal(runtime.navigations[0][0], "ChatThread")
  assert.equal(runtime.navigations[0][1].threadId, "thread-one")
  assert.equal(runtime.clearCount, 1)
})

test("a rejected cached response remains available instead of being consumed", async (t) => {
  const runtime = createRuntime({ response, onResponse: () => false })
  t.after(runtime.dispose)
  await settle()
  assert.deepEqual(runtime.errors, [])
  assert.equal(runtime.clearCount, 0, "response consumption requires delivery acceptance")
})

test("a cached response arriving before navigation readiness replays exactly once when navigation becomes ready", async (t) => {
  const runtime = createRuntime({ ready: false, response })
  t.after(runtime.dispose)
  await settle()
  assert.deepEqual(runtime.errors, [])
  assert.equal(runtime.navigations.length, 0)
  runtime.navigationReady()
  await settle()
  assert.equal(runtime.navigations.length, 1, "readiness must replay the previously deferred response")
  assert.equal(runtime.navigations[0][1].threadId, "thread-one")
  runtime.navigationReady()
  await settle()
  assert.equal(runtime.navigations.length, 1)
})

test("a live response received before navigation readiness replays when navigation becomes ready", async (t) => {
  const runtime = createRuntime({ ready: false })
  t.after(runtime.dispose)
  await settle()
  runtime.emit(response)
  assert.equal(runtime.navigations.length, 0)
  runtime.navigationReady()
  await settle()
  assert.equal(runtime.navigations.length, 1)
  assert.equal(runtime.navigations[0][1].threadId, "thread-one")
})

test("a listener response and the same cached response navigate only once", async (t) => {
  const runtime = createRuntime({ response })
  t.after(runtime.dispose)
  await settle()
  runtime.emit(response)
  await settle()
  assert.equal(runtime.navigations.length, 1)
  assert.equal(runtime.clearCount, 1)
})

test("a deferred response cannot navigate after the authenticated session changes", async (t) => {
  const runtime = createRuntime({ ready: false, response })
  t.after(runtime.dispose)
  await settle()
  runtime.setCurrentActor({ session: { mode: "production", userId: "user-two", sessionId: "session-two", sessionToken: "token-two" }, profile: { userId: "user-two" } })
  runtime.navigationReady()
  await settle()
  assert.equal(runtime.navigations.length, 0)
})

test("a response from a stale session callback is rejected and its cache is retained", async (t) => {
  const runtime = createRuntime({ response })
  t.after(runtime.dispose)
  runtime.setCurrentActor({ session: { mode: "production", userId: "user-two", sessionId: "session-two", sessionToken: "token-two" }, profile: { userId: "user-two" } })
  await settle()
  assert.equal(runtime.navigations.length, 0)
  assert.equal(runtime.clearCount, 0)
})

test("a cached response first observed by one account cannot open under another", async (t) => {
  const runtime = createRuntime({ ready: false, response })
  t.after(runtime.dispose)
  await settle()
  runtime.dispose()
  const nextActor = {
    session: { mode: "production", userId: "user-two", sessionId: "session-two", sessionToken: "token-two" },
    profile: { userId: "user-two" }
  }
  runtime.setCurrentActor(nextActor)
  runtime.navigationReady()
  runtime.startSession(nextActor)
  await settle()
  assert.equal(runtime.navigations.length, 0)
  assert.equal(runtime.clearCount, 0)
})

test("a live response and its matching cached response navigate once", async (t) => {
  const runtime = createRuntime({ response })
  t.after(runtime.dispose)
  await settle()
  runtime.emit(response)
  await settle()
  assert.equal(runtime.navigations.length, 1)
  assert.equal(runtime.clearCount, 1)
})

test("response owner history stays FIFO bounded and retains recent account isolation", async (t) => {
  const runtime = createRuntime()
  t.after(runtime.dispose)
  await settle()

  const responseFor = (index) => ({
    notification: { request: { identifier: `notification-${index}`, content: {
      data: { type: "chat.message", threadId: "thread-one" }
    } } }
  })
  for (let index = 0; index < 300; index += 1) runtime.emit(responseFor(index))
  assert.equal(runtime.observedResponseOwnerCount, 256, "owner records use a fixed FIFO bound")

  runtime.dispose()
  const otherActor = {
    session: { mode: "production", userId: "user-two", sessionId: "session-two", sessionToken: "token-two" },
    profile: { userId: "user-two" }
  }
  runtime.setCurrentActor(otherActor)
  const navigationCount = runtime.navigations.length
  runtime.startSession(otherActor)
  await settle()
  runtime.emit(responseFor(299))
  assert.equal(runtime.navigations.length, navigationCount, "a retained response owner cannot be replaced by another account")
  runtime.emit(responseFor(300))
  assert.equal(runtime.navigations.length, navigationCount + 1, "a new response ID remains deliverable after FIFO eviction")
  runtime.emit(responseFor(300))
  assert.equal(runtime.navigations.length, navigationCount + 1, "recent delivered IDs remain deduplicated")
  assert.equal(runtime.observedResponseOwnerCount, 256)
})

test("pending responses stay FIFO bounded and the newest queued responses replay", async (t) => {
  const runtime = createRuntime({ onResponse: () => false })
  t.after(runtime.dispose)
  await settle()
  const responseFor = (index) => ({
    notification: { request: { identifier: `pending-${index}`, content: {
      data: { type: "chat.message", threadId: `thread-${index}` }
    } } }
  })
  for (let index = 0; index < 300; index += 1) runtime.emit(responseFor(index))
  assert.equal(runtime.pendingResponseCount, 256, "pending response objects use the FIFO bound")

  runtime.renderWithCallback(runtime.acceptResponse)
  await settle()
  assert.equal(runtime.navigations.length, 256)
  assert.equal(runtime.navigations[0][1].threadId, "thread-44")
  assert.equal(runtime.navigations.at(-1)[1].threadId, "thread-299")
})

test("changing the response callback keeps its subscription and retries pending delivery", async (t) => {
  const runtime = createRuntime({ ready: false })
  t.after(runtime.dispose)
  await settle()
  runtime.emit(response)
  assert.equal(runtime.navigations.length, 0)
  assert.equal(runtime.responseSubscriptionCount, 1)

  runtime.rerenderWithEquivalentCallback()
  await settle()
  assert.equal(runtime.responseSubscriptionCount, 1, "callback changes do not resubscribe the native listener")
  assert.equal(runtime.responseUnsubscriptionCount, 0)
  assert.equal(runtime.navigations.length, 0)

  runtime.navigationReady()
  await settle()
  assert.equal(runtime.navigations.length, 1, "the pending response survives callback changes")
  assert.equal(runtime.navigations[0][1].threadId, "thread-one")
})
