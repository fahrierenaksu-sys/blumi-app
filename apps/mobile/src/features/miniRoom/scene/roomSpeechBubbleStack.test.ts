import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { resolveMiniRoomMotionPolicy } from "./miniRoomReducedMotion"
import type { AvatarState, SpeechBubble } from "./miniRoomSceneTypes"
import type { RoomSpeechBubbleStackProps } from "./RoomSpeechBubbleStack"
import type * as MotionModule from "./roomSpeechBubbleMotion"

// Speech bubbles stack per speaker (newest at the bottom) and animate only
// through Reanimated layout animations on the UI thread: a calm fade and a
// small rise, never a scale; Reduce Motion keeps only the fades.
type Element = { type: unknown; props: Record<string, unknown> & { children?: unknown }; key?: unknown }

const reanimated = {
  __esModule: true,
  default: { View: "Reanimated.View" }
}

/** Animations as data: what each value animates to, and on which token. */
type Step = { to: number; token: string }
const motionStub = {
  resolveMotion: (reduced: boolean) => reduced
    ? { fadeIn: "crossfade", fadeOut: "crossfade", smooth: "instant" }
    : { fadeIn: "fadeIn", fadeOut: "fadeOut", smooth: "smooth" },
  animateTo: (to: number, token: string): Step => ({ to, token })
}

function loadMotion() {
  return loadSourceWithFakeReact<typeof MotionModule>("features/miniRoom/scene/roomSpeechBubbleMotion.ts",
    createFakeReactRuntime(), { modules: { "../../../ui/motion": motionStub } })
}

function loadStack() {
  const runtime = createFakeReactRuntime()
  const { RoomSpeechBubbleStack } = loadSourceWithFakeReact<{
    RoomSpeechBubbleStack: (props: RoomSpeechBubbleStackProps) => Element | null
  }>("features/miniRoom/scene/RoomSpeechBubbleStack.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": reanimated,
      "../../../ui/PressableScale": { PressableScale: "PressableScale" },
      "../../../ui/haptics": { hapticSelection: () => undefined },
      "./roomSpeechBubbleMotion": loadMotion()
    }
  })
  return RoomSpeechBubbleStack
}

const hasScale = (value: unknown): boolean => JSON.stringify(value ?? null).includes("scale")

const bubble = (id: string, body = id): SpeechBubble => ({
  id, speakerUserId: "partner", body, tone: "chat", createdAt: 0, expiresAt: 4_000
})

function children(element: Element): Element[] {
  const value = element.props.children
  return (Array.isArray(value) ? value.flat() : [value]).filter(Boolean) as Element[]
}

function findAll(node: unknown, predicate: (element: Element) => boolean, found: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, found)
    return found
  }
  if (!node || typeof node !== "object") return found
  const element = node as Element
  if (predicate(element)) found.push(element)
  findAll(element.props?.children, predicate, found)
  return found
}

function render(bubbles: SpeechBubble[], animate: boolean) {
  const Stack = loadStack()
  const dismissed: string[] = []
  const root = Stack({
    bubbles,
    placement: "center",
    raised: false,
    animate,
    onDismissBubble: (id) => { dismissed.push(id) },
    dismissBubbleLabel: "Dismiss"
  })
  return { root, dismissed }
}

test("lines stack oldest to newest in one column; only the newest points at the chibi", () => {
  const { root, dismissed } = render([bubble("one", "First"), bubble("two", "Second")], true)
  assert.ok(root)
  const lines = children(root)
  assert.deepEqual(lines.map(({ key }) => key), ["one", "two"], "keyed by line: a staying line never remounts")
  assert.deepEqual(
    findAll(root, ({ type }) => type === "Text").map(({ props }) => props.children),
    ["First", "Second"]
  )
  const tails = lines.map((line) => findAll(line, ({ type, props }) => type === "View" && props.pointerEvents === "none").length)
  assert.deepEqual(tails, [0, 1])

  const buttons = findAll(root, ({ props }) => props.accessibilityRole === "button")
  ;(buttons[0]!.props.onPress as () => void)()
  assert.deepEqual(dismissed, ["one"], "each line is dismissed on its own")
})

type Layout = { initialValues: Record<string, unknown>; animations: Record<string, unknown> }
const entryValues = { targetOriginX: 0, targetOriginY: 40, targetWidth: 120, targetHeight: 32 } as never
const moveValues = { currentOriginX: 0, currentOriginY: 40, targetOriginX: 0, targetOriginY: 2 } as never

test("a line fades in rising a few points, the stack glides on the smooth spring, a line leaves by fading: never a scale", () => {
  const { root } = render([bubble("one"), bubble("two")], true)
  for (const line of children(root!)) {
    assert.equal(line.type, "Reanimated.View", "layout animations run on the UI thread")
    const enter = (line.props.entering as (values: never) => Layout)(entryValues)
    assert.deepEqual(enter.initialValues, { opacity: 0, transform: [{ translateY: 6 }] })
    assert.deepEqual(enter.animations, {
      opacity: { to: 1, token: "fadeIn" }, transform: [{ translateY: { to: 0, token: "smooth" } }]
    })
    const exit = (line.props.exiting as () => Layout)()
    assert.deepEqual(exit.animations, { opacity: { to: 0, token: "fadeOut" } }, "leaving is a fade only")
    const move = (line.props.layout as (values: never) => Layout)(moveValues)
    assert.deepEqual(move.animations, { originX: { to: 0, token: "smooth" }, originY: { to: 2, token: "smooth" } })
    for (const animation of [enter, exit, move]) assert.equal(hasScale(animation), false, "no grow or shrink")
  }
})

test("Reduce Motion: lines only fade in and out; nothing rises or glides", () => {
  const { root } = render([bubble("one"), bubble("two")], false)
  for (const line of children(root!)) {
    const enter = (line.props.entering as (values: never) => Layout)(entryValues)
    assert.deepEqual(enter.initialValues, { opacity: 0, transform: [{ translateY: 0 }] })
    assert.deepEqual(enter.animations.opacity, { to: 1, token: "crossfade" })
    assert.deepEqual((line.props.exiting as () => Layout)().animations, { opacity: { to: 0, token: "crossfade" } })
    assert.equal(line.props.layout, undefined, "older lines move at once")
  }
  assert.equal(render([], true).root, null)
})

test("the avatar layer hands each avatar only its own lines and the Reduce Motion policy", () => {
  const runtime = createFakeReactRuntime()
  const { AvatarLayer } = loadSourceWithFakeReact<{ AvatarLayer: (props: unknown) => Element }>(
    "features/miniRoom/scene/AvatarLayer.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
        "../miniRoomAvatarMotion": { getMiniRoomAvatarRenderLayers: () => [], getMiniRoomAvatarSittingScaleY: () => 1 },
        "./RoomSpeechBubbleStack": { RoomSpeechBubbleStack: "RoomSpeechBubbleStack" },
        "./RoomTypingBubble": { RoomTypingBubble: "RoomTypingBubble" }
      },
      real: ["./miniRoomSpeechStack", "./miniRoomReducedMotion", "./miniRoomPresentation"],
      inertUnknown: true
    }
  )
  const avatar = (userId: string, x: number): AvatarState => ({
    userId, displayName: userId, x, y: 0.7, facing: "left", motion: "idle", appearance: {}
  } as AvatarState)
  const lines: SpeechBubble[] = [
    { ...bubble("p1"), speakerUserId: "partner" },
    { ...bubble("l1"), speakerUserId: "local" },
    { ...bubble("p2"), speakerUserId: "partner" }
  ]
  const figuresFor = (reduceMotion: boolean, bubbles: SpeechBubble[] = lines) => runtime.render(() => {
    const layer = AvatarLayer({
      avatars: { partner: avatar("partner", 0.3), local: avatar("local", 0.7) },
      avatarPositions: { partner: {}, local: {} },
      localUserId: "local",
      localUserLabel: "You",
      bubbles,
      onDismissBubble: () => undefined,
      dismissBubbleLabel: "Dismiss",
      partnerJustJoined: false,
      motionPolicy: resolveMiniRoomMotionPolicy(reduceMotion),
      typingUserId: "partner"
    })
    // Speech rides in each avatar's overlay (above furniture); bodies carry none.
    return Object.fromEntries(children(layer).flatMap((figure) => {
      const output = (figure.type as (props: unknown) => Element)(figure.props)
      const [stack] = findAll(output, ({ type }) => type === "RoomSpeechBubbleStack")
      if (!stack) return []
      const typingDots = findAll(output, ({ type }) => type === "RoomTypingBubble").length
      return [[(figure.props.avatar as AvatarState).userId, { stack: stack.props, typingDots }]]
    }))
  })

  const animated = figuresFor(false)
  assert.deepEqual((animated.partner!.stack.bubbles as SpeechBubble[]).map(({ id }) => id), ["p1", "p2"])
  assert.deepEqual((animated.local!.stack.bubbles as SpeechBubble[]).map(({ id }) => id), ["l1"])
  assert.equal(animated.partner!.stack.animate, true)
  assert.equal(animated.partner!.typingDots, 0, "a spoken line wins over the typing dots")
  assert.equal(figuresFor(true).partner!.stack.animate, false)
  const quiet = figuresFor(false, [])
  assert.equal(quiet.partner!.typingDots, 1)
  assert.equal(quiet.local!.typingDots, 0)
})
