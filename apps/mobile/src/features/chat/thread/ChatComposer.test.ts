import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, createReanimatedStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { findElements } from "../../../testing/reanimatedClock"
import { CHAT_COPY } from "./chatThreadCopy"
import type * as Composer from "./ChatComposer"

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
async function mountComposer(osReduceMotion = true) {
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
      "./RoomInviteComposerIcon": { RoomInviteComposerIcon: "InviteIcon" }
    },
    real: ["./chatComposerDraftModel"]
  })
  const sent: string[] = []
  let accepted = true
  let pending = false
  let clears = 0
  const show = () => runtime.render(() => expand(ChatComposer({
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
    pending: () => { pending = true; show() }
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
