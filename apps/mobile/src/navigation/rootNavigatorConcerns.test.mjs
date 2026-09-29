import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

// Characterization tests for the root navigation concerns. They execute the
// production callbacks extracted from source with injected native APIs, so
// they cover event logic, not React scheduling or native navigation rendering.
const require = createRequire(import.meta.url)
const { CommonActions } = require("@react-navigation/routers")

// Values built inside the VM carry another realm's prototypes.
const plain = (value) => JSON.parse(JSON.stringify(value))
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

// Each concern names the module that owns it.
const OWNER = {
  bottomNav: "./useBottomNavChrome.ts",
  roomInvites: "./useRoomInviteRouting.ts",
  linking: "./rootLinking.ts",
  matchModal: "./RootNavigator.tsx",
  realtime: "./RootNavigator.tsx"
}

function parse(path) {
  return ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function findInitializer(path, name) {
  const file = parse(path)
  const matches = []
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      matches.push(node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.equal(matches.length, 1, `${path} must declare exactly one ${name}`)
  return matches[0].getText(file)
}

function findJsxAttribute(path, elementName, attributeName) {
  const file = parse(path)
  const matches = []
  const visit = (node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(file) === elementName
    ) {
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(file) === attributeName &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer)
        ) {
          matches.push(attribute.initializer.expression)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.equal(matches.length, 1, `${path} must render exactly one ${elementName}.${attributeName}`)
  return matches[0].getText(file)
}

function evaluate(expression, bindings) {
  const executable = ts.transpileModule(`(${expression})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  return runInNewContext(executable, {
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    ...bindings
  })
}

function loadModule(path) {
  const module = { exports: {} }
  const executable = ts.transpileModule(read(path), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText
  runInNewContext(executable, { module, exports: module.exports, require: () => ({}), URL })
  return module.exports
}

const { shouldDispatchMainTabNavigation } = loadModule("./rootNavigationModel.ts")
const { parseReferralCodeFromUrl } = loadModule("../features/referrals/referralModel.ts")

function createNavigationRef({ ready = true, routeName = "Lobby", params } = {}) {
  const calls = []
  return {
    calls,
    isReady: () => ready,
    getCurrentRoute: () => (routeName ? { name: routeName, key: `${routeName}-1`, params } : undefined),
    navigate: (...args) => { calls.push(["navigate", ...args]) },
    dispatch: (action) => { calls.push(["dispatch", action]) }
  }
}

// ── Bottom navigation dispatch ─────────────────────────────

function bottomNavPress(navigationRef, events) {
  return evaluate(findInitializer(OWNER.bottomNav, "handleBottomNavPress"), {
    navigationRef,
    CommonActions,
    shouldDispatchMainTabNavigation,
    setGlobalMatch: (value) => events.push(["setGlobalMatch", value]),
    dismissGlobalMatch: () => events.push(["setGlobalMatch", null])
  })
}

test("bottom tabs dispatch StackRouter NAVIGATE with pop and merge to the mapped route", () => {
  for (const [key, destination] of [
    ["discover", "Lobby"],
    ["chats", "Inbox"],
    ["myroom", "MyRoom"],
    ["shop", "CosmeticShop"]
  ]) {
    const navigationRef = createNavigationRef({ routeName: "ChatThread" })
    const events = []
    bottomNavPress(navigationRef, events)(key)
    assert.deepEqual(events, [["setGlobalMatch", null]], `${key} dismisses the match modal first`)
    assert.deepEqual(navigationRef.calls, [[
      "dispatch",
      CommonActions.navigate(destination, undefined, { pop: true, merge: true })
    ]])
  }
})

test("bottom tabs ignore presses before readiness and reselection of the focused tab", () => {
  const notReady = createNavigationRef({ ready: false })
  const notReadyEvents = []
  bottomNavPress(notReady, notReadyEvents)("chats")
  assert.deepEqual(notReady.calls, [])
  assert.deepEqual(notReadyEvents, [])

  const focused = createNavigationRef({ routeName: "Inbox" })
  const focusedEvents = []
  bottomNavPress(focused, focusedEvents)("chats")
  assert.deepEqual(focused.calls, [])
  assert.deepEqual(focusedEvents, [], "a focused-tab reselect leaves the match modal alone")
})

test("the root navigator wires route sync, return previews, and tab presses to the chrome", () => {
  const navigator = read("./RootNavigator.tsx")
  assert.match(navigator, /screenListeners=\{screenListeners\}/)
  assert.match(navigator, /onStateChange=\{syncCurrentRouteName\}/)
  assert.match(navigator, /onBottomNavPress=\{handleBottomNavPress\}/)
  assert.match(navigator, /isFullShopCatalogQaPreview=\{IS_FULL_SHOP_CATALOG_QA_PREVIEW\}\s*onBottomNavPress/)
  const chrome = read("./useBottomNavChrome.ts")
  assert.match(chrome, /transitionStart: \(\{ data \}\) => \{\s*if \(sessionEntryRoute !== "Main" \|\| isAccountRestricted\) return/)
  assert.match(chrome, /transitionEnd: \(\{ data \}\) => \{\s*settleRootNavigationChromeReturnPreview\(sessionNavigatorKey, route\.key, data\.closing\)/)
  assert.match(chrome, /gestureCancel: \(\) => \{\s*clearRootNavigationChromeReturnPreview\(sessionNavigatorKey, route\.key\)/)
})

// ── Ready MiniRoom routing ─────────────────────────────────

const actor = {
  session: { mode: "production", sessionToken: "token-one" },
  profile: { userId: "user-one", displayName: "One", avatar: { presetId: "dusk" } }
}

function readyPayload(miniRoomId = "room-1", participants) {
  return {
    miniRoom: {
      miniRoomId,
      lobbyRoomId: "lobby",
      sourceThreadId: "thread-1",
      participantUserIds: ["user-one", "user-two"],
      livekitRoomName: miniRoomId
    },
    mediaSession: { miniRoomId, livekitUrl: "wss://media", token: "media", issuedAt: "2026-01-01T00:00:00.000Z" },
    participants: participants ?? [
      { userId: "user-one", displayName: "One", avatar: { presetId: "dusk" } },
      { userId: "user-two", displayName: "Two", avatar: { presetId: "dawn" } }
    ]
  }
}

function openReadyMiniRoomFor(navigationRef, currentActor = actor) {
  const handledReadyMiniRoomIdsRef = { current: new Set() }
  const open = evaluate(findInitializer(OWNER.roomInvites, "openReadyMiniRoom"), {
    latestSessionActorRef: { current: currentActor },
    navigationRef,
    handledReadyMiniRoomIdsRef,
    createCandidateAvatarSnapshot: (input) => ({ snapshotFor: input.userId, preset: input.avatarSelection.presetId })
  })
  return { open, handledReadyMiniRoomIdsRef }
}

test("a ready MiniRoom opens once with both participants and reopens only when allowed", () => {
  const navigationRef = createNavigationRef()
  const { open, handledReadyMiniRoomIdsRef } = openReadyMiniRoomFor(navigationRef)
  const payload = readyPayload()

  open(payload)
  assert.equal(navigationRef.calls.length, 1)
  const [kind, route, params] = navigationRef.calls[0]
  assert.equal(kind, "navigate")
  assert.equal(route, "MiniRoom")
  assert.equal(params.readyMiniRoom.miniRoom, payload.miniRoom)
  assert.equal(params.readyMiniRoom.mediaSession, payload.mediaSession)
  assert.deepEqual(plain(params.participants.you), { userId: "user-one", displayName: "One" })
  assert.deepEqual(plain(params.participants.partner), {
    userId: "user-two",
    displayName: "Two",
    avatarSnapshot: { snapshotFor: "user-two", preset: "dawn" }
  })
  assert.deepEqual([...handledReadyMiniRoomIdsRef.current], ["room-1"])

  open(payload)
  assert.equal(navigationRef.calls.length, 1, "a duplicate ready event does not stack another MiniRoom")
  open(payload, { allowReopen: true })
  assert.equal(navigationRef.calls.length, 2)
})

test("a ready MiniRoom is ignored before readiness, for non-participants, and without a partner", () => {
  const notReady = createNavigationRef({ ready: false })
  openReadyMiniRoomFor(notReady).open(readyPayload())
  assert.deepEqual(notReady.calls, [])

  const outsider = createNavigationRef()
  openReadyMiniRoomFor(outsider, {
    ...actor,
    profile: { ...actor.profile, userId: "user-three" }
  }).open(readyPayload())
  assert.deepEqual(outsider.calls, [])

  const alone = createNavigationRef()
  const { open, handledReadyMiniRoomIdsRef } = openReadyMiniRoomFor(alone)
  open(readyPayload("room-2", [{ userId: "user-one", displayName: "One", avatar: { presetId: "dusk" } }]))
  assert.deepEqual(alone.calls, [])
  assert.equal(handledReadyMiniRoomIdsRef.current.size, 0, "an unopened room is not marked handled")

  const signedOut = createNavigationRef()
  openReadyMiniRoomFor(signedOut, null).open(readyPayload())
  assert.deepEqual(signedOut.calls, [])
})

test("ending a session forgets opened MiniRooms and clears the invite timeline", () => {
  const handledReadyMiniRoomIdsRef = { current: new Set(["room-1"]) }
  const inviteUpdates = []
  evaluate(findInitializer(OWNER.roomInvites, "resetRoomInviteRouting"), {
    handledReadyMiniRoomIdsRef,
    setRoomInvites: (value) => inviteUpdates.push(value)
  })()
  assert.equal(handledReadyMiniRoomIdsRef.current.size, 0)
  assert.deepEqual(plain(inviteUpdates), [[]])
})

function demoInviteHandler(currentActor, invite, opened) {
  return evaluate(findInitializer(OWNER.roomInvites, "handleDemoRoomInviteAction"), {
    latestSessionActorRef: { current: currentActor },
    demoRoomInviteAction: () => invite,
    DUMMY_PROFILES: [{ userId: "demo-two", displayName: "Demo Two", avatarPresetId: "dawn" }],
    openReadyMiniRoom: (payload, options) => opened.push([payload, options]),
    createLocalDemoMediaSessionToken: () => "demo-session"
  })
}

test("demo room invitations open the local MiniRoom only once accepted", async () => {
  const demoActor = { ...actor, session: { mode: "demo" } }
  await assert.rejects(
    demoInviteHandler(actor, null, [])({ type: "accept", inviteId: "invite-1" }),
    /demo mode only/
  )
  await assert.rejects(
    demoInviteHandler(demoActor, null, [])({ type: "accept", inviteId: "invite-1" }),
    /no longer available/
  )

  const pending = []
  await demoInviteHandler(demoActor, { status: "pending" }, pending)({ type: "accept", inviteId: "invite-1" })
  assert.deepEqual(pending, [])

  const opened = []
  await demoInviteHandler(demoActor, {
    status: "accepted",
    roomSessionId: "demo-room",
    threadId: "demo-thread",
    senderUserId: "demo-two",
    recipientUserId: "user-one"
  }, opened)({ type: "open_room", inviteId: "invite-1" })
  assert.equal(opened.length, 1)
  const [payload, options] = opened[0]
  assert.deepEqual(plain(options), { allowReopen: true })
  assert.equal(payload.miniRoom.miniRoomId, "demo-room")
  assert.equal(payload.miniRoom.sourceThreadId, "demo-thread")
  assert.deepEqual([...payload.miniRoom.participantUserIds], ["user-one", "demo-two"])
  assert.equal(payload.mediaSession.token, "demo-session")
  assert.equal(payload.participants[1].displayName, "Demo Two")
  assert.equal(payload.participants[1].avatar.presetId, "dawn")
})

// ── Referral capture in linking ────────────────────────────

const REFERRAL_URL = `blumi://r/r_${"a".repeat(32)}`

function linkingWith({ initialUrl = null } = {}) {
  const captured = []
  const events = []
  let urlListener
  let removed = 0
  const linking = evaluate(findInitializer(OWNER.linking, "linking"), {
    Linking: {
      getInitialURL: async () => initialUrl,
      addEventListener: (type, listener) => {
        assert.equal(type, "url")
        urlListener = listener
        return { remove: () => { removed += 1 } }
      }
    },
    parseReferralCodeFromUrl,
    capturePendingReferral: async (referral) => { captured.push(referral) },
    captureProductEvent: (name, properties) => events.push([name, properties])
  })
  return {
    linking,
    captured,
    events,
    emit: (url) => urlListener({ url }),
    get removed() { return removed }
  }
}

test("linking keeps the blumi scheme and route paths", () => {
  const { linking } = linkingWith()
  assert.deepEqual(plain(linking.prefixes), ["blumi://"])
  assert.deepEqual(plain(linking.config.screens), {
    Lobby: "discover",
    Inbox: "inbox",
    ChatThread: "chat/:threadId",
    ProfilePreview: "profile/:userId",
    Settings: "settings",
    MyRoom: "room",
    MyRoomEditor: "room/edit",
    WardrobeV2: "wardrobe",
    CosmeticShop: "shop"
  })
})

test("a referral initial URL is captured and never routed", async () => {
  const runtime = linkingWith({ initialUrl: REFERRAL_URL })
  assert.equal(parseReferralCodeFromUrl(REFERRAL_URL) !== null, true, "fixture must be a referral link")
  assert.equal(await runtime.linking.getInitialURL(), null)
  assert.equal(runtime.captured.length, 1)
  assert.deepEqual(plain(runtime.events), [["referral_link_opened", { source: "initial_url" }]])

  const ordinary = linkingWith({ initialUrl: "blumi://inbox" })
  assert.equal(await ordinary.linking.getInitialURL(), "blumi://inbox")
  assert.deepEqual(ordinary.captured, [])
})

test("a live referral link is captured while other links reach navigation", () => {
  const runtime = linkingWith()
  const routed = []
  const unsubscribe = runtime.linking.subscribe((url) => routed.push(url))
  runtime.emit(REFERRAL_URL)
  runtime.emit("blumi://chat/thread-1")
  assert.deepEqual(routed, ["blumi://chat/thread-1"])
  assert.equal(runtime.captured.length, 1)
  assert.deepEqual(plain(runtime.events), [["referral_link_opened", { source: "app_link" }]])
  unsubscribe()
  assert.equal(runtime.removed, 1)
})

// ── Match modal ────────────────────────────────────────────

function matchSendMessage(globalMatch, thread) {
  const calls = []
  const handler = evaluate(findJsxAttribute(OWNER.matchModal, "MatchResultModal", "onSendMessage"), {
    globalMatch,
    goLobby: () => calls.push(["lobby"]),
    goChat: (params) => calls.push(["chat", params]),
    findThreadForPartner: () => thread
  })
  handler()
  return plain(calls)
}

test("the match modal opens the synced thread, a pending partner chat, or Discover", () => {
  assert.deepEqual(
    matchSendMessage({ miniRoomId: "m", matchedUserName: "Two", matchedUserId: "user-two" }, { threadId: "thread-2" }),
    [["chat", { threadId: "thread-2" }]]
  )
  assert.deepEqual(
    matchSendMessage({ miniRoomId: "m", matchedUserName: "Two", matchedUserId: "user-two" }, undefined),
    [["chat", { partnerId: "user-two", partnerName: "Two" }]]
  )
  assert.deepEqual(matchSendMessage({ miniRoomId: "m", matchedUserName: "Two" }, undefined), [["lobby"]])
})

// ── Global realtime lifecycle wiring ───────────────────────

test("the global realtime lifecycle restarts only on its protected identity inputs", () => {
  const source = read(OWNER.realtime)
  assert.match(source, /const realtimeSessionIdentity = getGlobalRealtimeLifecycleIdentity\(sessionActor\)/)
  assert.match(
    source,
    /useEffect\(\(\) => createGlobalRealtimeLifecycle\(\{[\s\S]*?\}\)\(\), \[\s*isAccountRestricted,\s*refreshProductionThreads,\s*resetInactiveSessionState,\s*realtimeSessionIdentity,\s*sessionEntryRoute\s*\]\)/
  )
  assert.match(source, /clearSessionActor: \(\) => realtimeSessionCallbacksRef\.current\.clearSessionActor\(\)/)
  assert.match(source, /refreshAccountModeration: \(\) => realtimeSessionCallbacksRef\.current\.refreshAccountModeration\(\)/)
  assert.match(source, /useGlobalRealtimeEvents\(handleGlobalEvent\)/)
})
