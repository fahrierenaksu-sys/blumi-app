import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReactNativeStub,
  createReanimatedStub,
  loadSourceWithFakeReact,
  type FakeReactRuntime
} from "../../../testing/hookHarness"
import { getMiniRoomCopy } from "../miniRoomCopy"
import type * as ChatPanelModule from "./MiniRoomChatPanel"
import type * as HudModule from "./MiniRoomHud"
import type * as ComposerModule from "./RoomChatComposer"

// The MiniRoom's controls, mounted over the real PressableScale and motion
// modules: a press is felt (a scale on the `press` spring, or a dim under
// Reduce Motion), every action plays exactly one haptic, and roles and labels
// stay for VoiceOver.

type Element = { type: unknown; props: Record<string, any> }

const copy = getMiniRoomCopy("en")
const flush = () => new Promise((resolve) => setImmediate(resolve))
const pressEvent = {} as never

/** Renders nested function components in place, so the whole control tree is visible. */
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand)
  if (!node || typeof node !== "object") return node
  const element = node as Element
  if (typeof element.type === "function") return expand((element.type as (props: unknown) => unknown)(element.props))
  if (!element.props) return node
  return { ...element, props: { ...element.props, children: expand(element.props.children) } }
}

function findAll(node: unknown, match: (element: Element) => boolean, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, match, found)
    return found
  }
  if (!node || typeof node !== "object") return found
  const element = node as Element
  if (match(element)) found.push(element)
  findAll(element.props?.children, match, found)
  return found
}

function flatten(style: unknown): Record<string, any> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  return style && typeof style === "object" ? style as Record<string, any> : {}
}

function loadControls(osReduceMotion: boolean) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const reactNative = createReactNativeStub({
    TextInput: "TextInput",
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(osReduceMotion),
      addEventListener: () => ({ remove: () => undefined })
    }
  })
  const base = { "react-native": reactNative.module, "react-native-reanimated": reanimated.module }
  const motion = loadSourceWithFakeReact("ui/motion.ts", runtime, {
    modules: base,
    real: ["./reducedMotionStore", "./motionTokens"]
  })
  const pressableScale = loadSourceWithFakeReact("ui/PressableScale.tsx", runtime, {
    modules: { ...base, "./motion": motion }
  })
  const haptics: string[] = []
  const record = (kind: string) => () => { haptics.push(kind) }
  const modules = {
    ...base,
    "../../../ui/motion": motion,
    "../../../ui/PressableScale": pressableScale,
    "../../../ui/haptics": {
      hapticSelection: record("selection"),
      hapticLight: record("light"),
      hapticSoft: record("soft"),
      hapticMedium: record("medium")
    },
    "react-native-worklets": { scheduleOnRN: (work: (...args: unknown[]) => void, ...args: unknown[]) => work(...args) },
    "@expo/vector-icons/Ionicons": { __esModule: true, default: "Ionicons" },
    "expo-symbols": { SymbolView: "SymbolView" },
    "../../avatarV2/wardrobe/WardrobeGlass": { WardrobeGlass: "WardrobeGlass" },
    "../../avatarV2/wardrobe/wardrobeV2Styles": { wardrobeTheme: { ink: "#49364A", shadow: "#865078" } },
    "./MiniRoomChatHistory": { MiniRoomChatHistory: "MiniRoomChatHistory" }
  }
  const real = ["./miniRoomStatusNotice", "./miniRoomLayout", "./miniRoomTransitionModel"]
  const { MiniRoomHud } = loadSourceWithFakeReact<typeof HudModule>("features/miniRoom/scene/MiniRoomHud.tsx", runtime,
    { modules, real })
  const { RoomChatComposer } = loadSourceWithFakeReact<typeof ComposerModule>(
    "features/miniRoom/scene/RoomChatComposer.tsx", runtime, { modules, real, globals: { setTimeout, clearTimeout } })
  const { MiniRoomChatPanel } = loadSourceWithFakeReact<typeof ChatPanelModule>(
    "features/miniRoom/scene/MiniRoomChatPanel.tsx", runtime, { modules, real })
  return { runtime, reanimated, haptics, MiniRoomHud, RoomChatComposer, MiniRoomChatPanel }
}

type Controls = ReturnType<typeof loadControls>

function hudProps(overrides: Partial<Parameters<typeof HudModule.MiniRoomHud>[0]> = {}) {
  const calls: string[] = []
  const props: Parameters<typeof HudModule.MiniRoomHud>[0] = {
    copy, partnerFirstName: "Bora", connectionStatus: "error", voiceAvailable: false,
    localMedia: { micEnabled: false } as never, leaveDisabled: false, horizontalInset: 16,
    headerTop: 50, headerBottom: 94, notices: [],
    onLeave: () => calls.push("leave"), onOpenSafety: () => calls.push("safety"),
    onRetryConnect: () => calls.push("retry"), onToggleMic: () => calls.push("mic"),
    suggestionsEnabled: false, onToggleSuggestions: () => calls.push("suggestions"),
    onCloseKeyboard: () => calls.push("closeKeyboard"),
    ...overrides
  }
  return { props, calls }
}

async function mountHud(osReduceMotion: boolean) {
  const controls = loadControls(osReduceMotion)
  const { props, calls } = hudProps()
  const { runtime, MiniRoomHud } = controls
  runtime.render(() => expand(MiniRoomHud(props)))
  await flush()
  runtime.rerender()
  return { ...controls, calls }
}

/** The first control labelled `label` (the header's leave comes before the menu's). */
function control(runtime: FakeReactRuntime, label: string): Element {
  const found = findAll(runtime.output, (element) => element.type === "Pressable" && element.props.accessibilityLabel === label)
  assert.ok(found.length > 0, `a control is labelled "${label}"`)
  return found[0]!
}

/** The style of `label` while pressed. */
function pressedStyle(runtime: FakeReactRuntime, label: string): Record<string, any> {
  control(runtime, label).props.onPressIn(pressEvent)
  runtime.rerender()
  const style = flatten(control(runtime, label).props.style)
  control(runtime, label).props.onPressOut(pressEvent)
  runtime.rerender()
  return style
}

const HUD_LABELS = [copy.leaveRoom, copy.keyboardSuggestions, copy.roomOptions, copy.retryRoomConnection]

function openMenu({ runtime, haptics }: Controls) {
  control(runtime, copy.roomOptions).props.onPress()
  haptics.splice(0)
}

test("every HUD control and room menu item scales on the press spring and keeps its role", async () => {
  const hud = await mountHud(false)
  const { runtime } = hud
  openMenu(hud)
  for (const label of [...HUD_LABELS, copy.openSafetyOptions]) {
    const element = control(runtime, label)
    assert.ok(element.props.accessibilityRole, `${label} keeps an accessible role`)
    const style = pressedStyle(runtime, label)
    assert.ok(style.transform?.[0]?.scale < 1, `${label} shrinks while pressed`)
    assert.equal(flatten(control(runtime, label).props.style).transform[0].scale, 1, `${label} springs back to rest`)
  }
  assert.equal(control(runtime, copy.keyboardSuggestions).props.accessibilityRole, "switch")
  assert.equal(control(runtime, copy.openSafetyOptions).props.accessibilityRole, "menuitem")
})

test("under Reduce Motion a pressed HUD control dims in place instead of shrinking", async () => {
  const hud = await mountHud(true)
  openMenu(hud)
  for (const label of [...HUD_LABELS, copy.openSafetyOptions]) {
    const style = pressedStyle(hud.runtime, label)
    assert.equal(style.transform, undefined, `${label} does not move`)
    assert.ok(style.opacity < 1, `${label} dims while pressed`)
  }
})

test("each HUD action plays exactly one haptic: selection for switches and the menu, light for actions", async () => {
  const cases: [string, string, string][] = [
    [copy.keyboardSuggestions, "selection", "suggestions"],
    [copy.leaveRoom, "light", "leave"],
    [copy.retryRoomConnection, "light", "retry"]
  ]
  for (const [label, haptic, action] of cases) {
    const { runtime, haptics, calls } = await mountHud(false)
    control(runtime, label).props.onPress()
    assert.deepEqual(haptics, [haptic], label)
    assert.deepEqual(calls, [action], label)
  }
  const menu = await mountHud(false)
  control(menu.runtime, copy.roomOptions).props.onPress()
  assert.deepEqual(menu.haptics, ["selection"], "opening the room menu ticks once")
  menu.haptics.splice(0)
  control(menu.runtime, copy.openSafetyOptions).props.onPress()
  assert.deepEqual(menu.haptics, ["light"], "a menu action is a light tap")
  assert.ok(menu.calls.includes("safety"))
})

function composerProps(overrides: Partial<ComposerModule.RoomChatComposerProps> = {}) {
  const calls: string[] = []
  const props: ComposerModule.RoomChatComposerProps = {
    copy, value: "Selam", suggestionsEnabled: false, disabled: false, mode: "typing",
    maxInputHeight: 92, inputHeight: 44, onChangeText: () => undefined,
    onSubmit: () => { calls.push("submit"); return true },
    onToggleHistory: () => calls.push("toggleHistory"), onContentHeightChange: () => undefined,
    onFocus: () => undefined,
    ...overrides
  }
  return { props, calls }
}

async function mountComposer(osReduceMotion: boolean, overrides: Partial<ComposerModule.RoomChatComposerProps> = {}) {
  const controls = loadControls(osReduceMotion)
  const { props, calls } = composerProps(overrides)
  const render = controls.RoomChatComposer as unknown as (props: ComposerModule.RoomChatComposerProps) => unknown
  controls.runtime.render(() => expand(render(props)))
  await flush()
  controls.runtime.rerender()
  return { ...controls, calls }
}

test("the composer's buttons press with the shared spring, and dim instead under Reduce Motion", async () => {
  for (const reduceMotion of [false, true]) {
    const { runtime } = await mountComposer(reduceMotion)
    for (const label of [copy.returnToRoom, copy.sendRoomMessage]) {
      const style = pressedStyle(runtime, label)
      if (reduceMotion) {
        assert.equal(style.transform, undefined, label)
        assert.ok(style.opacity < 1, label)
      } else {
        assert.ok(style.transform[0].scale < 1, label)
      }
    }
  }
})

test("an accepted send ticks once, from the button or the return key; a refused send stays silent", async () => {
  const sent = await mountComposer(false)
  control(sent.runtime, copy.sendRoomMessage).props.onPress()
  assert.deepEqual(sent.haptics, ["selection"])
  sent.haptics.splice(0)
  const input = findAll(sent.runtime.output, (element) => element.type === "TextInput")[0]!
  input.props.onSubmitEditing()
  assert.deepEqual(sent.haptics, ["selection"], "the keyboard's send is the same send")

  const refused = await mountComposer(false, { onSubmit: () => false })
  control(refused.runtime, copy.sendRoomMessage).props.onPress()
  assert.deepEqual(refused.haptics, [], "nothing was sent, so nothing is felt")

  const toggle = await mountComposer(false)
  control(toggle.runtime, copy.returnToRoom).props.onPress()
  assert.deepEqual(toggle.haptics, ["selection"])
  assert.deepEqual(toggle.calls, ["toggleHistory"])
})

test("the chat panel's close-keyboard button presses with the spring and ticks once", async () => {
  const controls = loadControls(false)
  const { runtime, MiniRoomChatPanel, haptics } = controls
  let closed = 0
  const shared = <T,>(value: T) => ({ value })
  const frame = { progress: 1, margin: 0, bottom: 0, height: 120, cameraX: 0, cameraY: 0, cameraScale: 1 }
  runtime.render(() => expand(MiniRoomChatPanel({
    copy, mode: "typing", transition: shared(frame) as never, contentProgress: shared(1) as never,
    windowWidth: 390, historyHeight: 200, composerHeight: 44, historyItems: [], historyStatus: "ready",
    partnerName: "Bora", onRecentHeightChange: () => undefined, onRecentRowsHeightChange: () => undefined,
    onCloseKeyboard: () => { closed += 1 }, scrollToLatestRequest: 0, children: null
  })))
  await flush()
  runtime.rerender()
  assert.ok(pressedStyle(runtime, copy.closeKeyboard).transform[0].scale < 1)
  control(runtime, copy.closeKeyboard).props.onPress()
  assert.deepEqual(haptics, ["selection"])
  assert.equal(closed, 1)
})
