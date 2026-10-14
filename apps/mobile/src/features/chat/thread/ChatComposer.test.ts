import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, createReanimatedStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { findElements } from "../../../testing/reanimatedClock"
import { CHAT_COPY } from "./chatThreadCopy"
import type * as Composer from "./ChatComposer"
import * as draftStore from "../chatComposerDraftStore"

type Element = { type: unknown; props: Record<string, any> }

const flush = () => new Promise((resolve) => setImmediate(resolve))

/** Renders function components inline, so the real press wrapper shows its host pressable. */
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand)
  if (!node || typeof node !== "object") return node
  const element = node as Element
  if (typeof element.type === "function") return expand((element.type as (props: unknown) => unknown)(element.props))
  if (!element.props) return node
  return { ...element, props: { ...element.props, children: expand(element.props.children) } }
}

const flatten = (style: unknown): Record<string, any> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : (style && typeof style === "object" ? style as Record<string, any> : {})

// The composer over the real motion tokens and the real shared press feel;
// the OS Reduce Motion answer is the only motion input.
type DraftOwner = { accountId?: string; threadId?: string }

async function mountComposer(osReduceMotion = true, initialOwner: DraftOwner = {}) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const reactNative = createReactNativeStub({
    TextInput: "TextInput",
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(osReduceMotion),
      addEventListener: () => ({ remove: () => undefined })
    }
  }).module
  const base = { "react-native": reactNative, "react-native-reanimated": reanimated.module }
  const motion = loadSourceWithFakeReact("ui/motion.ts", runtime, { modules: base, real: ["./reducedMotionStore", "./motionTokens"] })
  const pressableScale = loadSourceWithFakeReact("ui/PressableScale.tsx", runtime, { modules: { ...base, "./motion": motion } })
  const gesturePressableScale = loadSourceWithFakeReact("ui/GesturePressableScale.tsx", runtime, {
    modules: { ...base, "react-native-gesture-handler": { Pressable: "GesturePressable" }, "./PressableScale": pressableScale }
  })
  const { ChatComposer } = loadSourceWithFakeReact<typeof Composer>("features/chat/thread/ChatComposer.tsx", runtime, {
    modules: {
      ...base,
      "@expo/vector-icons/Ionicons": { __esModule: true, default: "Icon" },
      "../../../ui/layout/PageContainer": { PageSafeArea: "SafeArea" },
      "../../../ui/linearGradient": { LinearGradient: "Gradient" },
      "../../../ui/theme": { uiTheme: { colors: {}, gradients: { primary: ["pink", "pink"] } } },
      "../../../ui/GesturePressableScale": gesturePressableScale,
      "../../../ui/motion": motion,
      "../chatRoomInviteModel": { getRoomInviteCreateLabel: () => "Invite" },
      "./chatThreadStyles": { styles: { sendButton: { width: 44 }, sendButtonPressed: { opacity: 0.9 } } },
      "./RoomInviteComposerIcon": { RoomInviteComposerIcon: "InviteIcon" },
      "../chatComposerDraftStore": draftStore
    },
    real: ["./chatComposerDraftModel"]
  })
  const sent: string[] = []
  let accepted = true
  let pending = false
  let clears = 0
  let owner = initialOwner
  const typingEvents: string[] = []
  const draftTyping = {
    noteDraft: (text: string) => { typingEvents.push(`note:${text}`) },
    endDraft: () => { typingEvents.push("end") }
  }
  const show = () => runtime.render(() => expand(ChatComposer({
    draftAccountId: owner.accountId, draftThreadId: owner.threadId, draftTyping,
    chatCopy: CHAT_COPY.en, chatLocale: "en", partnerName: "Partner",
    isPendingThread: pending, canCreateRoomInvite: false, isCreatingRoomInvite: false,
    roomInviteDisabledReason: null, onRoomInvitePress: () => undefined,
    onSend: (body) => { sent.push(body); return accepted }
  })))
  show()
  await flush()
  runtime.rerender()
  const input = () => findElements(runtime.output, (node) => node.type === "TextInput")[0].props
  const sendElement = () => findElements(runtime.output, (node) => node.props.accessibilityLabel === CHAT_COPY.en.sendAccessibilityLabel("Partner"))[0] as Element
  const button = () => sendElement().props
  /** The drawn send button (inside the still hit box) in the given pressed state. */
  const drawn = (pressed: boolean) => (button().children as (state: { pressed: boolean }) => Element)({ pressed })
  ;(input().ref as { current: unknown }).current = { clear: () => { clears += 1 } }
  return {
    runtime, reanimated, input, button, sendElement, drawn, sent, clears: () => clears,
    type: (text: string) => (input().onChangeText as (text: string) => void)(text),
    refuse: () => { accepted = false },
    accept: () => { accepted = true },
    pending: () => { pending = true; show() },
    typingEvents,
    /** The screen now shows another conversation or account in the same composer. */
    switchOwner: async (next: DraftOwner) => { owner = next; show(); await flush(); runtime.rerender() }
  }
}

const pressEvent = {} as never

test("the send button is a Gesture Handler pressable, so the keyboard-glued footer never drops its first tap", async () => {
  const h = await mountComposer(false)
  try {
    // RN Pressable tracks the finger against a layout that misses the
    // footer's keyboard transform; a dropped first tap kept the typed text unsent.
    assert.equal(h.sendElement().type, "GesturePressable")
    h.type("Synthetic first tap")
    ;(h.button().onPress as () => void)()
    assert.deepEqual(h.sent, ["Synthetic first tap"])
  } finally { h.runtime.unmount() }
})

test("pressing send scales the drawn button on the shared press spring while the hit box stays still", async () => {
  const h = await mountComposer(false)
  try {
    h.type("Synthetic press")
    assert.equal(flatten(h.drawn(false).props.style).transform[0].scale, 1, "at rest the button is full size")
    ;(h.button().onPressIn as (event: never) => void)(pressEvent)
    const pressIn = h.reanimated.calls.at(-1)!
    assert.equal(pressIn.kind, "withSpring")
    assert.equal(pressIn.target, 1)
    h.runtime.rerender()
    const pressed = flatten(h.drawn(true).props.style)
    assert.ok(pressed.transform[0].scale < 1, "the drawn button presses in")
    assert.equal(pressed.opacity, 0.9, "with the designed pressed tint")
    assert.equal(flatten(h.button().style).transform, undefined, "the hit box itself never moves")
    ;(h.button().onPressOut as (event: never) => void)(pressEvent)
    assert.equal(h.reanimated.calls.at(-1)!.target, 0, "release springs back")
    h.runtime.rerender()
    assert.equal(flatten(h.drawn(false).props.style).transform[0].scale, 1)
  } finally { h.runtime.unmount() }
})

test("Reduce Motion: a pressed send button dims in place and never moves", async () => {
  const h = await mountComposer(true)
  try {
    h.type("Synthetic still")
    ;(h.button().onPressIn as (event: never) => void)(pressEvent)
    h.runtime.rerender()
    const pressed = flatten(h.drawn(true).props.style)
    assert.equal(pressed.transform, undefined)
    assert.ok(pressed.opacity < 1)
  } finally { h.runtime.unmount() }
})

test("the first press sends the latest native draft even if its callback predates the edit", async () => {
  const h = await mountComposer()
  try {
    // A press can retain its handler while native edits re-render the button.
    const press = h.button().onPress as () => void
    h.type("  Synthetic draft  ")
    assert.equal(h.button().disabled, false)
    press()
    assert.deepEqual(h.sent, ["Synthetic draft"])
    assert.equal(h.input().value, "")
    assert.equal(h.clears(), 1)
    press()
    assert.equal(h.sent.length, 1, "a retained callback cannot submit an already cleared draft")
    h.type("Synthetic next")
    press()
    assert.equal(h.sent[1], "Synthetic next")
  } finally { h.runtime.unmount() }
})

test("a press keeps a refused draft and blocks pending or empty sends", async () => {
  const h = await mountComposer()
  try {
    h.type("Synthetic refused")
    h.refuse()
    ;(h.button().onPress as () => void)()
    assert.equal(h.input().value, "Synthetic refused")
    assert.equal(h.clears(), 0)
    h.pending()
    ;(h.button().onPress as () => void)()
    assert.equal(h.sent.length, 1)
    h.type("  ")
    ;(h.button().onPress as () => void)()
    assert.equal(h.sent.length, 1)
  } finally { h.runtime.unmount() }
})

// ─── Unsent draft per account + conversation (memory only) ──────────────
// Obviously fake owners; no real account or conversation ids.
const ACCOUNT_A = "account-test-a"
const ACCOUNT_B = "account-test-b"
const THREAD_ONE = "thread-test-one"
const THREAD_TWO = "thread-test-two"

test("leaving a conversation and coming back shows the unsent draft", async () => {
  draftStore.resetChatComposerDrafts()
  const first = await mountComposer(true, { accountId: ACCOUNT_A, threadId: THREAD_ONE })
  first.type("Synthetic unsent draft")
  first.runtime.rerender()
  first.runtime.unmount()

  const back = await mountComposer(true, { accountId: ACCOUNT_A, threadId: THREAD_ONE })
  try {
    assert.equal(back.input().value, "Synthetic unsent draft")
    assert.equal(back.button().disabled, false, "the restored draft can be sent at once")
    ;(back.button().onPress as () => void)()
    assert.deepEqual(back.sent, ["Synthetic unsent draft"], "the send submits the restored text")
  } finally { back.runtime.unmount() }
})

test("restoring a draft never signals typing to the partner", async () => {
  draftStore.resetChatComposerDrafts()
  draftStore.writeChatComposerDraft(ACCOUNT_A, THREAD_ONE, "Synthetic restored")
  const h = await mountComposer(true, { accountId: ACCOUNT_A, threadId: THREAD_ONE })
  try {
    assert.equal(h.input().value, "Synthetic restored")
    assert.deepEqual(h.typingEvents, [])
    await h.switchOwner({ accountId: ACCOUNT_A, threadId: THREAD_TWO })
    draftStore.writeChatComposerDraft(ACCOUNT_A, THREAD_TWO, "Synthetic second")
    await h.switchOwner({ accountId: ACCOUNT_A, threadId: THREAD_ONE })
    assert.equal(h.input().value, "Synthetic restored")
    assert.deepEqual(h.typingEvents, [], "switching conversations restores without a typing event")
  } finally { h.runtime.unmount() }
})

test("each conversation keeps its own draft when the composer switches between them", async () => {
  draftStore.resetChatComposerDrafts()
  const h = await mountComposer(true, { accountId: ACCOUNT_A, threadId: THREAD_ONE })
  try {
    h.type("Synthetic for one")
    h.runtime.rerender()
    await h.switchOwner({ accountId: ACCOUNT_A, threadId: THREAD_TWO })
    assert.equal(h.input().value, "", "the other conversation starts empty")
    h.type("Synthetic for two")
    h.runtime.rerender()
    await h.switchOwner({ accountId: ACCOUNT_A, threadId: THREAD_ONE })
    assert.equal(h.input().value, "Synthetic for one")
    ;(h.button().onPress as () => void)()
    assert.deepEqual(h.sent, ["Synthetic for one"], "a send goes out with the shown conversation's draft")
    assert.equal(draftStore.readChatComposerDraft(ACCOUNT_A, THREAD_TWO), "Synthetic for two")
  } finally { h.runtime.unmount() }
})

test("a conversation still being created keeps what was typed once it exists", async () => {
  draftStore.resetChatComposerDrafts()
  const h = await mountComposer(true, { accountId: ACCOUNT_A })
  try {
    h.type("Synthetic while pending")
    h.runtime.rerender()
    await h.switchOwner({ accountId: ACCOUNT_A, threadId: THREAD_ONE })
    assert.equal(h.input().value, "Synthetic while pending")
    assert.equal(draftStore.readChatComposerDraft(ACCOUNT_A, THREAD_ONE), "Synthetic while pending")
  } finally { h.runtime.unmount() }
})

test("a refused send keeps the draft for the next visit; an accepted one forgets it", async () => {
  draftStore.resetChatComposerDrafts()
  const h = await mountComposer(true, { accountId: ACCOUNT_A, threadId: THREAD_ONE })
  h.type("Synthetic refused send")
  h.refuse()
  ;(h.button().onPress as () => void)()
  h.runtime.rerender()
  h.runtime.unmount()
  assert.equal(draftStore.readChatComposerDraft(ACCOUNT_A, THREAD_ONE), "Synthetic refused send")

  const again = await mountComposer(true, { accountId: ACCOUNT_A, threadId: THREAD_ONE })
  assert.equal(again.input().value, "Synthetic refused send")
  ;(again.button().onPress as () => void)()
  again.runtime.rerender()
  again.runtime.unmount()
  assert.equal(draftStore.readChatComposerDraft(ACCOUNT_A, THREAD_ONE), "")

  const later = await mountComposer(true, { accountId: ACCOUNT_A, threadId: THREAD_ONE })
  try { assert.equal(later.input().value, "") } finally { later.runtime.unmount() }
})

test("typing and sending at once leaves no draft behind, even with a late keystroke", async () => {
  draftStore.resetChatComposerDrafts()
  const h = await mountComposer(true, { accountId: ACCOUNT_A, threadId: THREAD_ONE })
  h.type("Synthetic quick")
  ;(h.button().onPress as () => void)()
  // The keystroke racing the clear brings back the sent text plus one letter.
  h.type("Synthetic quickx")
  h.runtime.rerender()
  h.runtime.unmount()
  assert.deepEqual(h.sent, ["Synthetic quick"])
  assert.equal(draftStore.readChatComposerDraft(ACCOUNT_A, THREAD_ONE), "x", "only the new letter is a draft")
})

test("another account never sees the previous account's drafts", async () => {
  draftStore.resetChatComposerDrafts()
  const h = await mountComposer(true, { accountId: ACCOUNT_A, threadId: THREAD_ONE })
  try {
    h.type("Synthetic account a")
    h.runtime.rerender()
    await h.switchOwner({ accountId: ACCOUNT_B, threadId: THREAD_ONE })
    assert.equal(h.input().value, "", "the same conversation id under another account is empty")
    await h.switchOwner({ accountId: ACCOUNT_A, threadId: THREAD_ONE })
    assert.equal(h.input().value, "", "switching accounts dropped the old account's drafts")
  } finally { h.runtime.unmount() }
})
