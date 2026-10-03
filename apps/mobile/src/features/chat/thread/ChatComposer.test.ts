import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, createReanimatedStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { findElements } from "../../../testing/reanimatedClock"
import { CHAT_COPY } from "./chatThreadCopy"
import type * as Composer from "./ChatComposer"

function mountComposer() {
  const runtime = createFakeReactRuntime()
  const { ChatComposer } = loadSourceWithFakeReact<typeof Composer>("features/chat/thread/ChatComposer.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub({ TextInput: "TextInput" }).module,
      "react-native-reanimated": createReanimatedStub(runtime).module,
      "@expo/vector-icons/Ionicons": { __esModule: true, default: "Icon" },
      "../../../ui/layout/PageContainer": { PageSafeArea: "SafeArea" },
      "../../../ui/linearGradient": { LinearGradient: "Gradient" },
      "../../../ui/theme": { uiTheme: { colors: {}, gradients: { primary: ["pink", "pink"] } } },
      "react-native-gesture-handler": { Pressable: "GesturePressable" },
      "../../../ui/motion": { useMotion: () => ({ reduceMotion: true }), animateTo: (value: number) => value },
      "../chatRoomInviteModel": { getRoomInviteCreateLabel: () => "Invite" },
      "./chatThreadStyles": { styles: {} },
      "./RoomInviteComposerIcon": { RoomInviteComposerIcon: "InviteIcon" }
    },
    real: ["./chatComposerDraftModel"]
  })
  const sent: string[] = []
  let accepted = true
  let pending = false
  let clears = 0
  const show = () => runtime.render(() => ChatComposer({
    chatCopy: CHAT_COPY.en, chatLocale: "en", partnerName: "Partner",
    isPendingThread: pending, canCreateRoomInvite: false, isCreatingRoomInvite: false,
    roomInviteDisabledReason: null, onRoomInvitePress: () => undefined,
    onSend: (body) => { sent.push(body); return accepted }
  }))
  show()
  const input = () => findElements(runtime.output, (node) => node.type === "TextInput")[0].props
  const button = () => findElements(runtime.output, (node) => node.props.accessibilityLabel === CHAT_COPY.en.sendAccessibilityLabel("Partner"))[0].props
  ;(input().ref as { current: unknown }).current = { clear: () => { clears += 1 } }
  return {
    runtime, input, button, sent, clears: () => clears,
    type: (text: string) => (input().onChangeText as (text: string) => void)(text),
    refuse: () => { accepted = false },
    pending: () => { pending = true; show() }
  }
}

test("the first press sends the latest native draft even if its callback predates the edit", () => {
  const h = mountComposer()
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

test("a press keeps a refused draft and blocks pending or empty sends", () => {
  const h = mountComposer()
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
