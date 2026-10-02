import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
// Notification tap routing is owned by a root hook beside RootNavigator.
const routingSource = read("../../navigation/useNotificationResponseRouting.ts")
const routingFile = ts.createSourceFile("useNotificationResponseRouting.ts", routingSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

function rootCallback(name, bindings, sourceFile = routingFile) {
  let initializer
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      initializer = node.initializer
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(initializer, `${name} must have an initializer`)
  const executable = ts.transpileModule(`(${initializer.getText(sourceFile)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  return runInNewContext(executable, { useCallback: (callback) => callback, ...bindings })
}

// Execute production event logic with injected native APIs. This does not model
// React scheduling, notification OS persistence, or native navigation rendering.
function createRuntime({ ready = true, response = null, onResponse, physicalDevice = false, platform = "ios" } = {}) {
  let expoToken = "ExponentPushToken[test]"
  let pushTokenListener
  const channels = []
  let hookIndex = 0
  let scheduledEffects = []
  const hookValues = []
  const mountedEffects = new Map()
  const navigations = []
  const errors = []
  let lastResponse = response
  let clearCount = 0
  let listener
  let responseSubscriptionCount = 0
  let responseUnsubscriptionCount = 0
  let readyGeneration = 0
  let permission = "undetermined"
  const foregroundListeners = new Set()
  const registrations = []
  let permissionRequests = 0
  let currentAppState = "active"
  let notificationHandler
  let activeThreadId = null
  const removals = []
  const presentedClears = []
  const notifications = {
    getPermissionsAsync: async () => ({ status: permission }),
    requestPermissionsAsync: async () => { permissionRequests++; return { status: "granted" } },
    getExpoPushTokenAsync: async () => ({ data: expoToken }),
    AndroidImportance: { DEFAULT: 3, HIGH: 4 },
    setNotificationChannelAsync: async (id, channel) => { channels.push({ id, ...channel }) },
    setNotificationHandler: (handler) => { notificationHandler = handler },
    addPushTokenListener: (callback) => { pushTokenListener = callback; return { remove: () => { pushTokenListener = undefined } } },
    addNotificationResponseReceivedListener: (callback) => {
      responseSubscriptionCount += 1
      listener = callback
      return { remove: () => { responseUnsubscriptionCount += 1; listener = undefined } }
    },
    getLastNotificationResponseAsync: async () => lastResponse,
    clearLastNotificationResponseAsync: async () => { clearCount += 1; lastResponse = null },
    dismissAllNotificationsAsync: async () => { presentedClears.push("dismiss") },
    setBadgeCountAsync: async (count) => { presentedClears.push(`badge:${count}`); return true }
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
    "react-native": { Platform: { OS: platform }, AppState: { get currentState() { return currentAppState }, addEventListener: (_event, callback) => {
      foregroundListeners.add(callback)
      return { remove: () => foregroundListeners.delete(callback) }
    } } },
    "expo-constants": { expoConfig: { extra: { eas: { projectId: "test-project" } } } },
    "expo-device": { isDevice: physicalDevice },
    "expo-notifications": notifications,
    "../../config/env": { MOBILE_HTTP_BASE_URL: "https://api.blumi.test" },
    "../../observability/crashReporting": { captureAppException: (error) => errors.push(error) },
    "./notificationApi": {
      updateNotificationPreferences: async () => {},
      registerDevice: async (_base, token, input) => { registrations.push({ token, ...input }) },
      removeDevice: async (_base, token, pushToken) => { removals.push({ token, pushToken }) }
    },
    "../chat/chatStore": { getActiveChatThreadId: () => activeThreadId }
  }
  const modules = new Map()
  const realModules = [
    "./usePushRegistration", "./notificationTimeZoneSync",
    "./notificationRuntimePolicy", "./pushRegistrationCoordinator", "./notificationRouting",
    "./notificationPresentationModel", "./foregroundNotificationState", "./pushDeviceRegistry"
  ]
  function load(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    // Other relative imports are not part of this delivery path.
    if (!realModules.includes(name)) {
      assert.ok(name.startsWith("."), `Unexpected package dependency: ${name}`)
      return {}
    }
    if (modules.has(name)) return modules.get(name)
    const module = { exports: {} }
    modules.set(name, module.exports)
    const executable = ts.transpileModule(read(`${name}.ts`), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText
    const context = {
      module, exports: module.exports, require: load, __DEV__: false,
      AbortController, setTimeout, clearTimeout,
      fetch: () => { throw new Error("Network access is forbidden in this test") }
    }
    runInNewContext(executable, context)
    return module.exports
  }
  const chatTaps = { decision: { kind: "open" }, decided: [] }
  const sessionBindings = {
    decideChatTap: (threadId) => { chatTaps.decided.push(threadId); return chatTaps.decision },
    chatListVersion: 0,
    sessionEntryRoute: "Main",
    isAccountRestricted: false,
    isCurrentSession: (expected) => expected.profile.userId === currentActor?.profile.userId &&
      expected.session.sessionId === currentActor?.session.sessionId &&
      expected.session.sessionToken === currentActor?.session.sessionToken,
    navigationRef,
    resolveNotificationDestination: load("./notificationRouting").resolveNotificationDestination
  }
  const routeResponse = rootCallback("handleNotificationResponseData", sessionBindings, routingFile)
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
  // RootNavigator's onReady marks navigation ready and bumps the generation
  // that usePushRegistration watches to replay deferred taps.
  const navigationReady = () => {
    ready = true
    readyGeneration += 1
  }
  renderHook(actor)
  return {
    chatTaps, channels,
    rotatePushToken: (token) => { expoToken = token; pushTokenListener?.({ type: platform, data: "device-token" }) },
    navigations, errors,
    registrations, removals, presentedClears,
    modules,
    setActiveThread: (id) => { activeThreadId = id },
    handleForegroundNotification: (data) => notificationHandler.handleNotification({ request: { content: { data } } }),
    get permissionRequests() { return permissionRequests },
    get foregroundListenerCount() { return foregroundListeners.size },
    setPermission: (status) => { permission = status },
    appState: (state) => { currentAppState = state; for (const callback of foregroundListeners) callback(state) },
    maxResponses: load("./usePushRegistration").MAX_OBSERVED_RESPONSE_OWNERS,
    androidImportance: notifications.AndroidImportance,
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

test("foreground banners are hidden only for messages in the actively viewed conversation", async () => {
  const runtime = createRuntime()
  await settle()
  runtime.setActiveThread("thread-one")
  const visibleChat = await runtime.handleForegroundNotification({ type: "chat.message", threadId: "thread-one" })
  assert.equal(visibleChat.shouldShowBanner, false)
  assert.equal(visibleChat.shouldShowList, false)
  const otherChat = await runtime.handleForegroundNotification({ type: "chat.message", threadId: "thread-two" })
  assert.equal(otherChat.shouldShowBanner, true)
  const match = await runtime.handleForegroundNotification({ type: "discovery.match", threadId: "thread-one" })
  assert.equal(match.shouldShowBanner, true)
  runtime.appState("background")
  assert.equal((await runtime.handleForegroundNotification({ type: "chat.message", threadId: "thread-one" })).shouldShowBanner, true)
  runtime.appState("active")
  runtime.setActiveThread(null)
  assert.equal((await runtime.handleForegroundNotification({ type: "chat.message", threadId: "thread-one" })).shouldShowBanner, true)
  runtime.dispose()
})

test("iOS inactive transitions do not turn a visible conversation into a push banner", async () => {
  const runtime = createRuntime()
  await settle()
  const state = runtime.modules.get("./foregroundNotificationState")
  const release = state.registerFocusedConversation("thread-visible")
  runtime.setActiveThread(null)
  runtime.appState("inactive")
  const visible = await runtime.handleForegroundNotification({ type: "chat.message", threadId: "thread-visible", messageId: "inactive-visible" })
  assert.equal(visible.shouldShowBanner, false)
  assert.equal(visible.shouldShowList, false)
  release()
  runtime.appState("background")
  const unseen = await runtime.handleForegroundNotification({ type: "chat.message", threadId: "thread-visible", messageId: "new-background" })
  assert.equal(unseen.shouldShowBanner, true)
  runtime.dispose()
})

test("room message banners stay hidden before thread resolution and recover after room exit", async () => {
  const runtime = createRuntime()
  await settle()
  const release = runtime.modules.get("./foregroundNotificationState").registerRoomMessageAlertSuppression()
  const received = await runtime.handleForegroundNotification({ type: "chat.message", threadId: "unresolved-room-thread", messageId: "room-push" })
  assert.equal(received.shouldShowBanner, false)
  assert.equal(received.shouldShowList, false)
  release()
  assert.equal((await runtime.handleForegroundNotification({ type: "chat.message", threadId: "other-thread", messageId: "after-room" })).shouldShowBanner, true)
  runtime.dispose()
})

test("foreground registers permission granted in iOS Settings without prompting, and cleans up on logout", async () => {
  const runtime = createRuntime({ physicalDevice: true })
  await settle()
  assert.equal(runtime.registrations.length, 0)
  runtime.setPermission("granted")
  runtime.appState("background")
  await settle()
  assert.equal(runtime.registrations.length, 0)
  runtime.appState("active")
  await settle()
  assert.equal(runtime.registrations.length, 1)
  assert.equal(runtime.permissionRequests, 0)
  assert.equal(runtime.registrations[0].token, "token-one")
  runtime.startSession(null)
  assert.equal(runtime.foregroundListenerCount, 0)
  runtime.appState("active")
  await settle()
  assert.equal(runtime.registrations.length, 1)
  runtime.dispose()
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

test("response owner history stays FIFO bounded and retains recent account isolation", async (t) => {
  const runtime = createRuntime()
  t.after(runtime.dispose)
  await settle()

  const responseFor = (index) => ({
    notification: { request: { identifier: `notification-${index}`, content: {
      data: { type: "chat.message", threadId: "thread-one" }
    } } }
  })
  const total = runtime.maxResponses + 44
  for (let index = 0; index < total; index += 1) runtime.emit(responseFor(index))

  runtime.dispose()
  const otherActor = {
    session: { mode: "production", userId: "user-two", sessionId: "session-two", sessionToken: "token-two" },
    profile: { userId: "user-two" }
  }
  runtime.setCurrentActor(otherActor)
  const navigationCount = runtime.navigations.length
  runtime.startSession(otherActor)
  await settle()
  runtime.emit(responseFor(total - 1))
  assert.equal(runtime.navigations.length, navigationCount, "a retained response owner cannot be replaced by another account")
  runtime.emit(responseFor(total - runtime.maxResponses))
  assert.equal(runtime.navigations.length, navigationCount, "the oldest retained owner is still remembered")
  runtime.emit(responseFor(total))
  assert.equal(runtime.navigations.length, navigationCount + 1, "a new response ID remains deliverable after FIFO eviction")
  runtime.emit(responseFor(total))
  assert.equal(runtime.navigations.length, navigationCount + 1, "recent delivered IDs remain deduplicated")
  runtime.emit(responseFor(0))
  assert.equal(runtime.navigations.length, navigationCount + 2, "owner history is bounded: the oldest IDs were evicted")
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
  const total = runtime.maxResponses + 44
  for (let index = 0; index < total; index += 1) runtime.emit(responseFor(index))

  runtime.renderWithCallback(runtime.acceptResponse)
  await settle()
  assert.equal(runtime.navigations.length, runtime.maxResponses, "pending responses use the FIFO bound")
  assert.equal(runtime.navigations[0][1].threadId, `thread-${total - runtime.maxResponses}`)
  assert.equal(runtime.navigations.at(-1)[1].threadId, `thread-${total - 1}`)
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

test("a room invite for the open conversation and a message the toast already showed do not banner", async () => {
  const runtime = createRuntime()
  await settle()
  runtime.setActiveThread("thread-one")
  const invite = await runtime.handleForegroundNotification({ type: "chat.room_invite", threadId: "thread-one", inviteId: "invite-one" })
  assert.equal(invite.shouldShowBanner, false)
  runtime.setActiveThread(null)
  const otherInvite = await runtime.handleForegroundNotification({ type: "chat.room_invite", threadId: "thread-one", inviteId: "invite-two" })
  assert.equal(otherInvite.shouldShowBanner, true)
  const state = runtime.modules.get("./foregroundNotificationState")
  assert.equal(state.claimForegroundAlert("message:toast-shown"), true, "the in-app toast claims first")
  const toastShown = await runtime.handleForegroundNotification({ type: "chat.message", threadId: "thread-two", messageId: "toast-shown" })
  assert.equal(toastShown.shouldShowBanner, false)
  const release = state.registerFocusedConversation("thread-room")
  const inRoom = await runtime.handleForegroundNotification({ type: "chat.message", threadId: "thread-room", messageId: "room-message" })
  assert.equal(inRoom.shouldShowBanner, false, "the shared room shows its conversation's messages itself")
  release()
  runtime.dispose()
})

test("logout removes this device's registration with the still-valid session and clears its notifications", async () => {
  const runtime = createRuntime({ physicalDevice: true })
  await settle()
  runtime.setPermission("granted")
  runtime.appState("active")
  await settle()
  assert.equal(runtime.registrations.length, 1)
  runtime.startSession(null)
  await settle()
  assert.deepEqual(runtime.removals, [{ token: "token-one", pushToken: "ExponentPushToken[test]" }])
  assert.deepEqual([...runtime.presentedClears].sort(), ["badge:0", "dismiss"])
  const registry = runtime.modules.get("./pushDeviceRegistry")
  await registry.removeRegisteredPushDevice("user-one", async () => { throw new Error("must not remove twice") })
  assert.equal(runtime.removals.length, 1)
  runtime.dispose()
})

test("a tapped push addressed to another account is ignored", async (t) => {
  const runtime = createRuntime({ response: {
    notification: { request: { identifier: "other-account", content: {
      data: { type: "chat.message", threadId: "thread-one", recipientUserId: "user-two" }
    } } }
  } })
  t.after(runtime.dispose)
  await settle()
  assert.equal(runtime.navigations.length, 0)
  runtime.emit({ notification: { request: { identifier: "own-account", content: {
    data: { type: "chat.message", threadId: "thread-one", recipientUserId: "user-one" }
  } } } })
  assert.equal(runtime.navigations.length, 1)
})

test("a cold-start tap for a removed conversation waits for the thread list, then opens the Inbox once", async (t) => {
  const runtime = createRuntime({ response })
  t.after(runtime.dispose)
  runtime.chatTaps.decision = { kind: "wait", retryInMs: 4000 }
  await settle()
  assert.equal(runtime.navigations.length, 0, "the list has not arrived yet")
  assert.equal(runtime.clearCount, 0, "a waiting tap stays cached")
  runtime.chatTaps.decision = { kind: "inbox" }
  runtime.rerenderWithEquivalentCallback()
  await settle()
  assert.deepEqual(runtime.navigations, [["Inbox"]])
  assert.equal(runtime.clearCount, 1)
  runtime.rerenderWithEquivalentCallback()
  await settle()
  assert.equal(runtime.navigations.length, 1, "exactly once")
  assert.deepEqual(runtime.chatTaps.decided, ["thread-one", "thread-one"])
})

test("room invite taps open their conversation through the same gate", async (t) => {
  const runtime = createRuntime()
  t.after(runtime.dispose)
  await settle()
  runtime.emit({ notification: { request: { identifier: "invite", content: {
    data: { type: "chat.room_invite", threadId: "thread-invite", inviteId: "expired-invite" }
  } } } })
  assert.equal(JSON.stringify(runtime.navigations), JSON.stringify([["ChatThread", { threadId: "thread-invite" }]]))
})

test("a rotated push token re-registers and removes the stale token from the same account", async (t) => {
  const runtime = createRuntime({ physicalDevice: true })
  t.after(runtime.dispose)
  await settle()
  runtime.setPermission("granted")
  runtime.appState("active")
  await settle()
  assert.equal(runtime.registrations.length, 1)
  runtime.rotatePushToken("ExponentPushToken[rotated]")
  await settle()
  assert.deepEqual(runtime.registrations.map((entry) => entry.pushToken), ["ExponentPushToken[test]", "ExponentPushToken[rotated]"])
  assert.deepEqual(runtime.removals, [{ token: "token-one", pushToken: "ExponentPushToken[test]" }])
  assert.equal(runtime.permissionRequests, 0, "token rotation never prompts")
})

test("the Android channel every push uses is created with HIGH importance for heads-up banners", async (t) => {
  const runtime = createRuntime({ physicalDevice: true, platform: "android" })
  t.after(runtime.dispose)
  runtime.setPermission("granted")
  runtime.appState("active")
  await settle()
  assert.equal(runtime.channels.length > 0, true)
  const channel = runtime.channels.at(-1)
  assert.equal(channel.id, "default")
  assert.ok(channel.importance >= runtime.androidImportance.HIGH, "heads-up banners need HIGH importance")
  assert.equal(runtime.registrations.at(-1)?.platform, "android")
})
