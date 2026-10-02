import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const threadDirectory = new URL("../features/chat/thread/", import.meta.url)

function parse(url, fileName) {
  const text = readFileSync(url, "utf8")
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

const threadFile = (fileName) => parse(new URL(fileName, threadDirectory), fileName)
const composerFile = threadFile("ChatComposer.tsx")
const sendingFile = threadFile("useChatMessageSending.ts")
const roomInviteFile = threadFile("useChatRoomInviteActions.ts")

function declaredFunction(sourceFile, name) {
  const declaration = sourceFile.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name
  )
  assert.ok(declaration?.body, `${name} must be a function declaration in ${sourceFile.fileName}`)
  return declaration
}

const composerComponent = () => declaredFunction(composerFile, "ChatComposer")

// Execute the actual composer expressions without requiring a native renderer.
// This covers event logic, not React scheduling, native input, or paint timing.
function composerExpression(name, bindings) {
  const declaration = composerComponent().body.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === name)
  assert.ok(declaration?.initializer, `${name} must have an initializer`)
  const executable = ts.transpileModule(
    `(${declaration.initializer.getText(composerFile)})`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText
  return runInNewContext(executable, bindings)
}

// Execute a hook's own local declarations without a React renderer.
function hookDeclaration(sourceFile, hookName, name) {
  const declaration = declaredFunction(sourceFile, hookName).body.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === name)
  assert.ok(declaration?.initializer, `${name} must be declared in ${hookName}`)
  return declaration.initializer
}

function evaluate(sourceFile, node, bindings) {
  const executable = ts.transpileModule(
    `(${node.getText(sourceFile)})`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText
  return runInNewContext(executable, bindings)
}

function sendingCallback(name, bindings) {
  const initializer = hookDeclaration(sendingFile, "useChatMessageSending", name)
  assert.ok(
    ts.isCallExpression(initializer) && initializer.expression.getText(sendingFile) === "useCallback",
    `${name} must be a callback`
  )
  const callback = initializer.arguments[0]
  assert.ok(callback, `${name} must pass a callback to useCallback`)
  return evaluate(sendingFile, callback, bindings)
}

function sendBindings(events, sendChatMessage) {
  return {
    resolvedThreadId: "thread_one",
    currentUserId: "user_one",
    addOptimisticMessage: (message) => {
      events.push(["optimistic", message.body])
      return { localMessageId: "__local_test", clientMessageId: "client-test-001" }
    },
    sendChatMessage,
    sessionActor: { session: { mode: "production" } },
    sessionMode: "production",
    captureProductEvent: () => events.push(["analytics"]),
    hapticLight: () => events.push(["haptic"]),
    // Module binding for chatThreadModel.normalizeOutgoingChatBody (node-tested there).
    normalizeOutgoingChatBody: (body) => body.trim().replace(/\s+/g, " ")
  }
}

test("send publishes and transmits the server-normalized body of a multi-line draft", () => {
  const events = []
  const send = sendingCallback("handleSend", sendBindings(events, (...args) => {
    events.push(["network", ...args])
    return new Promise(() => undefined)
  }))
  assert.equal(send("  first line\nsecond   line \n"), true)
  assert.deepEqual(events[0], ["optimistic", "first line second line"])
  assert.deepEqual(events[1], ["network", "thread_one", "first line second line", "client-test-001"])
  assert.equal(send(" \n\t "), false)
})

test("send publishes the optimistic row before starting the request and does not wait for ACK", () => {
  const events = []
  let resolveAck
  const pendingAck = new Promise((resolve) => { resolveAck = resolve })
  const sendChatMessage = (...args) => {
    events.push(["network", ...args])
    return pendingAck
  }
  const send = sendingCallback("handleSend", sendBindings(events, sendChatMessage))

  assert.equal(send("hello"), true)
  assert.deepEqual(events.map(([event]) => event), ["optimistic", "network", "analytics", "haptic"])
  assert.deepEqual(events[1], ["network", "thread_one", "hello", "client-test-001"])
  resolveAck?.()
})

test("send is not accepted when the navigator did not provide an ACK-capable callback", () => {
  const events = []
  const send = sendingCallback("handleSend", sendBindings(events, undefined))

  assert.equal(send("hello"), false)
  assert.deepEqual(events, [])
})

// Objects created inside the vm context carry that realm's prototypes.
const plain = (value) => JSON.parse(JSON.stringify(value))

test("send reports the session mode and requests delivery tracking only in production", () => {
  for (const mode of ["production", "demo"]) {
    const optimistic = []
    const analytics = []
    const bindings = {
      ...sendBindings([], () => new Promise(() => undefined)),
      addOptimisticMessage: (message) => {
        optimistic.push(message)
        return { localMessageId: "__local_test", clientMessageId: "client-test-001" }
      },
      sessionActor: { session: { mode } },
      sessionMode: mode,
      captureProductEvent: (...args) => analytics.push(args)
    }
    assert.equal(sendingCallback("handleSend", bindings)("hi"), true)
    assert.deepEqual(plain(optimistic), [{
      threadId: "thread_one",
      senderUserId: "user_one",
      body: "hi",
      trackDelivery: mode === "production"
    }])
    assert.deepEqual(plain(analytics), [["chat_message_sent", { mode, kind: "text" }]])
  }
})

test("send is refused without a resolved thread or signed-in user", () => {
  for (const missing of [{ resolvedThreadId: undefined }, { currentUserId: "" }]) {
    const events = []
    const send = sendingCallback("handleSend", {
      ...sendBindings(events, () => Promise.resolve()),
      ...missing
    })
    assert.equal(send("hello"), false)
    assert.deepEqual(events, [])
  }
})

test("send swallows a rejected request so the optimistic row owns the failure", async () => {
  const events = []
  const send = sendingCallback("handleSend", sendBindings(events, () => Promise.reject(new Error("offline"))))
  assert.equal(send("hello"), true)
  await new Promise((resolve) => setImmediate(resolve))
})

function retryBindings(events, { retryable, sendChatMessage }) {
  return {
    getRetryableMessage: (messageId) => {
      events.push(["lookup", messageId])
      return retryable
    },
    markOptimisticMessageSending: (clientMessageId) => events.push(["sending", clientMessageId]),
    sendChatMessage
  }
}

test("retry marks the row sending, then resends with the original client message id", async () => {
  const events = []
  const sendChatMessage = (...args) => {
    events.push(["network", ...args])
    return Promise.reject(new Error("still offline"))
  }
  const retry = sendingCallback("handleRetry", retryBindings(events, {
    retryable: { threadId: "thread_one", body: "hello", clientMessageId: "client-test-001" },
    sendChatMessage
  }))

  retry("__local_test")
  assert.deepEqual(events, [
    ["lookup", "__local_test"],
    ["sending", "client-test-001"],
    ["network", "thread_one", "hello", "client-test-001"]
  ])
  await new Promise((resolve) => setImmediate(resolve))
})

test("retry is a no-op for unknown rows or without an ACK-capable callback", () => {
  const unknown = []
  sendingCallback("handleRetry", retryBindings(unknown, {
    retryable: null,
    sendChatMessage: () => assert.fail("unknown row was resent")
  }))("__missing")
  assert.deepEqual(unknown, [["lookup", "__missing"]])

  const noSender = []
  sendingCallback("handleRetry", retryBindings(noSender, {
    retryable: { threadId: "thread_one", body: "hello", clientMessageId: "client-test-001" },
    sendChatMessage: undefined
  }))("__local_test")
  assert.deepEqual(noSender, [["lookup", "__local_test"]])
})

function loadEarlierBindings(events, overrides = {}) {
  const requestMessages = (...args) => {
    events.push(["request", ...args])
    return overrides.result ?? Promise.resolve()
  }
  return {
    requestMessages,
    messages: [{ messageId: "oldest" }, { messageId: "newest" }],
    resolvedThreadId: "thread_one",
    isLoadingEarlier: false,
    setIsLoadingEarlier: (value) => events.push(["loading", value]),
    ...overrides.bindings
  }
}

test("load earlier pages 20 messages before the oldest loaded one and always clears loading", async () => {
  const events = []
  await sendingCallback("handleLoadEarlier", loadEarlierBindings(events))()
  assert.deepEqual(plain(events), [
    ["loading", true],
    ["request", "thread_one", { before: "oldest", limit: 20 }],
    ["loading", false]
  ])

  const failed = []
  await assert.rejects(
    sendingCallback("handleLoadEarlier", loadEarlierBindings(failed, { result: Promise.reject(new Error("offline")) }))(),
    /offline/
  )
  assert.deepEqual(failed.at(-1), ["loading", false])
})

test("load earlier ignores taps while loading, without history, or without a thread", async () => {
  for (const bindings of [
    { isLoadingEarlier: true },
    { messages: [] },
    { resolvedThreadId: undefined }
  ]) {
    const events = []
    await sendingCallback("handleLoadEarlier", loadEarlierBindings(events, { bindings }))()
    assert.deepEqual(events, [])
  }
})

test("composer clears only accepted sends and submits trimmed text", () => {
  for (const accepted of [false, true]) {
    const submitted = []
    const stateWrites = []
    const send = composerExpression("handleSend", {
      inputText: "  hello  ",
      isPendingThread: false,
      onSend: (body) => { submitted.push(body); return accepted },
      setInputText: (value) => stateWrites.push(value)
    })
    send()
    assert.deepEqual(submitted, ["hello"])
    assert.deepEqual(stateWrites, accepted ? [""] : [])
  }
})

test("composer blocks empty and pending sends without losing the draft", () => {
  for (const [inputText, isPendingThread] of [["   ", false], ["hello", true]]) {
    assert.equal(composerExpression("isSendDisabled", { inputText, isPendingThread }), true)
    composerExpression("handleSend", {
      inputText, isPendingThread,
      onSend: () => assert.fail("disabled draft was submitted"),
      setInputText: () => assert.fail("disabled draft was cleared")
    })()
  }
  assert.equal(composerExpression("isSendDisabled", {
    inputText: "hello", isPendingThread: false
  }), false)
})

function roomInviteExpression(name, bindings) {
  return evaluate(
    roomInviteFile,
    hookDeclaration(roomInviteFile, "useChatRoomInviteActions", name),
    bindings
  )
}

class FakeRoomInviteApiError extends Error {
  constructor(code, roomSessionId) {
    super(code)
    this.code = code
    this.roomSessionId = roomSessionId
  }
}

const inviteCopy = {
  roomInviteUnavailableTitle: "title",
  roomInviteUnavailableReason: "unavailable",
  roomInviteClosePreviousBody: "close previous?",
  roomInviteClosePreviousAction: "close and invite",
  roomInviteCloseFailed: "close failed",
  roomInviteRetryFailed: "retry failed",
  cancel: "cancel"
}

function roomInvitePressHarness(overrides = {}) {
  const events = []
  const alerts = []
  let activeAction = null
  const createAction = { type: "create", threadId: "thread_one" }
  const screenMountedRef = { current: true }
  const activeUserIdRef = { current: "user_one" }
  const bindings = {
    isCreatingRoomInvite: false,
    canCreateRoomInvite: true,
    createRoomInviteAction: createAction,
    roomInviteDisabledReason: null,
    chatCopy: inviteCopy,
    Alert: { alert: (...args) => alerts.push(args) },
    RoomInviteApiError: FakeRoomInviteApiError,
    getRoomInviteActionKey: (action) => `${action.type}:${action.threadId}`,
    sessionActor: { profile: { userId: "user_one" } },
    currentUserId: "user_one",
    screenMountedRef,
    activeUserIdRef,
    setActiveRoomInviteAction: (next) => {
      activeAction = typeof next === "function" ? next(activeAction) : next
      events.push(["active", activeAction])
    },
    roomInviteActionHandler: (action) => {
      events.push(["invite", action.type])
      return overrides.retryResult ?? Promise.resolve()
    },
    closeActiveRoomHandler: (roomId) => {
      events.push(["close", roomId])
      return overrides.closeResult ?? Promise.resolve()
    },
    handleRoomInviteAction: (action, onError) => {
      events.push(["action", action.type])
      onError?.(overrides.error)
    },
    ...overrides.bindings
  }
  return {
    press: () => roomInviteExpression("handleRoomInvitePress", bindings)(),
    events,
    alerts,
    screenMountedRef,
    activeUserIdRef
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test("room invite entry explains why it is unavailable instead of hiding", () => {
  const harness = roomInvitePressHarness({
    bindings: { canCreateRoomInvite: false, roomInviteDisabledReason: "pending invite" }
  })
  harness.press()
  assert.deepEqual(harness.alerts, [["title", "pending invite"]])
  assert.deepEqual(harness.events, [])

  const noReason = roomInvitePressHarness({ bindings: { createRoomInviteAction: null } })
  noReason.press()
  assert.deepEqual(noReason.alerts, [["title", "unavailable"]])

  const busy = roomInvitePressHarness({ bindings: { isCreatingRoomInvite: true, canCreateRoomInvite: false } })
  busy.press()
  assert.deepEqual([busy.alerts, busy.events], [[], []])
})

test("room invite ignores errors other than an open previous room", () => {
  for (const error of [new Error("offline"), new FakeRoomInviteApiError("RATE_LIMITED", "room_1")]) {
    const harness = roomInvitePressHarness({ error })
    harness.press()
    assert.deepEqual(harness.events, [["action", "create"]])
    assert.deepEqual(harness.alerts, [])
  }
})

test("an open previous room without a closer or id reports the close failure", () => {
  for (const [error, bindings] of [
    [new FakeRoomInviteApiError("SELF_IN_ROOM", "room_1"), { closeActiveRoomHandler: undefined }],
    [new FakeRoomInviteApiError("SELF_IN_ROOM", ""), {}]
  ]) {
    const harness = roomInvitePressHarness({ error, bindings })
    harness.press()
    assert.deepEqual(harness.alerts, [["title", "close failed"]])
  }
})

test("confirming closes the previous room, then retries the same invitation once", async () => {
  const harness = roomInvitePressHarness({ error: new FakeRoomInviteApiError("SELF_IN_ROOM", "room_1") })
  harness.press()
  const [[title, body, buttons]] = harness.alerts
  assert.deepEqual([title, body], ["title", "close previous?"])
  assert.deepEqual(plain(buttons.map(({ text, style }) => ({ text, style }))), [
    { text: "cancel", style: "cancel" },
    { text: "close and invite" }
  ])

  buttons[1].onPress()
  await settle()
  assert.deepEqual(plain(harness.events), [
    ["action", "create"],
    ["active", "create:thread_one"],
    ["close", "room_1"],
    ["invite", "create"],
    ["active", null]
  ])
  assert.equal(harness.alerts.length, 1)
})

test("close and retry failures alert, and an unmounted screen stays silent", async () => {
  const closeFails = roomInvitePressHarness({
    error: new FakeRoomInviteApiError("SELF_IN_ROOM", "room_1"),
    closeResult: Promise.reject(new Error("offline"))
  })
  closeFails.press()
  closeFails.alerts[0][2][1].onPress()
  await settle()
  assert.deepEqual(closeFails.alerts.slice(1), [["title", "close failed"]])
  assert.equal(closeFails.events.some(([event]) => event === "invite"), false)

  const retryFails = roomInvitePressHarness({
    error: new FakeRoomInviteApiError("SELF_IN_ROOM", "room_1"),
    retryResult: Promise.reject(new Error("offline"))
  })
  retryFails.press()
  retryFails.alerts[0][2][1].onPress()
  await settle()
  assert.deepEqual(retryFails.alerts.slice(1), [["title", "retry failed"]])
  assert.deepEqual(retryFails.events.at(-1), ["active", null])

  const unmounted = roomInvitePressHarness({ error: new FakeRoomInviteApiError("SELF_IN_ROOM", "room_1") })
  unmounted.press()
  unmounted.alerts[0][2][1].onPress()
  unmounted.screenMountedRef.current = false
  await settle()
  assert.equal(unmounted.events.some(([event]) => event === "invite"), false)
  assert.deepEqual(unmounted.events.at(-1), ["close", "room_1"])

  const switchedUser = roomInvitePressHarness({
    error: new FakeRoomInviteApiError("SELF_IN_ROOM", "room_1"),
    closeResult: Promise.reject(new Error("offline"))
  })
  switchedUser.press()
  switchedUser.alerts[0][2][1].onPress()
  switchedUser.activeUserIdRef.current = "user_two"
  await settle()
  assert.equal(switchedUser.alerts.length, 1)
})

test("the partner's avatar at the top left opens their profile; it waits while the partner is unknown", () => {
  const headerFile = threadFile("ChatThreadHeader.tsx")
  const code = ts.transpileModule(`(${declaredFunction(headerFile, "ChatThreadHeader").getText(headerFile)
    .replace(/^export /, "")})`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) }
  const styles = new Proxy({}, { get: (_target, key) => String(key) })
  const Header = runInNewContext(code, {
    React, styles, View: "View", Text: "Text", Pressable: "Pressable", PressableScale: "PressableScale", ParticipantAvatar: "Avatar",
    ActionButtonCircle: "Circle", Ionicons: "Icon", uiTheme: { colors: {} }
  })
  const copy = {
    back: "Geri", safetyAccessibilityLabel: (name) => `${name} için güvenlik seçenekleri`,
    openProfileAccessibilityLabel: (name) => `${name} profili`, openProfileHint: "Profilini açar."
  }
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return undefined
    if (predicate(node)) return node
    for (const child of [node.props?.children].flat()) {
      const found = find(child, predicate)
      if (found) return found
    }
    return undefined
  }
  const opened = []
  const render = (onOpenProfile) => Header({
    chatCopy: copy, chatLocale: "tr", partnerName: "Ada", partnerUserId: "user-ada", partnerAvatar: undefined,
    onBack: () => {}, onViewMatch: null, onOpenSafety: () => {}, onOpenProfile
  })
  const tree = render(() => opened.push("profile"))
  const header = tree.props.children
  assert.equal(header[0].type, "Circle", "back stays first")
  const avatarButton = header[1]
  assert.equal(avatarButton.type, "Pressable", "the avatar is the next control at the top left")
  assert.equal(avatarButton.props.accessibilityLabel, "Ada profili")
  assert.equal(avatarButton.props.accessibilityHint, "Profilini açar.")
  assert.equal(find(avatarButton, (node) => node.type === "Avatar")?.props.size, 44)
  avatarButton.props.onPress()
  find(tree, (node) => node.type === "Text" && [node.props.children].flat().includes("Ada")).props.onPress()
  assert.deepEqual(opened, ["profile", "profile"], "the name beside it opens the same profile")
  assert.equal(JSON.stringify(avatarButton.props.style({ pressed: false })), JSON.stringify(["chatHeaderAvatarButton", null]))

  const unknown = render(null).props.children[1]
  assert.equal(unknown.props.disabled, true)
  assert.equal(unknown.props.onPress, undefined)

})
