import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { resolveMiniRoomMotionPolicy } from "./miniRoomReducedMotion"
import type { AvatarState, SpeechBubble } from "./miniRoomSceneTypes"
import type { RoomSpeechBubbleStackProps } from "./RoomSpeechBubbleStack"

// Speech bubbles stack per speaker (newest at the bottom) and animate only
// through Reanimated layout animations on the UI thread; Reduce Motion shows
// and hides them without any animation.
type Element = { type: unknown; props: Record<string, unknown> & { children?: unknown }; key?: unknown }

function chainable(name: string): Record<string, unknown> {
  const animation: Record<string, unknown> = { name }
  for (const method of ["springify", "damping", "stiffness", "duration", "reduceMotion"]) {
    animation[method] = () => animation
  }
  return animation
}

const reanimated = {
  __esModule: true,
  default: { View: "Reanimated.View" },
  ZoomIn: chainable("ZoomIn"),
  FadeOut: chainable("FadeOut"),
  LinearTransition: chainable("LinearTransition"),
  ReduceMotion: { Never: "never" }
}

function loadStack() {
  const runtime = createFakeReactRuntime()
  const { RoomSpeechBubbleStack } = loadSourceWithFakeReact<{
    RoomSpeechBubbleStack: (props: RoomSpeechBubbleStackProps) => Element | null
  }>("features/miniRoom/scene/RoomSpeechBubbleStack.tsx", runtime, {
    modules: { "react-native": createReactNativeStub().module, "react-native-reanimated": reanimated }
  })
  return RoomSpeechBubbleStack
}

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

  const buttons = findAll(root, ({ type }) => type === "Pressable")
  ;(buttons[0]!.props.onPress as () => void)()
  assert.deepEqual(dismissed, ["one"], "each line is dismissed on its own")
})

test("each line pops in, glides up and fades out on the UI thread", () => {
  const { root } = render([bubble("one"), bubble("two")], true)
  for (const line of children(root!)) {
    assert.equal(line.type, "Reanimated.View")
    assert.equal((line.props.entering as { name: string }).name, "ZoomIn")
    assert.equal((line.props.exiting as { name: string }).name, "FadeOut")
    assert.equal((line.props.layout as { name: string }).name, "LinearTransition")
  }
})

test("Reduce Motion: lines appear and disappear without any animation", () => {
  const { root } = render([bubble("one"), bubble("two")], false)
  for (const line of children(root!)) {
    assert.equal(line.props.entering, undefined)
    assert.equal(line.props.exiting, undefined)
    assert.equal(line.props.layout, undefined)
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
      real: ["./miniRoomSpeechStack", "./miniRoomReducedMotion"],
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
