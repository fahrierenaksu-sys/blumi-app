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
  const cancelledDrivers: unknown[] = []
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
          createMiniRoomSegmentAnimator: (position: unknown) => ({ animate: () => undefined, cancel: () => { cancelledDrivers.push(position) } }),
          readMiniRoomAvatarPosition: (position: { x: { value: number }; y: { value: number } }) =>
            ({ x: position.x.value, y: position.y.value }),
          snapMiniRoomAvatarPosition: (position: { x: { value: number }; y: { value: number } }, point: { x: number; y: number }) => {
            position.x.value = point.x
            position.y.value = point.y
          }
        }
      },
      real: [
        "./miniRoomInitialAvatars",
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
  return { runtime, timers, render, store, cancelledDrivers }
}

test("both avatars walk concurrently; retargeting one cancels only its own UI-thread driver", () => {
  const f = mount()
  f.render()
  assert.equal(f.store().moveLocalAvatar({ x: .35, y: .70 }), true)
  f.store().applyRemoteAvatar({ userId: "partner", x: .65, y: .72, present: true, revision: 1 })
  assert.equal(f.store().avatars.local.motion, "walking")
  assert.equal(f.store().avatars.partner.motion, "walking")
  assert.equal(f.cancelledDrivers.length, 0, "remote walk does not cancel local walk")
  assert.equal(f.store().moveLocalAvatar({ x: .40, y: .70 }), true)
  assert.deepEqual(f.cancelledDrivers, [f.store().avatarPositions.local])
  assert.equal(f.store().avatars.partner.motion, "walking")
  f.runtime.unmount()
  assert.ok(f.cancelledDrivers.includes(f.store().avatarPositions.partner), "unmount cancels the remote animator too")
})

test("participant reset cancels both walking drivers before creating the new scene", () => {
  const f = mount()
  f.render()
  assert.equal(f.store().moveLocalAvatar({ x: .35, y: .70 }), true)
  f.store().applyRemoteAvatar({ userId: "partner", x: .65, y: .72, present: true, revision: 1 })
  const previous = f.store().avatarPositions
  f.render({ partnerUser: { userId: "partner-2", displayName: "Other" } })
  assert.deepEqual(f.cancelledDrivers, [previous.local, previous.partner])
  assert.deepEqual(Object.keys(f.store().avatars).sort(), ["local", "partner-2"])
  assert.equal(f.store().avatars.local.motion, "idle")
  assert.equal(f.store().avatars["partner-2"].motion, "idle")
  f.runtime.unmount()
})

test("a partner step this phone cannot plan around its own avatar still moves the partner", () => {
  const f = mount()
  f.render()
  // This phone's avatar takes the sofa first; the partner's phone sent its own
  // step to the same seat before it saw that. The partner must not stay behind.
  assert.equal(f.store().moveLocalAvatarToHotspot("sofa_corner"), true)
  const before = { x: f.store().avatars.partner.x, y: f.store().avatars.partner.y }
  f.store().applyRemoteAvatar({ userId: "partner", x: .2, y: .58, present: true, revision: 2, hotspotId: "sofa_corner" })
  const partner = f.store().avatars.partner
  const moved = partner.motion === "walking" || partner.x !== before.x || partner.y !== before.y
  assert.ok(moved, "the partner walks or is placed at its authoritative target")
  f.runtime.unmount()
})

test("snapping onto a seat shows the avatar seated there, as on the sender's phone", () => {
  const f = mount()
  f.render()
  f.store().applyRemoteAvatar({ userId: "partner", x: .2, y: .58, present: true, revision: 1, hotspotId: "sofa_corner" }, true)
  const partner = f.store().avatars.partner
  assert.equal(partner.motion, "sitting")
  assert.equal(partner.seatedHotspotId, "sofa_corner")
  assert.deepEqual({ x: partner.x, y: partner.y }, { x: .2, y: .58 })
  assert.deepEqual(f.store().avatarPositions.partner, { x: { value: .2 }, y: { value: .58 } })
  f.runtime.unmount()
})

test("the scene epoch advances when the scene is rebuilt, never on a plain re-render", () => {
  const f = mount()
  f.render()
  const first = f.store().sceneEpoch
  f.render()
  assert.equal(f.store().sceneEpoch, first)
  f.render({ partnerUser: { userId: "partner-2", displayName: "Other" } })
  assert.notEqual(f.store().sceneEpoch, first)
  f.runtime.unmount()
})

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

test("a burst shows the newest bubble immediately without accumulating timers", () => {
  const f = mount()
  f.render()
  f.store().sayPhrase("partner", "First")
  f.store().sayPhrase("local", "Second")
  const firstId = f.store().bubbles[0].id
  f.store().sayPhrase("partner", "Third")
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["Third"])
  assert.equal(f.timers.size, 2)
  f.store().dismissSpeechBubble(firstId)
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["Third"])
  f.runtime.unmount()
  assert.equal(f.timers.size, 0)
})

test("a replaced speaker leaves speaking state and the new speaker starts immediately", () => {
  const f = mount()
  f.render()
  f.store().sayPhrase("partner", "First")
  f.store().sayPhrase("local", "Second")
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["Second"])
  assert.equal(f.store().avatars.partner.motion, "idle")
  assert.equal(f.store().avatars.local.motion, "speaking")
  f.runtime.unmount()
})
