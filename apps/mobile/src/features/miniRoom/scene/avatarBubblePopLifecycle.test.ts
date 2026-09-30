import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { resolveMiniRoomMotionPolicy } from "./miniRoomReducedMotion"
import type { AvatarState, SpeechBubble } from "./miniRoomSceneTypes"

// The speech-bubble pop plays once per bubble id: a parent re-render that
// rebuilds the same bubble object must not replay it.
type Element = { type: (props: unknown) => unknown; props: { children: Element[] } }

function mount(reduceMotion = false) {
  const runtime = createFakeReactRuntime()
  const reactNative = createReactNativeStub()
  const { AvatarLayer } = loadSourceWithFakeReact<{ AvatarLayer: (props: unknown) => Element }>(
    "features/miniRoom/scene/AvatarLayer.tsx",
    runtime,
    {
      modules: {
        "react-native": reactNative.module,
        "../miniRoomAvatarMotion": { getMiniRoomAvatarRenderLayers: () => [] },
        "./miniRoomReducedMotion": { MINI_ROOM_PARTNER_ARRIVAL_MS: 900 }
      },
      inertUnknown: true
    }
  )
  const avatar: AvatarState = {
    userId: "partner", displayName: "Partner", x: 0.5, y: 0.7, facing: "left", motion: "idle", appearance: {}
  } as AvatarState
  const motionPolicy = resolveMiniRoomMotionPolicy(reduceMotion)
  const render = (bubbles: SpeechBubble[]) => runtime.render(() => {
    const layer = AvatarLayer({
      avatars: { partner: avatar },
      avatarPositions: { partner: {} },
      localUserId: "local",
      localUserLabel: "You",
      bubbles,
      onDismissBubble: () => undefined,
      dismissBubbleLabel: "Dismiss",
      partnerJustJoined: false,
      motionPolicy
    })
    const [figure] = layer.props.children
    return figure.type(figure.props)
  })
  const pops = () => reactNative.animatedCalls.filter(({ kind }) => kind === "spring.start").length
  return { render, pops, animatedCalls: reactNative.animatedCalls }
}

const bubble = (id: string): SpeechBubble => ({
  id, speakerUserId: "partner", body: "Hi", tone: "chat", createdAt: 0, expiresAt: 1000
})

test("a bubble pops once per id, not per re-created bubble object", () => {
  const f = mount()
  f.render([bubble("bubble-1")])
  assert.equal(f.pops(), 1)
  f.render([bubble("bubble-1")])
  f.render([bubble("bubble-1")])
  assert.equal(f.pops(), 1)
  f.render([bubble("bubble-2")])
  assert.equal(f.pops(), 2)
})

test("removing the bubble resets the pop, and Reduce Motion shows it without a spring", () => {
  const f = mount()
  f.render([bubble("bubble-1")])
  const before = f.animatedCalls.length
  f.render([])
  assert.deepEqual(f.animatedCalls.slice(before).map(({ kind }) => kind), ["spring.stop", "stopAnimation", "setValue"])
  const reduced = mount(true)
  reduced.render([bubble("bubble-1")])
  assert.equal(reduced.pops(), 0)
  assert.ok(reduced.animatedCalls.some(({ kind, value }) => kind === "setValue" && value === 1))
})
