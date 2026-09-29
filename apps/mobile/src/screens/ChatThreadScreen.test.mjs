import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("./ChatThreadScreen.tsx", import.meta.url), "utf8")
const file = ts.createSourceFile("ChatThreadScreen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function component(name) {
  const declaration = file.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name
  )
  assert.ok(declaration?.body, `${name} must be a function component`)
  return declaration
}

function containsIdentifier(node, name) {
  if (ts.isIdentifier(node) && node.text === name) return true
  return ts.forEachChild(node, (child) => containsIdentifier(child, name) || undefined) ?? false
}

test("typing state stays inside the composer, outside the timeline owner", () => {
  const screen = component("ChatThreadScreen")
  const composer = component("ChatComposer")

  assert.equal(containsIdentifier(screen.body, "inputText"), false)
  assert.equal(containsIdentifier(screen.body, "setInputText"), false)
  assert.equal(containsIdentifier(composer.body, "inputText"), true)
  assert.equal(containsIdentifier(composer.body, "setInputText"), true)
  assert.match(composer.getText(file), /onChangeText=\{setInputText\}/)
  assert.match(screen.getText(file), /<ChatComposer\b/)
  assert.match(screen.getText(file), /<FlatList\b/)
})

test("cached messages, room invitations, and the header paint without entrance delays", () => {
  const screen = component("ChatThreadScreen")
  const screenSource = screen.getText(file)
  assert.doesNotMatch(screenSource, /useEntranceAnimation|MessageBubbleAnimated/)
  assert.match(screenSource, /<View style=\{styles\.chatHeader\}>/)
  assert.match(screenSource, /<ChatRoomInviteCard\b/)
  assert.match(screenSource, /<FlatList\b/)
})

test("conversation opens at the newest item without a delayed animated jump", () => {
  const screenSource = component("ChatThreadScreen").getText(file)

  assert.match(screenSource, /const newestFirstTimeline = useMemo\([\s\S]*?\[\.\.\.timeline\]\.reverse\(\)/)
  assert.match(screenSource, /<FlatList[\s\S]*?data=\{newestFirstTimeline\}[\s\S]*?inverted/)
  assert.match(screenSource, /ListFooterComponent=/)
  assert.match(screenSource, /autoscrollToTopThreshold: 80/)
  assert.match(screenSource, /const chronologicalIndex = timeline\.length - 1 - index/)
  assert.doesNotMatch(screenSource, /scrollToEnd\(|onContentSizeChange=|setTimeout\(/)
  assert.doesNotMatch(screenSource, /selectChatOpeningMessages|thread\?\.lastMessage/)
  assert.match(screenSource, /initialNumToRender=\{initialMessageRenderCount\}/)
  assert.match(screenSource, /getChatInitialRenderCount\(windowHeight\)/)
  assert.match(screenSource, /const awaitingInitialHistory[\s\S]*?!historyReady/)
  assert.match(screenSource, /useChatThreadStore\(threadId, pendingPartnerId\)/)
  assert.match(screenSource, /isPendingThread \|\| awaitingInitialHistory/)
})

test("inbox warms a bounded set of conversations and starts selected history before navigation", () => {
  const inbox = readFileSync(new URL("./InboxScreen.tsx", import.meta.url), "utf8")
  const root = readFileSync(new URL("../navigation/RootNavigator.tsx", import.meta.url), "utf8")
  assert.match(inbox, /\.slice\(0, 6\)/)
  assert.match(inbox, /disposed \|\| !navigation\.isFocused\(\)/)
  assert.match(inbox, /offset \+= 2/)
  assert.match(inbox, /Promise\.all\(ids\.slice\(offset, offset \+ 2\)\.map\(onWarmThread\)\)/)
  assert.match(inbox, /onWarmThread\(threadId\)[\s\S]*?navigation\.navigate\("ChatThread"/)
  assert.match(inbox, /const handlePressIn = useCallback\(\(\) => \{\s*onWarm\(\)/)
  assert.match(root, /requestMessages\(threadId, \{\}, \{ purpose: "prefetch" \}\)/)
  assert.match(root, /onWarmThread=\{warmThreadMessagesForInbox\}/)
})

test("chat uses a short native push transition and respects Reduce Motion", () => {
  const rootSource = readFileSync(new URL("../navigation/RootNavigator.tsx", import.meta.url), "utf8")
  const chatRoute = rootSource.match(/<Stack\.Screen\s+name="ChatThread"([\s\S]*?)<\/Stack\.Screen>/)
  assert.ok(chatRoute, "expected ChatThread in the native stack")
  assert.match(chatRoute[1], /animation:\s*reduceMotion\s*\?\s*"none"\s*:\s*"simple_push"/)
  assert.match(chatRoute[1], /animationDuration:\s*240/)
})

test("pending messages stay fully visible and only show a clock until server acknowledgement", () => {
  const screenSource = component("ChatThreadScreen").getText(file)

  assert.doesNotMatch(screenSource, /isOptimistic \? \{ opacity: 0\.65 \}/)
  assert.match(screenSource, /deliveryState === "sending"[\s\S]*?name="time-outline"/)
  assert.match(screenSource, /accessibilityLabel=\{chatCopy\.sending\}/)
  assert.match(screenSource, /isMe && deliveryState === "sent"[\s\S]*?name="checkmark"/)
  assert.match(screenSource, /isMe && deliveryState === "failed"/)
  assert.match(screenSource, /chatCopy\.notSent/)
  assert.match(screenSource, /onPress=\{\(\) => handleRetry\(item\.message\.messageId\)\}/)
})

// Execute the actual composer expressions without requiring a native renderer.
// This covers event logic, not React scheduling, native input, or paint timing.
function composerExpression(name, bindings) {
  const declaration = component("ChatComposer").body.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === name)
  assert.ok(declaration?.initializer, `${name} must have an initializer`)
  const executable = ts.transpileModule(
    `(${declaration.initializer.getText(file)})`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText
  return runInNewContext(executable, bindings)
}

function screenCallback(name, bindings) {
  const declaration = component("ChatThreadScreen").body.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((entry) => ts.isIdentifier(entry.name) && entry.name.text === name)
  assert.ok(declaration?.initializer && ts.isCallExpression(declaration.initializer), `${name} must be a callback`)
  const callback = declaration.initializer.arguments[0]
  assert.ok(callback, `${name} must pass a callback to useCallback`)
  const executable = ts.transpileModule(
    `(${callback.getText(file)})`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText
  return runInNewContext(executable, bindings)
}

function sendBindings(events, sendChatMessage) {
  return {
    resolvedThreadId: "thread_one",
    currentUserId: "user_one",
    addOptimisticMessage: (message) => {
      events.push(["optimistic", message.body])
      return { localMessageId: "__local_test", clientMessageId: "client-test-001" }
    },
    route: { params: { sendChatMessage } },
    sessionActor: { session: { mode: "production" } },
    captureProductEvent: () => events.push(["analytics"]),
    hapticLight: () => events.push(["haptic"])
  }
}

test("send publishes the optimistic row before starting the request and does not wait for ACK", () => {
  const events = []
  let resolveAck
  const pendingAck = new Promise((resolve) => { resolveAck = resolve })
  const sendChatMessage = (...args) => {
    events.push(["network", ...args])
    return pendingAck
  }
  const send = screenCallback("handleSend", sendBindings(events, sendChatMessage))

  assert.equal(send("hello"), true)
  assert.deepEqual(events.map(([event]) => event), ["optimistic", "network", "analytics", "haptic"])
  assert.deepEqual(events[1], ["network", "thread_one", "hello", "client-test-001"])
  resolveAck?.()
})

test("send is not accepted when the navigator did not provide an ACK-capable callback", () => {
  const events = []
  const send = screenCallback("handleSend", sendBindings(events, undefined))

  assert.equal(send("hello"), false)
  assert.deepEqual(events, [])
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
