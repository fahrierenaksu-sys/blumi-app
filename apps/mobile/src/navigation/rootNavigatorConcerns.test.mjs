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
  chat: "./useRootChatSync.ts",
  linking: "./rootLinking.ts",
  matchModal: "./useMatchModal.ts",
  realtime: "./useGlobalRealtimeSession.ts",
  sessionReset: "./RootNavigator.tsx"
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

// `pager` models the main-page pager: undefined means the rollback path
// (MAIN_TAB_PAGER_ENABLED = false); otherwise it answers pager requests.
function bottomNavPress(navigationRef, events, pager) {
  return evaluate(findInitializer(OWNER.bottomNav, "handleBottomNavPress"), {
    navigationRef,
    CommonActions,
    shouldDispatchMainTabNavigation,
    MAIN_TAB_PAGER_ENABLED: pager !== undefined,
    requestMainTabPagerPage: (key) => {
      events.push(["pager", key])
      return pager?.(key) ?? false
    },
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

test("with the pager, a tab press selects the page through the pager and never also navigates the stack", () => {
  const navigationRef = createNavigationRef({ routeName: "Inbox" })
  const events = []
  bottomNavPress(navigationRef, events, () => true)("shop")
  assert.deepEqual(events, [["setGlobalMatch", null], ["pager", "shop"]])
  assert.deepEqual(navigationRef.calls, [], "one navigation per tap: the pager's commit")
})

test("with the pager covered by a detail route, a tab press falls back to the stack navigate", () => {
  const navigationRef = createNavigationRef({ routeName: "ChatThread" })
  const events = []
  bottomNavPress(navigationRef, events, () => false)("myroom")
  assert.deepEqual(events, [["setGlobalMatch", null], ["pager", "myroom"]])
  assert.deepEqual(navigationRef.calls, [[
    "dispatch",
    CommonActions.navigate("MyRoom", undefined, { pop: true, merge: true })
  ]])
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
  assert.match(navigator, /onStateChange=\{handleNavigationStateChange\}/)
  assert.match(navigator, /onBottomNavPress=\{handleBottomNavPress\}/)
  assert.match(navigator, /isFullShopCatalogQaPreview=\{IS_FULL_SHOP_CATALOG_QA_PREVIEW\}\s*onBottomNavPress/)
  const chrome = read("./useBottomNavChrome.ts")
  assert.match(chrome, /transitionStart: \(\{ data \}\) => \{\s*if \(sessionEntryRoute !== "Main" \|\| isAccountRestricted\) return/)
  // The bar must not appear while a back swipe is still sliding the page:
  // transitionStart never publishes a return preview; transitionEnd publishes
  // it already completed, then falls back to settling.
  const transitionStart = chrome.slice(chrome.indexOf("transitionStart:"), chrome.indexOf("transitionEnd:"))
  assert.doesNotMatch(transitionStart, /publishRootNavigationChromeReturnPreview|resolveBottomNavReturnPreview/)
  const transitionEnd = chrome.slice(chrome.indexOf("transitionEnd:"), chrome.indexOf("gestureCancel:"))
  assert.match(transitionEnd, /publishRootNavigationChromeReturnPreview\(sessionNavigatorKey, \{ \.\.\.preview, completed: true \}\)/)
  assert.match(transitionEnd, /settleRootNavigationChromeReturnPreview\(sessionNavigatorKey, route\.key, data\.closing\)/)
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

// ── Chat route bindings ────────────────────────────────────

function chatThreadBindings(sessionMode) {
  const handlers = {
    sendChatMessageForRoute: () => "send",
    requestMessagesForRoute: () => "request",
    markChatThreadRead: () => "read",
    handleDemoRoomInviteAction: () => "demo-invite",
    handleRoomInviteAction: () => "production-invite",
    closeMyActiveRoom: () => "close-room"
  }
  const bindings = evaluate(findInitializer(OWNER.chat, "chatThreadBindings"), {
    ...handlers,
    visibleRoomInvites: ["invite"],
    sessionMode,
    chatLocale: "tr"
  })
  return { bindings, handlers }
}

test("chat routes receive demo-aware invite handlers and production-only room closing", () => {
  const production = chatThreadBindings("production")
  assert.deepEqual(Object.keys(production.bindings), [
    "sendChatMessage",
    "requestMessages",
    "markThreadRead",
    "roomInvites",
    "onRoomInviteAction",
    "onCloseActiveRoom",
    "locale"
  ])
  assert.equal(production.bindings.sendChatMessage, production.handlers.sendChatMessageForRoute)
  assert.equal(production.bindings.requestMessages, production.handlers.requestMessagesForRoute)
  assert.equal(production.bindings.markThreadRead, production.handlers.markChatThreadRead)
  assert.deepEqual(plain(production.bindings.roomInvites), ["invite"])
  assert.equal(production.bindings.onRoomInviteAction, production.handlers.handleRoomInviteAction)
  assert.equal(production.bindings.onCloseActiveRoom, production.handlers.closeMyActiveRoom)
  assert.equal(production.bindings.locale, "tr")

  const demo = chatThreadBindings("demo")
  assert.equal(demo.bindings.onRoomInviteAction, demo.handlers.handleDemoRoomInviteAction)
  assert.equal(demo.bindings.onCloseActiveRoom, undefined)
})

test("the ChatThread screen receives the chat bindings as a prop, never through route params", () => {
  const navigator = read("./RootNavigator.tsx")
  const chatRoute = navigator.match(/<Stack\.Screen\s+name="ChatThread"([\s\S]*?)<\/Stack\.Screen>/)?.[1] ?? ""
  assert.match(chatRoute, /bindings=\{chatThreadBindings\}/)
  assert.match(chatRoute, /onThreadCreated=\{applyNewThread\}/)
  assert.doesNotMatch(chatRoute, /route=\{/, "the chat route must not rewrite its params")
  // Opening chat from the match modal navigates with ids only.
  assert.match(read(OWNER.matchModal), /navigationRef\.navigate\("ChatThread", params\)/)
  assert.doesNotMatch(read(OWNER.matchModal), /chatThreadBindings|chatThreadRouteBindings/)
})

// ── Linking: referral capture and pending deep links ───────

const REFERRAL_URL = `blumi://r/r_${"a".repeat(32)}`
const { createPendingDeepLinkStore } = loadModule("./pendingDeepLink.ts")
const OWNER_A = { userId: "user-a", sessionId: "session-a" }
const OWNER_B = { userId: "user-b", sessionId: "session-b" }
const MAIN_ROUTE_NAMES = ["Lobby", "Inbox", "ChatThread", "ProfilePreview", "Settings", "MyRoom", "MyRoomEditor", "WardrobeV2", "CosmeticShop"]

function sessionActorFor(owner) {
  return owner ? { profile: { userId: owner.userId }, session: { sessionId: owner.sessionId } } : null
}

function findFunction(path, name) {
  const file = parse(path)
  const matches = []
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) {
      const parameters = node.parameters.map((parameter) => parameter.getText(file)).join(", ")
      matches.push(`function ${name}(${parameters}) ${node.body.getText(file)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.equal(matches.length, 1, `${path} must declare exactly one function ${name}`)
  return matches[0]
}

function linkingWith({ initialUrl = null } = {}) {
  const captured = []
  const events = []
  const routed = []
  const navigation = { ready: false, routeNames: undefined }
  let nowMs = 0
  let urlListener
  let removed = 0
  const ROOT_LINK_SCREENS = evaluate(findInitializer(OWNER.linking, "ROOT_LINK_SCREENS"), {})
  const pendingDeepLinks = createPendingDeepLinkStore({
    prefixes: ["blumi://"],
    screens: ROOT_LINK_SCREENS,
    now: () => nowMs,
    navigation: {
      isReady: () => navigation.ready,
      getRouteNames: () => navigation.routeNames
    }
  })
  const linking = evaluate(findInitializer(OWNER.linking, "linking"), {
    Linking: {
      getInitialURL: async () => initialUrl,
      addEventListener: (type, listener) => {
        assert.equal(type, "url")
        urlListener = listener
        return { remove: () => { removed += 1 } }
      }
    },
    ROOT_LINK_SCREENS,
    pendingDeepLinks,
    parseReferralCodeFromUrl,
    capturePendingReferral: async (referral) => { captured.push(referral) },
    captureProductEvent: (name, properties) => events.push([name, properties])
  })
  const renderPendingDeepLinkReplay = evaluate(findFunction("./usePendingDeepLinkReplay.ts", "usePendingDeepLinkReplay"), {
    useEffect: (effect) => { effect() },
    pendingDeepLinks
  })
  let generation = 0
  // One root render: the session selects its entry route, and the container
  // shows the matching navigator once navigation is ready.
  const render = ({ route, owner = null, restricted = false, ready = true }) => {
    navigation.ready = ready
    navigation.routeNames = !ready
      ? undefined
      : restricted
        ? ["AccountRestriction", "Legal"]
        : route === "Main"
          ? MAIN_ROUTE_NAMES
          : route === "AuthEntry"
            ? ["AuthEntry", "PreAuthSetup", "Register", "Legal"]
            : [route, "Legal"]
    if (ready) generation += 1
    return renderPendingDeepLinkReplay({
      sessionActor: sessionActorFor(owner),
      sessionEntryRoute: route,
      isAccountRestricted: restricted,
      navigationReadyGeneration: generation
    })
  }
  return {
    linking,
    captured,
    events,
    routed,
    pendingDeepLinks,
    render,
    advance: (ms) => { nowMs += ms },
    // Mount the container: subscribe first, then resolve the initial URL.
    mount: async () => {
      const unsubscribe = linking.subscribe((url) => routed.push(url))
      const initial = await linking.getInitialURL()
      return { unsubscribe, initial }
    },
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
  assert.match(read(OWNER.linking), /export const pendingDeepLinks = createPendingDeepLinkStore\(\{\s*prefixes: linking\.prefixes,\s*screens: ROOT_LINK_SCREENS,/)
})

test("a referral initial URL is captured and never routed", async () => {
  const runtime = linkingWith({ initialUrl: REFERRAL_URL })
  assert.equal(parseReferralCodeFromUrl(REFERRAL_URL) !== null, true, "fixture must be a referral link")
  runtime.render({ route: "Main", owner: OWNER_A })
  assert.equal(await runtime.linking.getInitialURL(), null)
  assert.equal(runtime.captured.length, 1)
  assert.deepEqual(plain(runtime.events), [["referral_link_opened", { source: "initial_url" }]])
  assert.equal(runtime.pendingDeepLinks.peek(), null, "a referral is never kept as a pending deep link")

  const ordinary = linkingWith({ initialUrl: "blumi://inbox" })
  ordinary.render({ route: "Main", owner: OWNER_A, ready: false })
  assert.equal(await ordinary.linking.getInitialURL(), "blumi://inbox")
  assert.deepEqual(ordinary.captured, [])
})

test("a live referral link is captured while other links reach navigation", () => {
  const runtime = linkingWith()
  runtime.render({ route: "Main", owner: OWNER_A })
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

test("a referral link before Main is captured and never replayed as navigation", async () => {
  const runtime = linkingWith({ initialUrl: REFERRAL_URL })
  runtime.render({ route: "Splash", ready: false })
  runtime.render({ route: "AuthEntry", ready: false })
  const { initial } = await runtime.mount()
  runtime.render({ route: "AuthEntry" })
  runtime.emit(REFERRAL_URL)
  runtime.render({ route: "Main", owner: OWNER_A })
  assert.equal(initial, null)
  assert.equal(runtime.captured.length, 2, "one initial and one live referral capture")
  assert.deepEqual(runtime.routed, [])
  assert.equal(runtime.pendingDeepLinks.peek(), null)
})

test("a cold-start link during Splash replays once after the restored session reaches Main", async () => {
  const runtime = linkingWith({ initialUrl: "blumi://chat/thread-7" })
  runtime.render({ route: "Splash", ready: false })
  // The container mounts on the first non-Splash render (onboarding here).
  runtime.render({ route: "ProfileSetup", owner: OWNER_A, ready: false })
  const { initial } = await runtime.mount()
  assert.equal(initial, null, "the onboarding navigator never receives the link")
  runtime.render({ route: "ProfileSetup", owner: OWNER_A })
  assert.deepEqual(runtime.routed, [])
  const replayOnStateChange = runtime.render({ route: "Main", owner: OWNER_A })
  assert.deepEqual(runtime.routed, ["blumi://chat/thread-7"])
  replayOnStateChange()
  runtime.render({ route: "Main", owner: OWNER_A })
  assert.deepEqual(runtime.routed, ["blumi://chat/thread-7"], "replayed exactly once")
})

test("the root state-change hook replays a link once the Main stack registers its routes", async () => {
  const runtime = linkingWith()
  runtime.render({ route: "RoomSetup", owner: OWNER_A })
  await runtime.mount()
  runtime.emit("blumi://inbox")
  assert.deepEqual(runtime.routed, [])
  // Main is selected, but the container does not report the Main routes yet.
  const replayOnStateChange = runtime.render({ route: "Main", owner: OWNER_A, ready: false })
  assert.deepEqual(runtime.routed, [])
  runtime.render({ route: "Main", owner: OWNER_A })
  replayOnStateChange()
  assert.deepEqual(runtime.routed, ["blumi://inbox"])
})

test("a pending link is discarded on sign-out", async () => {
  const runtime = linkingWith()
  runtime.render({ route: "AvatarSetup", owner: OWNER_A })
  await runtime.mount()
  runtime.emit("blumi://settings")
  runtime.render({ route: "AuthEntry" })
  runtime.render({ route: "Main", owner: OWNER_A })
  assert.deepEqual(runtime.routed, [])
})

test("a pending link is discarded on account switch", async () => {
  const runtime = linkingWith()
  runtime.render({ route: "AvatarSetup", owner: OWNER_A })
  await runtime.mount()
  runtime.emit("blumi://settings")
  runtime.render({ route: "Main", owner: OWNER_B })
  assert.deepEqual(runtime.routed, [])
  assert.equal(runtime.pendingDeepLinks.peek(), null)
})

test("an expired pending link is discarded", async () => {
  const runtime = linkingWith({ initialUrl: "blumi://shop" })
  runtime.render({ route: "AuthEntry" })
  await runtime.mount()
  runtime.advance(10 * 60 * 1000 + 1)
  runtime.render({ route: "Main", owner: OWNER_A })
  assert.deepEqual(runtime.routed, [])
})

test("an unknown deep link path is ignored before Main", async () => {
  const runtime = linkingWith({ initialUrl: "blumi://admin/secret" })
  runtime.render({ route: "AuthEntry" })
  await runtime.mount()
  runtime.emit("blumi://nowhere")
  runtime.render({ route: "Main", owner: OWNER_A })
  assert.deepEqual(runtime.routed, [])
})

test("a restricted account never receives a pending link", async () => {
  const runtime = linkingWith()
  runtime.render({ route: "ProfileSetup", owner: OWNER_A })
  await runtime.mount()
  runtime.emit("blumi://inbox")
  runtime.render({ route: "Main", owner: OWNER_A, restricted: true })
  runtime.emit("blumi://shop")
  assert.deepEqual(runtime.routed, [])
})

test("a link that arrives in Main navigates immediately as before", async () => {
  const runtime = linkingWith({ initialUrl: "blumi://profile/user-3" })
  runtime.render({ route: "Main", owner: OWNER_A, ready: false })
  const { initial, unsubscribe } = await runtime.mount()
  assert.equal(initial, "blumi://profile/user-3", "the initial URL still becomes the initial state")
  runtime.render({ route: "Main", owner: OWNER_A })
  runtime.emit("blumi://chat/thread-3")
  assert.deepEqual(runtime.routed, ["blumi://chat/thread-3"])
  runtime.render({ route: "Main", owner: OWNER_A })
  assert.deepEqual(runtime.routed, ["blumi://chat/thread-3"], "nothing is replayed afterwards")
  unsubscribe()
  runtime.emit("blumi://inbox")
  assert.deepEqual(runtime.routed, ["blumi://chat/thread-3"], "an unsubscribed container is never called")
})

test("the root navigator wires pending deep link replay to readiness and state changes", () => {
  const navigator = read("./RootNavigator.tsx")
  assert.match(navigator, /const replayPendingDeepLink = usePendingDeepLinkReplay\(\{\s*sessionActor,\s*sessionEntryRoute,\s*isAccountRestricted,\s*navigationReadyGeneration\s*\}\)/)
  const calls = []
  const stateChange = evaluate(findInitializer("./RootNavigator.tsx", "handleNavigationStateChange"), {
    syncCurrentRouteName: () => calls.push("sync"),
    replayPendingDeepLink: () => calls.push("replay")
  })
  stateChange()
  assert.deepEqual(calls, ["sync", "replay"])
})

// ── Match modal ────────────────────────────────────────────

function matchSendMessage(globalMatch, thread) {
  const calls = []
  const handler = evaluate(findInitializer(OWNER.matchModal, "handleMatchSendMessage"), {
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
  assert.equal(
    findJsxAttribute("./RootNavigator.tsx", "MatchResultModal", "onSendMessage"),
    "handleMatchSendMessage"
  )
})

test("the match modal presents each match once and reports match_created through the shared model", () => {
  const { presentConnectionMatch } = loadModule("../features/connections/connectionMatchPresentation.ts")
  const { getMatchCreatedProperties } = loadModule("../features/matches/matchResultPresentation.ts")
  const handledMatchIdsRef = { current: new Set() }
  const events = []
  const shown = []
  const presentMatch = evaluate(findInitializer(OWNER.matchModal, "presentMatch"), {
    presentConnectionMatch,
    getMatchCreatedProperties,
    handledMatchIdsRef,
    captureProductEvent: (name, properties) => events.push([name, properties]),
    showToast: () => undefined,
    setGlobalMatch: (value) => shown.push(value)
  })
  const match = { miniRoomId: "match-1", matchedUserId: "user-two", matchedUserName: "Two", mode: "production" }
  presentMatch(match)
  presentMatch(match)
  assert.deepEqual(plain(events), [["match_created", { source: "mini_room_mutual_save", mode: "production" }]])
  assert.deepEqual(plain(shown), [{ miniRoomId: "match-1", matchedUserName: "Two", matchedUserId: "user-two" }])
})

test("ending a session forgets presented and reconciling matches and closes the modal", () => {
  const handledMatchIdsRef = { current: new Set(["match-1"]) }
  const reconcilingMatchIdsRef = { current: new Set(["match-2"]) }
  const modalUpdates = []
  evaluate(findInitializer(OWNER.matchModal, "resetMatchModal"), {
    handledMatchIdsRef,
    reconcilingMatchIdsRef,
    setGlobalMatch: (value) => modalUpdates.push(value)
  })()
  assert.equal(handledMatchIdsRef.current.size, 0)
  assert.equal(reconcilingMatchIdsRef.current.size, 0)
  assert.deepEqual(modalUpdates, [null])
})

test("an inactive session resets demo mode, matches, invites, chat, and the socket in order", () => {
  const calls = []
  let demo = true
  evaluate(findInitializer(OWNER.sessionReset, "resetInactiveSessionState"), {
    isDemoMode: () => demo,
    setDemoMode: (value) => { demo = value; calls.push(["demo", value]) },
    resetMatchModal: () => calls.push(["matches"]),
    resetRoomInviteRouting: () => calls.push(["invites"]),
    resetChatStore: () => calls.push(["chat"]),
    disconnectGlobal: () => calls.push(["disconnect"])
  })()
  assert.deepEqual(calls, [["demo", false], ["matches"], ["invites"], ["chat"], ["disconnect"]])
})

// ── Notification responses ─────────────────────────────────

test("push registration is scoped to the unrestricted main session and replays on readiness", () => {
  const routing = read("./useNotificationResponseRouting.ts")
  assert.match(
    routing,
    /usePushRegistration\(\s*sessionEntryRoute === "Main" && !isAccountRestricted \? sessionActor : null,\s*handleNotificationResponseData,\s*navigationReadyGeneration\s*\)/
  )
  const navigator = read("./RootNavigator.tsx")
  assert.match(navigator, /const pushRegistration = useNotificationResponseRouting\(\{[\s\S]*?navigationReadyGeneration\s*\}\)/)
  assert.match(navigator, /setNavigationReadyGeneration\(\(generation\) => generation \+ 1\)/)
  assert.match(navigator, /onRequestPushPermission=\{pushRegistration\.requestPermission\}/)
})

// ── Global realtime lifecycle wiring ───────────────────────

test("the global realtime lifecycle restarts only on its protected identity inputs", () => {
  const source = read(OWNER.realtime)
  assert.match(source, /const realtimeSessionIdentity = getGlobalRealtimeLifecycleIdentity\(sessionActor\)/)
  assert.match(
    source,
    /useEffect\(\(\) => createGlobalRealtimeLifecycle\(\{[\s\S]*?\}\)\(\), \[\s*isAccountRestricted,\s*refreshProductionThreads,\s*resetInactiveSessionState,\s*realtimeSessionIdentity,\s*sessionEntryRoute\s*\]\)/
  )
  assert.match(source, /sessionActor: readLifecycleSessionActor\(\),/)
  assert.match(source, /isCurrentSession: \(expectedActor\) => isLatestSession\(expectedActor\),/)
  assert.match(source, /clearSessionActor: \(\) => clearLatestSessionActor\(\)/)
  assert.match(source, /refreshAccountModeration: \(\) => refreshLatestAccountModeration\(\)/)
  assert.match(source, /useGlobalRealtimeEvents\(handleGlobalEvent\)/)
  // Session callbacks are effect events (latest commit), never refs written during render.
  for (const name of ["readLifecycleSessionActor", "isLatestSession", "clearLatestSessionActor", "refreshLatestAccountModeration", "resynchronizeLatestMessages"]) {
    assert.match(source, new RegExp(`const ${name} = useEffectEvent\\(`))
  }
  assert.doesNotMatch(source, /\.current = /)
  // Behaviour (reconnect only on identity, latest callbacks) is covered by
  // globalRealtimeSessionLifecycle.test.ts.

  const navigator = read(OWNER.sessionReset)
  assert.match(navigator, /useGlobalRealtimeSession\(\{[\s\S]*?resetInactiveSessionState,[\s\S]*?onConnectionMatched: handleRealtimeConnectionMatch,\s*onPartnerBlocked: applyConfirmedPartnerBlock\s*\}\)/)
  // Local blocks and the server's confirmation share one chat cleanup.
  assert.match(navigator, /const applyConfirmedPartnerBlock = useBlockedPartnerCleanup\(sessionActor\?\.profile\.userId\)/)
  // Every block entry point (report sheet, block-only, demo report) goes through blockUser, which announces it.
  const blockStore = read("../features/safety/blockStore.ts")
  const blockUserBody = blockStore.slice(blockStore.indexOf("export function blockUser("), blockStore.indexOf("export function unblockUser("))
  assert.match(blockUserBody, /publishPartnerBlocked\(\{\s*ownerUserId: normalizeOwnerUserId\(ownerUserId\),\s*blockedUserId\s*\}\)/)
  assert.match(read("./useBlockedPartnerCleanup.ts"), /subscribeToPartnerBlocked\(\(event\) => \{\s*if \(event\.ownerUserId !== currentUserId\) return\s*applyBlockedPartner\(event\.blockedUserId\)/)
  assert.match(navigator, /const resetInactiveSessionState = useCallback\([\s\S]*?\}, \[resetMatchModal, resetRoomInviteRouting\]\)/)
})

test("the realtime active-conversation resync follows the focused chat or MiniRoom thread", async () => {
  const lifecycleSource = read(OWNER.realtime)
  const start = lifecycleSource.indexOf("resynchronizeActiveConversation: () => {")
  assert.ok(start >= 0)
  const body = lifecycleSource.slice(start + "resynchronizeActiveConversation: ".length, lifecycleSource.indexOf("hydrateBlockedUsersFromServer,", start))
    .trim()
    .replace(/,$/, "")
  const resynchronized = []
  const resync = (route) => evaluate(body, {
    navigationRef: { getCurrentRoute: () => route },
    resynchronizeLatestMessages: async (threadId) => { resynchronized.push(threadId) }
  })
  await resync({ name: "ChatThread", params: { threadId: "thread-chat" } })()
  await resync({ name: "MiniRoom", params: { readyMiniRoom: { miniRoom: { sourceThreadId: "thread-room" } } } })()
  await resync({ name: "Lobby" })()
  await resync(undefined)()
  assert.deepEqual(resynchronized, ["thread-chat", "thread-room"])
})
