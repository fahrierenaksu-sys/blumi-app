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
import type { RoomChatHistoryItem } from "../roomChatHistoryModel"
import type * as ChatPanelModule from "./MiniRoomChatPanel"
import type * as HistoryModule from "./MiniRoomChatHistory"
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

interface HeldAnimation {
  readonly held: true
  readonly target: number
  readonly delay: number
  readonly callback?: (finished: boolean) => void
}

/**
 * Animations that wait: a shared value keeps showing where it was until
 * `finish()` lands every running animation (its callback hears `true`); an
 * animation replaced before then is interrupted (its callback hears `false`),
 * as on the UI thread. So a test can look at the first frame and at rest.
 */
function holdAnimations(runtime: FakeReactRuntime, module: Record<string, unknown>) {
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  const running = new Map<object, { animation: HeldAnimation; land: () => void }>()
  const isHeld = (value: unknown): value is HeldAnimation =>
    Boolean(value) && typeof value === "object" && (value as HeldAnimation).held === true
  const start = (target: number, _config?: unknown, callback?: (finished: boolean) => void): HeldAnimation =>
    ({ held: true, target, delay: 0, callback })
  module.withSpring = start
  module.withTiming = start
  module.withDelay = (delay: number, animation: HeldAnimation): HeldAnimation => ({ ...animation, delay })
  const useHeldSharedValue = <T,>(initial: T) => {
    const ref = useRef<{ value: T } | null>(null)
    if (!ref.current) {
      let current = initial
      const box = {
        get value() { return current },
        set value(next: T) {
          const previous = running.get(box)
          running.delete(box)
          previous?.animation.callback?.(false)
          if (isHeld(next)) {
            running.set(box, { animation: next, land: () => { current = next.target as T } })
          } else {
            current = next
          }
        }
      }
      ref.current = box
    }
    return ref.current
  }
  module.useSharedValue = useHeldSharedValue
  return {
    /** The animations still running, in start order. */
    running: () => [...running.values()].map(({ animation }) => animation),
    finish() {
      for (const [box, { animation, land }] of [...running]) {
        running.delete(box)
        land()
        animation.callback?.(true)
      }
      runtime.rerender()
    }
  }
}

function loadControls(osReduceMotion: boolean, options: { hold?: boolean } = {}) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const animations = options.hold ? holdAnimations(runtime, reanimated.module) : null
  const reactNative = createReactNativeStub({
    TextInput: "TextInput",
    FlatList: "FlatList",
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
  const { MiniRoomChatHistory } = loadSourceWithFakeReact<typeof HistoryModule>(
    "features/miniRoom/scene/MiniRoomChatHistory.tsx", runtime,
    { modules, real: [...real, "./miniRoomReducedMotion", "./miniRoomFirstAppearance", "../roomChatHistoryModel"] })
  return {
    runtime, reanimated, haptics, MiniRoomHud, RoomChatComposer, MiniRoomChatPanel, MiniRoomChatHistory,
    animations: animations as ReturnType<typeof holdAnimations>
  }
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

async function mountHud(osReduceMotion: boolean, options: { hold?: boolean } = {}, overrides: Partial<Parameters<typeof HudModule.MiniRoomHud>[0]> = {}) {
  const controls = loadControls(osReduceMotion, options)
  const { props, calls } = hudProps(overrides)
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
    ...overrides
  }
  return { props, calls }
}

async function mountComposer(osReduceMotion: boolean, overrides: Partial<ComposerModule.RoomChatComposerProps> = {},
  options: { hold?: boolean } = {}) {
  const controls = loadControls(osReduceMotion, options)
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
  const frame = { progress: 1, margin: 0, bottom: 0, height: 120, cameraX: 0, cameraY: 0, cameraScale: 1,
    restHeight: 297, roomWidth: 546 }
  runtime.render(() => expand(MiniRoomChatPanel({
    copy, mode: "typing", transition: shared(frame) as never, contentProgress: shared(1) as never,
    windowWidth: 390, windowHeight: 844, historyHeight: 200, historyItems: [], historyStatus: "ready",
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

/* ── Micro-delight: every moment lands exactly at the design's rest ── */

/** The innermost element of `type` whose subtree holds a match. */
function wrapperOf(tree: unknown, type: string, match: (element: Element) => boolean): Element {
  const wrappers = findAll(tree, (element) => element.type === type && findAll(element.props.children, match).length > 0)
  assert.ok(wrappers.length > 0, `a ${type} wraps the match`)
  return wrappers[wrappers.length - 1]!
}

const scaleOf = (element: Element): number =>
  (flatten(element.props.style).transform as object[] | undefined)?.find((step) => "scale" in step)
    ? ((flatten(element.props.style).transform as { scale?: number }[]).find((step) => "scale" in step)!.scale ?? 1)
    : 1

test("an accepted send pops the send button back from small; a refused send and Reduce Motion keep it still", async () => {
  const sendWrapper = (runtime: FakeReactRuntime) => wrapperOf(runtime.output, "Animated.View",
    (element) => element.props.accessibilityLabel === copy.sendRoomMessage)
  const sent = await mountComposer(false, {}, { hold: true })
  sent.animations.finish()
  control(sent.runtime, copy.sendRoomMessage).props.onPress()
  sent.runtime.rerender()
  assert.ok(scaleOf(sendWrapper(sent.runtime)) < 1, "the pop starts small")
  sent.animations.finish()
  assert.equal(scaleOf(sendWrapper(sent.runtime)), 1, "and springs back to the design's size")

  for (const [reduceMotion, onSubmit] of [[false, () => false], [true, () => true]] as const) {
    const still = await mountComposer(reduceMotion, { onSubmit }, { hold: true })
    still.animations.finish()
    control(still.runtime, copy.sendRoomMessage).props.onPress()
    still.runtime.rerender()
    assert.equal(scaleOf(sendWrapper(still.runtime)), 1)
  }
})

test("flipping keyboard suggestions tilts the glyph and swells its dot, each way opposite, then rests", async () => {
  const glyph = (runtime: FakeReactRuntime) => wrapperOf(runtime.output, "Animated.View", (element) => element.type === "SymbolView")
  const tiltOf = (runtime: FakeReactRuntime) =>
    Number.parseFloat(flatten(glyph(runtime).props.style).transform[0].rotate)
  const tilts: number[] = []
  for (const suggestionsEnabled of [false, true]) {
    const hud = await mountHud(false, { hold: true }, { suggestionsEnabled })
    hud.animations.finish()
    assert.equal(tiltOf(hud.runtime), 0, "at rest the glyph is upright")
    control(hud.runtime, copy.keyboardSuggestions).props.onPress()
    hud.runtime.rerender()
    tilts.push(tiltOf(hud.runtime))
    hud.animations.finish()
    assert.equal(tiltOf(hud.runtime), 0, "the flip settles upright")
    assert.equal(scaleOf(glyph(hud.runtime)), 1)
  }
  assert.ok(tilts[0]! * tilts[1]! < 0, "turning on and turning off tilt opposite ways")

  const reduced = await mountHud(true, { hold: true })
  reduced.animations.finish()
  control(reduced.runtime, copy.keyboardSuggestions).props.onPress()
  reduced.runtime.rerender()
  assert.equal(tiltOf(reduced.runtime), 0, "Reduce Motion keeps the glyph still")
})

test("the room menu grows from its anchor, and on close stays drawn but untouchable until its fade ends", async () => {
  const hud = await mountHud(false, { hold: true })
  hud.animations.finish()
  const menuLayer = () => findAll(hud.runtime.output, (element) => element.props?.accessibilityViewIsModal !== undefined)[0]
  const menuCard = () => wrapperOf(hud.runtime.output, "Animated.View", (element) => element.props.accessibilityRole === "menuitem")
  assert.equal(menuLayer(), undefined, "closed: nothing is mounted")

  control(hud.runtime, copy.roomOptions).props.onPress()
  hud.runtime.rerender()
  assert.equal(menuLayer()!.props.accessibilityViewIsModal, true)
  assert.ok(flatten(menuCard().props.style).opacity < 1 && scaleOf(menuCard()) < 1, "opening starts small and faint")
  assert.equal(flatten(menuCard().props.style).transformOrigin, "top right", "it grows from the options button")
  hud.animations.finish()
  assert.equal(flatten(menuCard().props.style).opacity, 1)
  assert.equal(scaleOf(menuCard()), 1, "open: exactly the designed menu")

  control(hud.runtime, copy.closeRoomOptions).props.onPress()
  hud.runtime.rerender()
  assert.equal(menuLayer()!.props.pointerEvents, "none", "a closing menu never catches a tap")
  assert.equal(menuLayer()!.props.accessibilityViewIsModal, false)
  // Reopened mid-exit: the interrupted fade must not unmount it.
  control(hud.runtime, copy.roomOptions).props.onPress()
  hud.runtime.rerender()
  hud.animations.finish()
  assert.equal(menuLayer()!.props.pointerEvents, "auto")

  control(hud.runtime, copy.closeRoomOptions).props.onPress()
  hud.animations.finish()
  assert.equal(menuLayer(), undefined, "the exit finished: the menu is gone")

  const reduced = await mountHud(true, { hold: true })
  reduced.animations.finish()
  control(reduced.runtime, copy.roomOptions).props.onPress()
  reduced.runtime.rerender()
  const card = wrapperOf(reduced.runtime.output, "Animated.View", (element) => element.props.accessibilityRole === "menuitem")
  assert.equal(scaleOf(card), 1, "Reduce Motion: the menu does not grow, it only fades")
})

function panelProps(mode: "history" | "typing") {
  const shared = <T,>(value: T) => ({ value })
  return {
    copy, mode, transition: shared({ progress: mode === "typing" ? 1 : 0, margin: 0, bottom: 0, height: 120,
      cameraX: 0, cameraY: 0, cameraScale: 1, restHeight: 297, roomWidth: 546 }) as never,
    contentProgress: shared(mode === "typing" ? 1 : 0) as never,
    windowWidth: 390, windowHeight: 844, historyHeight: 200, historyItems: [], historyStatus: "ready" as const,
    partnerName: "Bora", onRecentHeightChange: () => undefined, onRecentRowsHeightChange: () => undefined,
    onCloseKeyboard: () => undefined, scrollToLatestRequest: 0, children: null
  }
}

/** The recent strip's name, line and close-keyboard wrapper. */
function recentItems(tree: unknown): Element[] {
  const texts = findAll(tree, (element) => element.type === "Animated.Text")
  const close = wrapperOf(tree, "Animated.View", (element) => element.props?.accessibilityLabel === copy.closeKeyboard)
  return [...texts, close]
}

const riseOf = (element: Element): number => flatten(element.props.style).transform?.[0]?.translateY ?? 0

test("the recent strip's items rise in one after another on its first appearance only", async () => {
  const { runtime, MiniRoomChatPanel, animations } = loadControls(false, { hold: true })
  const show = (mode: "history" | "typing") => runtime.render(() => expand(MiniRoomChatPanel(panelProps(mode))))
  show("history")
  await flush()
  runtime.rerender()
  animations.finish()
  assert.equal(recentItems(runtime.output).length, 3, "name, line and close")
  assert.ok(recentItems(runtime.output).every((item) => riseOf(item) > 0), "hidden in history mode, the items wait below")

  show("typing")
  const delays = animations.running().map((animation) => animation.delay)
  assert.equal(delays.length, 3)
  assert.ok(delays.every((delay, index) => index === 0 || delay > delays[index - 1]!), "each item waits a stagger step longer")
  animations.finish()
  assert.ok(recentItems(runtime.output).every((item) => riseOf(item) === 0), "every item lands exactly at rest")

  show("history")
  show("typing")
  assert.deepEqual(animations.running(), [], "a later appearance only crossfades")
})

test("Reduce Motion: the recent strip's items never travel", async () => {
  const { runtime, MiniRoomChatPanel } = loadControls(true, { hold: true })
  runtime.render(() => expand(MiniRoomChatPanel(panelProps("history"))))
  await flush()
  runtime.rerender()
  assert.deepEqual(recentItems(runtime.output).map(riseOf), [0, 0, 0])
})

const message = (id: string, index: number): RoomChatHistoryItem => ({
  id, body: `Message ${index}`, mine: index % 2 === 0, delivery: "sent", sentAt: "2026-10-02T10:00:00.000Z"
} as RoomChatHistoryItem)

async function mountHistory(osReduceMotion: boolean, count: number) {
  const controls = loadControls(osReduceMotion, { hold: true })
  const { runtime, MiniRoomChatHistory } = controls
  let items = Array.from({ length: count }, (_, index) => message(`m${index}`, index))
  const rows = () => {
    const list = findAll(expand(MiniRoomChatHistory({ copy, items, status: "ready", partnerName: "Bora", height: 300 })),
      (element) => element.type === "FlatList")[0]!
    const data = list.props.data as RoomChatHistoryItem[]
    // Oldest first, so a newer message adds its hooks after the existing rows.
    return [...data].reverse().map((item) => expand(list.props.renderItem({ item, index: data.indexOf(item) })) as Element)
  }
  runtime.render(rows)
  await flush()
  runtime.rerender()
  const byId = (id: string) => {
    const body = items.find((item) => item.id === id)!.body
    return (runtime.output as Element[]).find((row) => String(row.props.accessibilityLabel).includes(body))!
  }
  return {
    ...controls, byId,
    receive(item: RoomChatHistoryItem) {
      items = [item, ...items]
      runtime.rerender()
    }
  }
}

test("the transcript's first appearance staggers its newest rows in; later messages appear at rest", async () => {
  const history = await mountHistory(false, 8)
  const { animations, byId } = history
  const opacityOf = (id: string) => flatten(byId(id).props.style).opacity ?? 1
  for (const id of ["m0", "m5"]) {
    assert.equal(opacityOf(id), 0, `${id} waits to enter`)
    assert.notEqual(riseOf(byId(id)), 0, `${id} starts off its rest`)
  }
  assert.equal(opacityOf("m6"), 1, "past the stagger's rows, rows appear at rest")
  const delays = animations.running().map((animation) => animation.delay)
  assert.ok(delays.length > 1 && Math.max(...delays) > Math.min(...delays), "rows enter one after another")
  animations.finish()
  for (const id of ["m0", "m5", "m6"]) {
    assert.equal(opacityOf(id), 1)
    assert.equal(riseOf(byId(id)), 0, `${id} lands exactly at rest`)
  }
  history.receive(message("late", 99))
  assert.equal(opacityOf("late"), 1, "a new message is not part of the first appearance")
  assert.deepEqual(animations.running(), [])
})

test("Reduce Motion: the transcript's rows fade in together and never travel", async () => {
  const { animations, byId } = await mountHistory(true, 3)
  assert.ok(animations.running().length > 0, "the rows still fade in")
  assert.ok(animations.running().every((animation) => animation.delay === 0), "no stagger delay")
  for (const id of ["m0", "m1", "m2"]) assert.equal(riseOf(byId(id)), 0)
})
