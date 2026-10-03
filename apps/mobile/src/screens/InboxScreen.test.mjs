import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("./InboxScreen.tsx", import.meta.url), "utf8")
const file = ts.createSourceFile("InboxScreen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
// The conversation row moved to features/inbox with its presentation model.
const rowSource = readFileSync(new URL("../features/inbox/InboxConversationRow.tsx", import.meta.url), "utf8")
const rowFile = ts.createSourceFile("InboxConversationRow.tsx", rowSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function initializer(name, sourceFile = name === "ConversationCard" ? rowFile : file) {
  let result
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === name) result = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(result, name)
  return result.getText(sourceFile)
}
function evaluate(expression, context) {
  const code = ts.transpileModule(`const result = ${expression}`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 }
  }).outputText
  return runInNewContext(`(() => { ${code}\nreturn result })()`, context)
}
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) }
function hooks() {
  const slots = []
  let cursor = 0
  return {
    reset() { cursor = 0 },
    useRef(value) { const slot = cursor++; return slots[slot] ??= { current: value } },
    useCallback(callback, deps) {
      const slot = cursor++
      const previous = slots[slot]
      if (previous && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return previous.callback
      slots[slot] = { callback, deps }
      return callback
    }
  }
}
function cardHarness() {
  const hook = hooks()
  const haptics = []
  const context = {
    ...hook, React, memo: (render, equal) => ({ render, equal }), useEffect: () => {},
    // The press feel itself is PressableScale's (tested in ui/PressableScale.test.ts).
    PressableScale: "PressableScale", UnreadGlow: "UnreadGlow", View: "View", Text: "Text", LinearGradient: "Gradient",
    ParticipantAvatar: "Avatar", Ionicons: "Icon", cardStyles: {}, hapticMedium: () => haptics.push("medium"),
    uiTheme: { gradients: { primary: [] }, colors: {} },
    areChatParticipantAvatarsEquivalent: (a, b) => a === b
  }
  const card = evaluate(initializer("ConversationCard"), context)
  return { ...card, haptics, render(props) { hook.reset(); return card.render(props).props } }
}
function props(overrides = {}) {
  return {
    threadId: "thread-a", copy: { openChatHint: "Opens", startWithSpark: "Start" },
    partnerName: "Partner", partnerUserId: "partner", previewPrefix: undefined, lastBody: "Hello", lastTime: "1m",
    unreadBadge: null, accessibilityLabel: "Partner, Hello, 1m", unreadPulse: {}, onPress: () => {}, onWarm: () => {},
    isPinned: false, actionsCopy: { actions: "Chat options" }, onLongPress: () => {}, ...overrides
  }
}

test("unaffected row renders keep shared callbacks and memo equality", () => {
  const openThread = () => {}
  const warmThread = () => {}
  const shared = props()
  const context = {
    React, useCallback: (fn) => fn, Reanimated: { View: "AnimatedView" }, ConversationCard: "Card",
    copy: shared.copy, getItemAnim: () => ({}), onWarmThread: warmThread, warmThread, openThread,
    actionsCopy: shared.actionsCopy, openConversationActions: shared.onLongPress,
    reduceMotion: false, sessionActor: { session: { mode: "production" } }, unreadPulse: shared.unreadPulse
  }
  const render = evaluate(initializer("renderThreadRow"), context)
  const item = { ...shared, thread: { threadId: "thread-a" } }
  const first = render({ item, index: 0 }).props.children[0].props
  // A list/store update can rebuild item objects without changing this conversation.
  const next = render({ item: { ...item, thread: { ...item.thread } }, index: 0 }).props.children[0].props
  assert.equal(first.threadId, "thread-a")
  assert.equal(first.onPress, openThread)
  assert.equal(first.onWarm, warmThread)
  assert.equal(first.onPress, next.onPress)
  assert.equal(first.onWarm, next.onWarm)
  const { equal } = cardHarness()
  assert.equal(equal(first, next), true)
  assert.equal(equal(first, { ...next, unreadBadge: "2" }), false)
  assert.equal(equal(first, { ...next, accessibilityLabel: "Partner, 2 unread messages" }), false)
  assert.equal(equal(first, { ...next, previewPrefix: "You: " }), false)
  assert.equal(equal(first, { ...next, lastBody: "Changed" }), false)
})

test("memo and bound press handlers observe changed callbacks and thread identity", () => {
  const card = cardHarness()
  const calls = []
  const first = props({ onPress: (id) => calls.push(`old-press:${id}`), onWarm: (id) => calls.push(`old-warm:${id}`) })
  const a = card.render(first)
  const stable = card.render({ ...first, lastBody: "Updated" })
  assert.equal(a.onPress, stable.onPress)
  assert.equal(a.onPressIn, stable.onPressIn)
  a.onPress(); a.onPressIn()
  const next = { ...first, onPress: (id) => calls.push(`new-press:${id}`), onWarm: (id) => calls.push(`new-warm:${id}`) }
  assert.equal(card.equal(first, next), false)
  assert.equal(card.equal(first, { ...first, onPress: next.onPress }), false)
  assert.equal(card.equal(first, { ...first, onWarm: next.onWarm }), false)
  assert.equal(card.equal(first, { ...first, threadId: "thread-b" }), false)
  const b = card.render({ ...next, threadId: "thread-b" })
  b.onPress(); b.onPressIn()
  assert.deepEqual(calls, ["old-press:thread-a", "old-warm:thread-a", "new-press:thread-b", "new-warm:thread-b"])
})

test("touching a row warms its thread once, whatever the motion preference", () => {
  const card = cardHarness()
  const calls = []
  const handlers = card.render(props({ onWarm: (id) => calls.push(id) }))
  handlers.onPressIn()
  assert.deepEqual(calls, ["thread-a"])
  assert.equal(handlers.onPressOut, undefined, "release does no work of its own")
})

test("shared warm callback follows current session mode and provider", () => {
  const calls = []
  for (const mode of ["demo", "production"]) {
    const warm = evaluate(initializer("warmThread"), {
      useCallback: (fn) => fn, sessionActor: { session: { mode } }, onWarmThread: (id) => calls.push(`${mode}:${id}`)
    })
    warm("thread-a")
  }
  assert.deepEqual(calls, ["production:thread-a"])
})

test("screen callbacks stay stable on unrelated updates but invalidate changed providers/session", () => {
  const hook = hooks()
  const calls = []
  const navigation = { navigate: (route, params) => calls.push(`${route}:${params.threadId}`) }
  const provider = (id) => calls.push(`old:${id}`)
  function render(onWarmThread, mode, nav = navigation) {
    hook.reset()
    const context = { ...hook, navigation: nav, onWarmThread, sessionActor: { session: { mode } } }
    return {
      open: evaluate(initializer("openThread"), context),
      warm: evaluate(initializer("warmThread"), context)
    }
  }
  const first = render(provider, "production")
  const unchanged = render(provider, "production")
  assert.equal(first.open, unchanged.open)
  assert.equal(first.warm, unchanged.warm)
  const changed = render((id) => calls.push(`new:${id}`), "production")
  assert.notEqual(first.warm, changed.warm)
  changed.warm("thread-a"); changed.open("thread-a")
  const demo = render(provider, "demo")
  assert.notEqual(first.warm, demo.warm)
  demo.warm("thread-b"); demo.open("thread-b")
  assert.deepEqual(calls, ["new:thread-a", "ChatThread:thread-a", "ChatThread:thread-b"])
  const otherNavigation = { navigate: (route, params) => calls.push(`other:${route}:${params.threadId}`) }
  const moved = render(provider, "production", otherNavigation)
  assert.notEqual(first.open, moved.open, "opening follows the current navigation")
  moved.open("thread-c")
  assert.equal(calls.at(-1), "other:ChatThread:thread-c")
})

test("a tap on a row navigates at once and does no warming or store work of its own", () => {
  const calls = []
  const open = evaluate(initializer("openThread"), {
    useCallback: (fn) => fn,
    navigation: { navigate: (route, params) => calls.push(JSON.parse(JSON.stringify({ route, params }))) },
    // The press-in already warmed the thread; a tap must not repeat it before the push.
    onWarmThread: () => { throw new Error("a tap must not warm before navigating") },
    sessionActor: { session: { mode: "production" } }
  })
  open("thread-a")
  assert.deepEqual(calls, [{ route: "ChatThread", params: { threadId: "thread-a" } }])
})

test("prefetch selects only the first six eligible conversations", () => {
  const threads = Array.from({ length: 9 }, (_, i) => ({
    threadId: `thread-${i}`, participantUserIds: ["self"], lastMessage: { body: "Hello" }
  }))
  threads.unshift({ threadId: "foreign", participantUserIds: ["other"], lastMessage: {} })
  threads.unshift({ threadId: "empty", participantUserIds: ["self"] })
  const ids = evaluate(initializer("warmThreadIds"), { useMemo: (fn) => fn(), threads, currentUserId: "self" })
  assert.equal(ids, "thread-0|thread-1|thread-2|thread-3|thread-4|thread-5")
  // Queue concurrency, idle scheduling and blur cancellation are exercised
  // through the real useInboxThreadWarmup hook's behaviour tests.
})

test("re-tapping the Chats tab scrolls the list to the top, without animation under Reduce Motion", () => {
  for (const reduceMotion of [false, true]) {
    const calls = []
    const scrollToTop = evaluate(initializer("scrollToTop"), {
      useCallback: (fn) => fn, reduceMotion, listRef: { current: { scrollToOffset: (options) => calls.push(options) } }
    })
    scrollToTop()
    assert.deepEqual(calls.map(({ offset, animated }) => ({ offset, animated })), [{ offset: 0, animated: !reduceMotion }])
  }
  const idle = evaluate(initializer("scrollToTop"), { useCallback: (fn) => fn, reduceMotion: false, listRef: { current: null } })
  assert.doesNotThrow(() => idle())
})

test("touch and hold (or the VoiceOver action) opens one conversation's options with one haptic", () => {
  const card = cardHarness()
  const opened = []
  const handlers = card.render(props({ onLongPress: (id) => opened.push(id) }))
  assert.equal(JSON.stringify(handlers.accessibilityActions), JSON.stringify([{ name: "longpress", label: "Chat options" }]))
  handlers.onLongPress()
  handlers.onAccessibilityAction({ nativeEvent: { actionName: "longpress" } })
  handlers.onAccessibilityAction({ nativeEvent: { actionName: "activate" } })
  assert.deepEqual(opened, ["thread-a", "thread-a"])
  assert.deepEqual(card.haptics, ["medium"], "only the physical long press plays a haptic")
  assert.equal(card.equal(props(), props({ isPinned: true })), false, "a pin change re-renders the row")
  assert.equal(card.equal(props(), props({ onLongPress: () => {} })), false)
})
