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
  const clock = { now: 1_000 }
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
        "./miniRoomSpeechStack",
        "./miniRoomSeatRefusalModel"
      ],
      globals: {
        setTimeout: (run: () => void, delay: number) => {
          timerId += 1
          timers.set(timerId, { run, delay })
          return timerId
        },
        clearTimeout: (id: number) => { timers.delete(id) },
        Date: { now: () => clock.now }
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
  return { runtime, timers, render, store, cancelledDrivers, clock }
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

test("a partner step ends exactly at its authoritative target, even inside this phone's avatar's personal space", () => {
  const f = mount()
  f.render()
  // This phone's avatar stands at .40/.70. The partner's phone accepted a
  // target right beside it; re-resolving that target against this phone's
  // occupants would leave the two phones showing the partner in different places.
  assert.equal(f.store().moveLocalAvatar({ x: .40, y: .70 }), true)
  f.store().applyRemoteAvatar({ userId: "partner", x: .44, y: .71, present: true, revision: 1 })
  const partner = f.store().avatars.partner
  assert.deepEqual({ x: partner.targetX, y: partner.targetY }, { x: .44, y: .71 })
  f.runtime.unmount()
})

test("a partner step never calls the local move sender, and an own-avatar correction is not re-sent", () => {
  const sent: unknown[] = []
  const f = mount()
  f.render({ onLocalMove: (point: unknown, hotspotId?: string) => { sent.push([point, hotspotId]); return true } } as Partial<StoreInput>)
  f.store().applyRemoteAvatar({ userId: "partner", x: .6, y: .72, present: true, revision: 1 })
  f.store().applyRemoteAvatar({ userId: "local", x: .45, y: .72, present: true, revision: 2 })
  assert.deepEqual(sent, [])
  assert.equal(f.store().avatars.local.motion, "walking")
  f.runtime.unmount()
})

test("a refused seat claim walks the avatar beside the seat, standing and facing it, on both phones", () => {
  const f = mount()
  f.render()
  // The partner's claim on the sofa was refused by the server.
  f.store().applyRemoteAvatar({ userId: "partner", x: .2, y: .58, present: true, revision: 2, deniedHotspotId: "sofa_corner" })
  const walking = f.store().avatars.partner
  assert.equal(walking.motion, "walking")
  assert.notEqual(walking.seatedHotspotId, "sofa_corner")
  // Beside the seat's approach point (.24/.62), out of the sitter's lane.
  assert.ok(Math.abs(Math.hypot(walking.targetX! - .24, walking.targetY! - .62) - .128) < .001)
  // A rejoin snapshot places it at the same stand point, never on the seat.
  f.store().applyRemoteAvatar({ userId: "partner", x: .2, y: .58, present: true, revision: 2, deniedHotspotId: "sofa_corner" }, true)
  const placed = f.store().avatars.partner
  assert.equal(placed.motion, "idle")
  assert.equal(placed.seatedHotspotId, undefined)
  assert.deepEqual({ x: placed.x, y: placed.y }, { x: walking.targetX, y: walking.targetY })
  f.runtime.unmount()
})

test("tapping a seat the partner already holds is refused locally and reported as taken", () => {
  const taken: string[] = []
  const f = mount()
  f.render({ onSeatTaken: (hotspotId: string) => { taken.push(hotspotId) } } as Partial<StoreInput>)
  f.store().applyRemoteAvatar({ userId: "partner", x: .24, y: .62, present: true, revision: 1, hotspotId: "sofa_corner" }, true)
  assert.equal(f.store().moveLocalAvatarToHotspot("sofa_corner"), false)
  assert.deepEqual(taken, ["sofa_corner"])
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

/** Fires the one pending bubble-expiry timer (the one armed with the bubble lifetime or less). */
function fireBubbleTimer(f: ReturnType<typeof mount>, at: number) {
  f.clock.now = at
  const pending = [...f.timers.entries()].filter(([, timer]) => timer.delay !== 1200)
  assert.equal(pending.length, 1, "one timer serves every bubble")
  const [id, timer] = pending[0]!
  f.timers.delete(id)
  timer.run()
}

test("a second line before the first ends stacks under it, and each leaves on its own timer", () => {
  const f = mount()
  f.render()
  f.clock.now = 10_000
  f.store().sayPhrase("partner", "First")
  f.clock.now = 11_500
  f.store().sayPhrase("partner", "Second")
  // Oldest first: drawn top to bottom, so the newest sits next to the chibi.
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["First", "Second"])
  assert.deepEqual(f.store().bubbles.map(({ expiresAt }) => expiresAt), [14_000, 15_500])
  const second = f.store().bubbles[1]

  fireBubbleTimer(f, 14_000)
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["Second"])
  assert.equal(f.store().bubbles[0], second, "the line that stays keeps its identity (no replayed pop)")
  fireBubbleTimer(f, 15_500)
  assert.deepEqual(f.store().bubbles, [])
  assert.equal([...f.timers.values()].filter(({ delay }) => delay !== 1200).length, 0)
  f.runtime.unmount()
  assert.equal(f.timers.size, 0)
})

test("both partners speaking at the same moment keep both bubbles and both speak", () => {
  const f = mount()
  f.render()
  f.store().sayPhrase("local", "Mine")
  f.store().sayPhrase("partner", "Theirs")
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["Mine", "Theirs"])
  assert.equal(f.store().avatars.local.motion, "speaking")
  assert.equal(f.store().avatars.partner.motion, "speaking")
  // Bubble expiry plus one speech-motion timer per speaker: nothing accumulates.
  assert.equal(f.timers.size, 3)
  f.store().sayPhrase("partner", "Again")
  assert.equal(f.timers.size, 3)

  const mine = f.store().bubbles[0]!
  f.store().dismissSpeechBubble(mine.id)
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["Theirs", "Again"])
  assert.equal(f.store().avatars.local.motion, "idle", "a speaker whose last line left stops speaking")
  f.store().dismissSpeechBubble(mine.id)
  assert.deepEqual(f.store().bubbles.map(({ body }) => body), ["Theirs", "Again"], "a stale dismiss is ignored")
  f.runtime.unmount()
  assert.equal(f.timers.size, 0)
})
