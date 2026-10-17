import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as BurstModule from "./MiniRoomEmoteBurst"
import { CHAT_EMOTES } from "../emotes/chatEmoteMapper"
import { MINI_ROOM_EMOTE_LIFETIME_MS } from "../emotes/miniRoomEmoteModel"

type Element = { type: unknown; props: Record<string, unknown> & { children?: unknown } }

function mount() {
  const runtime = createFakeReactRuntime()
  const calls: { kind: "start" | "cancel"; duration?: number }[] = []
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  const burst = loadSourceWithFakeReact<typeof BurstModule>("features/miniRoom/scene/MiniRoomEmoteBurst.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "react-native-reanimated": {
        default: { View: "AnimatedView" },
        useSharedValue: (value: number) => useRef({ value }).current,
        useAnimatedStyle: (read: () => unknown) => ({ read }),
        withTiming: (_to: number, config: { duration: number }) => {
          calls.push({ kind: "start", duration: config.duration })
          return 0
        },
        cancelAnimation: () => { calls.push({ kind: "cancel" }) },
        Easing: { linear: "linear" },
        ReduceMotion: { Never: "never" }
      }
    },
    real: ["../emotes/miniRoomEmoteModel"]
  })
  /** Renders the burst and the one component inside it (the fake runtime does not descend on its own). */
  const render = (props: BurstModule.MiniRoomEmoteBurstProps) => runtime.render(() => {
    const root = burst.MiniRoomEmoteBurst(props) as unknown as Element
    const inner = root.props.children as Element
    return { root, inner, content: (inner.type as (p: unknown) => Element)(inner.props) }
  })
  return { burst, calls, runtime, render }
}

test("under Reduce Motion an emote is one still badge and no animation runs", () => {
  const f = mount()
  for (const emote of CHAT_EMOTES) {
    const { root, content } = f.render({ emote, side: "right", reduceMotion: true })
    assert.equal(root.props.importantForAccessibility, "no-hide-descendants")
    assert.equal(root.props.pointerEvents, "none")
    assert.equal(content.props.testID, "mini-room-emote-badge")
  }
  assert.deepEqual(f.calls, [])
})

test("an animated emote plays once over its lifetime and stops when it leaves", () => {
  const f = mount()
  f.render({ emote: "heart", side: "left", reduceMotion: false })
  f.runtime.rerender()
  assert.deepEqual(f.calls, [{ kind: "start", duration: MINI_ROOM_EMOTE_LIFETIME_MS }])
  f.runtime.unmount()
  assert.deepEqual(f.calls.map((call) => call.kind), ["start", "cancel"])
})

test("every emote's particles appear after their delay and are fully gone by the end", () => {
  const f = mount()
  for (const emote of CHAT_EMOTES) {
    const particles = f.burst.MINI_ROOM_EMOTE_PARTICLES[emote]
    assert.ok(particles.length > 0, emote)
    for (const spec of particles) {
      const frameAt = (p: number) => f.burst.resolveMiniRoomEmoteParticleFrame(p, spec.motion, spec.delay,
        spec.rise ?? 0, spec.drift ?? 0)
      if (spec.delay > 0) assert.equal(frameAt(spec.delay / 2).opacity, 0, `${emote} before its delay`)
      assert.ok(frameAt(spec.delay + (1 - spec.delay) * 0.4).opacity > 0.3, `${emote} visible mid-way`)
      assert.ok(frameAt(1).opacity <= 0.001, `${emote} gone at the end`)
    }
  }
})

test("hearts and z's float upward; the laugh hops and lands", () => {
  const f = mount()
  const frame = f.burst.resolveMiniRoomEmoteParticleFrame
  assert.ok(frame(0.9, "rise", 0, 40, 6).translateY < frame(0.2, "rise", 0, 40, 6).translateY)
  assert.ok(frame(1 / 6, "bounce", 0, 0, 0).translateY < -4)
  assert.ok(Math.abs(frame(1, "bounce", 0, 0, 0).translateY) < 0.001)
})
