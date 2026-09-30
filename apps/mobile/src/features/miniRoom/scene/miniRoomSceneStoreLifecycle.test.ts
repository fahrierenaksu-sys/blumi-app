import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createInertModule, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type { MiniRoomStore } from "./miniRoomSceneTypes"
import type { useMiniRoomSceneStore as UseMiniRoomSceneStore } from "./miniRoomSceneStore"

// Characterizes the MiniRoom scene store lifecycle: the scene resets only for a
// new participant or scene, speech timers stop on unmount, and speech uses the
// current bubble lifetime.
type StoreInput = Parameters<typeof UseMiniRoomSceneStore>[0]

function mount() {
  const runtime = createFakeReactRuntime()
  const timers = new Map<number, { run: () => void; delay: number }>()
  let timerId = 0
  const { cozyPinkBedroomScene } = loadSourceWithFakeReact<{ cozyPinkBedroomScene: unknown }>(
    "features/miniRoom/scene/roomMaps.ts",
    runtime,
    { modules: { "./miniRoomAssets": { miniRoomAssets: createInertModule("miniRoomAssets") } } }
  )
  const { useMiniRoomSceneStore } = loadSourceWithFakeReact<{ useMiniRoomSceneStore: typeof UseMiniRoomSceneStore }>(
    "features/miniRoom/scene/miniRoomSceneStore.ts",
    runtime,
    {
      modules: {
        "./roomMaps": { cozyPinkBedroomScene },
        "../miniRoomAvatarMotion": { canMiniRoomAvatarUseMotion: () => true },
        "./miniRoomAvatarPositions": {
          createMiniRoomAvatarPosition: (point: { x: number; y: number }) => ({ x: { value: point.x }, y: { value: point.y } }),
          createMiniRoomSegmentAnimator: () => ({ animate: () => undefined, cancel: () => undefined }),
          readMiniRoomAvatarPosition: (position: { x: { value: number }; y: { value: number } }) =>
            ({ x: position.x.value, y: position.y.value }),
          snapMiniRoomAvatarPosition: (position: { x: { value: number }; y: { value: number } }, point: { x: number; y: number }) => {
            position.x.value = point.x
            position.y.value = point.y
          }
        }
      },
      real: [
        "../../roomWorld/roomWorldGeometry",
        "../../roomWorld/roomWorldRoomV2Projection",
        "../../roomWorld/roomWorldMiniRoomProjection",
        "../../roomWorld/roomWorldRuntime",
        "./miniRoomMovementLifecycle",
        "./miniRoomMovementRun",
        "./miniRoomSpeechQueue"
      ],
      globals: {
        setTimeout: (run: () => void, delay: number) => {
          timerId += 1
          timers.set(timerId, { run, delay })
          return timerId
        },
        clearTimeout: (id: number) => { timers.delete(id) }
      }
    }
  )
  const snapshot = (displayName: string) => ({ displayName, appearance: {} })
  const participantAvatarSnapshots = { local: snapshot("Local"), partner: snapshot("Partner") }
  let input = {
    localUser: { userId: "local", displayName: "Local" },
    partnerUser: { userId: "partner", displayName: "Partner" },
    participantAvatarSnapshots,
    bubbleLifetimeMs: 4000
  } as unknown as StoreInput
  const render = (next: Partial<StoreInput> = {}) => {
    // A new input object every render, as the MiniRoom screen passes.
    input = { ...input, ...next }
    return runtime.render(() => useMiniRoomSceneStore({ ...input }))
  }
  const store = () => runtime.output as MiniRoomStore
  return { runtime, timers, render, store }
}

test("re-renders with the same participants keep the scene, speech and callbacks", () => {
  const f = mount()
  const first = f.render()
  first.sayPhrase("partner", "Hello")
  assert.equal(f.store().bubbles.length, 1)
  assert.equal(f.store().avatars.partner.motion, "speaking")
  f.render()
  f.render()
  assert.equal(f.store().bubbles.length, 1, "a re-render must not reset the scene")
  assert.equal(f.store().sayPhrase, first.sayPhrase)
  assert.equal(f.store().addSpeechBubble, first.addSpeechBubble)
  assert.equal(f.store().dismissSpeechBubble, first.dismissSpeechBubble)
})

test("a new partner resets avatars, speech and pending speech timers", () => {
  const f = mount()
  f.render().sayPhrase("partner", "Hello")
  assert.ok(f.timers.size > 0)
  f.render({ partnerUser: { userId: "partner-2", displayName: "Other" } })
  assert.deepEqual(f.store().bubbles, [])
  assert.deepEqual(Object.keys(f.store().avatars).sort(), ["local", "partner-2"])
  assert.equal(f.timers.size, 0, "reset clears bubble and speech-motion timers")
})

test("unmount clears the bubble and speech-motion timers", () => {
  const f = mount()
  f.render().sayPhrase("partner", "Hello")
  assert.equal(f.timers.size, 2)
  f.runtime.unmount()
  assert.equal(f.timers.size, 0)
})

test("speech uses the current bubble lifetime", () => {
  const f = mount()
  f.render()
  f.render({ bubbleLifetimeMs: 9000 } as Partial<StoreInput>)
  f.store().sayPhrase("partner", "Hello")
  const [bubble] = f.store().bubbles
  assert.equal(bubble.expiresAt - bubble.createdAt, 9000)
})

test("the queued next bubble shows after the active one expires", () => {
  const f = mount()
  f.render()
  f.store().sayPhrase("partner", "First")
  f.store().sayPhrase("local", "Second")
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["First"])
  const expiry = [...f.timers.entries()].find(([, timer]) => timer.delay > 1200)
  assert.ok(expiry)
  f.timers.delete(expiry[0])
  expiry[1].run()
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["Second"])
})
