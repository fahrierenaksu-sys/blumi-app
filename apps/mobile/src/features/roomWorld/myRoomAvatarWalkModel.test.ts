import assert from "node:assert/strict"
import test from "node:test"
import {
  advanceRoomAvatarStridePhase,
  getRoomAvatarStrideFrameIndex,
  getRoomAvatarStrideGain,
  getRoomAvatarStridePhaseDelta,
  getRoomAvatarWalkPathPx,
  ROOM_AVATAR_STRIDE_STEP_PHASE
} from "../roomV2/components/roomAvatarBodyMotionModel"
import type { RoomV2RenderItem } from "../roomV2/roomV2.types"
import { insertRoomV2RenderItemSorted } from "../roomV2/roomV2Selectors"
import {
  createMyRoomAvatarDepthNeighbours,
  createMyRoomWalkTimeline,
  getMyRoomAvatarDepthIndex,
  getMyRoomWalkPoint
} from "./myRoomAvatarWalkModel"
import { MY_ROOM_AVATAR_SIZE } from "./myRoomInteractionModel"
import type { RoomWorldGeometry, RoomWorldPoint } from "./roomWorldGeometry"
import {
  createRoomWorldMovementPlan,
  easeRoomWorldMovement,
  getRoomWorldMovementFrame,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING,
  type RoomWorldMovementPlan
} from "./roomWorldRuntime"

function renderItem(renderId: string, layer: RoomV2RenderItem["layer"], depth: number): RoomV2RenderItem {
  return { renderId, layer, depth, kind: "furniture" } as unknown as RoomV2RenderItem
}

const plan: RoomWorldMovementPlan = {
  target: { x: 0.6, y: 0.7 },
  path: [],
  segments: [
    { from: { x: 0.4, y: 0.5 }, to: { x: 0.5, y: 0.6 }, facing: "right", distance: 0.14, durationMs: 324, isFinal: false, rampIn: 0.444, rampOut: 0 },
    { from: { x: 0.5, y: 0.6 }, to: { x: 0.6, y: 0.7 }, facing: "front", distance: 0.14, durationMs: 324, isFinal: true, rampIn: 0, rampOut: 0.444 }
  ]
}

test("the UI-thread walk timeline keeps every segment's target, duration and ramps", () => {
  assert.deepEqual(createMyRoomWalkTimeline(plan), [
    { x: 0.5, y: 0.6, durationMs: 324, rampIn: 0.444, rampOut: 0 },
    { x: 0.6, y: 0.7, durationMs: 324, rampIn: 0, rampOut: 0.444 }
  ])
})

test("the UI-thread walk uses the same constant-speed curve as the JS movement frame", () => {
  const [step] = createMyRoomWalkTimeline(plan)
  const segment = plan.segments[0]!
  for (const elapsed of [0, 60, 210, 333, 324]) {
    const frame = getRoomWorldMovementFrame({ segment, startedAt: 0, now: elapsed })
    const progress = easeRoomWorldMovement(Math.min(1, elapsed / step!.durationMs), step!.rampIn, step!.rampOut)
    assert.ok(Math.abs(frame.x - (segment.from.x + (segment.to.x - segment.from.x) * progress)) < 1e-12)
    assert.ok(Math.abs(frame.y - (segment.from.y + (segment.to.y - segment.from.y) * progress)) < 1e-12)
  }
})

test("the UI-thread depth index matches the React render sort at every depth", () => {
  const items = [
    renderItem("rug", "floor", 0.6),
    renderItem("lamp", "furniture", 0.42),
    renderItem("bed", "furniture", 0.55),
    renderItem("a_chair", "furniture", 0.7),
    renderItem("zz_table", "furniture", 0.7),
    renderItem("plant", "furniture", 0.81),
    renderItem("curtain", "foreground", 0.1)
  ]
  const avatarRenderId = "my_room_owner_avatar"
  const neighbours = createMyRoomAvatarDepthNeighbours(items, { layer: "furniture", renderId: avatarRenderId })
  for (const depth of [0, 0.2, 0.42, 0.5, 0.55, 0.69, 0.7, 0.75, 0.81, 0.9, 1]) {
    const sorted = insertRoomV2RenderItemSorted(items, renderItem(avatarRenderId, "furniture", depth))
    assert.equal(
      getMyRoomAvatarDepthIndex(neighbours, depth),
      sorted.findIndex((item) => item.renderId === avatarRenderId),
      `depth ${depth}`
    )
  }
})

// ── Depth by feet against the footprint's front edge (2026-10-02 report) ──

/** A coffee table whose calibrated footprint reaches 0.04 in front of its pivot. */
function coffeeTable(): RoomV2RenderItem {
  return {
    renderId: "coffee_table",
    kind: "furniture",
    layer: "furniture",
    x: 0.5,
    y: 0.7,
    depth: 0.7,
    width: 0.2,
    height: 0.14,
    anchor: { x: 0.5, y: 0.5 },
    blocksMovement: true,
    placementSurface: "floor",
    footprint: { width: 0.16, height: 0.08 },
    collisionPolygon: [{ x: 0.42, y: 0.66 }, { x: 0.58, y: 0.66 }, { x: 0.58, y: 0.74 }, { x: 0.42, y: 0.74 }]
  } as unknown as RoomV2RenderItem
}

test("an avatar beside a table is behind it until its feet pass the table's front edge", () => {
  const items = [renderItem("bookcase", "furniture", 0.5), coffeeTable(), renderItem("plant", "furniture", 0.9)]
  const neighbours = createMyRoomAvatarDepthNeighbours(items, { layer: "furniture", renderId: "my_room_owner_avatar" })
  const slot = (x: number, y: number) => getMyRoomAvatarDepthIndex(neighbours, y, x, y)
  // Beside the table, feet past its pivot but not its front edge: still behind it.
  assert.equal(slot(0.64, 0.72), 1)
  assert.equal(slot(0.36, 0.73), 1)
  // Feet in front of the front edge: drawn over the table.
  assert.equal(slot(0.64, 0.75), 2)
  assert.equal(slot(0.5, 0.76), 2)
  // Right behind it: behind.
  assert.equal(slot(0.5, 0.64), 1)
  // Depth-only items (no footprint) keep the depth rule.
  assert.equal(slot(0.2, 0.95), 3)
  // A seated avatar keeps its pinned seat depth.
  assert.equal(getMyRoomAvatarDepthIndex(neighbours, 0.7 + 0.002), 2)
})

test("My Room and MiniRoom order an avatar against furniture the same way", async () => {
  const { resolveMiniRoomDepthOrder } = await import("../miniRoom/scene/miniRoomDepthModel")
  const items = [coffeeTable()]
  const neighbours = createMyRoomAvatarDepthNeighbours(items, { layer: "furniture", renderId: "mini_room_avatar" })
  for (const [x, y] of [[0.64, 0.72], [0.64, 0.75], [0.5, 0.64], [0.5, 0.8]] as const) {
    const order = resolveMiniRoomDepthOrder(neighbours, [{ id: "me", depth: y, foot: { x, y } }])
    assert.equal(order, `me@${getMyRoomAvatarDepthIndex(neighbours, y, x, y)}`)
  }
})

test("one walk clock keeps both axes together at turns, including repeated coordinates", () => {
  const origin = { x: 0.2, y: 0.5 }
  const steps = [
    { x: 0.8, y: 0.5, durationMs: 600, rampIn: 0, rampOut: 0 },
    { x: 0.8, y: 0.8, durationMs: 300, rampIn: 0, rampOut: 0 },
    { x: 0.3, y: 0.8, durationMs: 500, rampIn: 0, rampOut: 0 }
  ]
  assert.deepEqual(getMyRoomWalkPoint(origin, steps, 1), { x: 0.8, y: 0.5 })
  assert.deepEqual(getMyRoomWalkPoint(origin, steps, 1.5), { x: 0.8, y: 0.65 })
  assert.deepEqual(getMyRoomWalkPoint(origin, steps, 2), { x: 0.8, y: 0.8 })
  assert.deepEqual(getMyRoomWalkPoint(origin, steps, 3), { x: 0.3, y: 0.8 })
  const interrupted = getMyRoomWalkPoint(origin, steps, 0.25)
  const redirected = [{ ...steps[0]!, x: 0.1, y: 0.9 }]
  assert.deepEqual(getMyRoomWalkPoint(interrupted, redirected, 0), interrupted)
  assert.deepEqual(getMyRoomWalkPoint(interrupted, [], 0), interrupted)
})

// ── Every tap walks with the walk cycle (2026-10-02 phone report) ────────
// Plays a My Room walk the way the device does: the UI-thread timeline at
// 60 fps (useMyRoomAvatarWalk) feeding the distance-locked stride of
// RoomRendererAvatarBody, and records which walk frame shows when.

const OPEN_ROOM: RoomWorldGeometry = {
  walkableAreas: [{ id: "room", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }],
  blockers: []
}
const STAGE = { width: 390, height: 420 }
const BOX_HEIGHT_PX = MY_ROOM_AVATAR_SIZE.compact.height * STAGE.height
const WALK_FRAMES = 4
const FRAME_MS = 1000 / 60

function walkProgressAt(steps: ReturnType<typeof createMyRoomWalkTimeline>, elapsedMs: number): number {
  let start = 0
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!
    if (elapsedMs < start + step.durationMs) {
      return index + easeRoomWorldMovement((elapsedMs - start) / step.durationMs, step.rampIn, step.rampOut)
    }
    start += step.durationMs
  }
  return steps.length
}

function playWalk(input: { from: RoomWorldPoint; to: RoomWorldPoint; phase: number; stopAfterMs?: number }) {
  const plan = createRoomWorldMovementPlan({
    geometry: OPEN_ROOM, from: input.from, to: input.to, timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  })
  assert.ok(plan, "the walk has a path")
  const steps = createMyRoomWalkTimeline(plan)
  const durationMs = steps.reduce((sum, step) => sum + step.durationMs, 0)
  const pathPx = getRoomAvatarWalkPathPx([input.from, ...steps], STAGE.width, STAGE.height)
  const gain = getRoomAvatarStrideGain(input.phase, pathPx, BOX_HEIGHT_PX)
  const endMs = Math.min(durationMs, input.stopAfterMs ?? Infinity)
  let phase = input.phase
  let travelled = 0
  let previous = input.from
  const shown = [getRoomAvatarStrideFrameIndex(phase, WALK_FRAMES)]
  for (let elapsed = FRAME_MS; ; elapsed += FRAME_MS) {
    const now = Math.min(elapsed, endMs)
    const point = getMyRoomWalkPoint(input.from, steps, walkProgressAt(steps, now))
    const distancePx = Math.hypot((point.x - previous.x) * STAGE.width, (point.y - previous.y) * STAGE.height)
    const delta = getRoomAvatarStridePhaseDelta(distancePx, BOX_HEIGHT_PX) * gain
    phase = advanceRoomAvatarStridePhase(phase, delta)
    travelled += delta
    shown.push(getRoomAvatarStrideFrameIndex(phase, WALK_FRAMES))
    previous = point
    if (now >= endMs) break
  }
  return {
    point: previous,
    phase,
    durationMs,
    naturalPhase: getRoomAvatarStridePhaseDelta(pathPx, BOX_HEIGHT_PX),
    travelled,
    distinctFrames: new Set(shown).size
  }
}

function assertWalkedWithSteps(walk: ReturnType<typeof playWalk>, label: string) {
  assert.ok(walk.distinctFrames >= 2, `${label}: shows ${walk.distinctFrames} walk frame(s)`)
  assert.ok(walk.travelled >= ROOM_AVATAR_STRIDE_STEP_PHASE - 1e-9, `${label}: took ${walk.travelled} of a cycle`)
  const offPlant = walk.phase % ROOM_AVATAR_STRIDE_STEP_PHASE
  assert.ok(Math.min(offPlant, ROOM_AVATAR_STRIDE_STEP_PHASE - offPlant) < 1e-6, `${label}: ends mid-step at ${walk.phase}`)
}

test("a tap right beside the avatar walks a whole step at a readable pace, in any direction", () => {
  const at = { x: 0.5, y: 0.7 }
  for (const [label, to] of [
    ["sideways right", { x: 0.53, y: 0.7 }],
    ["sideways left", { x: 0.48, y: 0.7 }],
    ["toward the back", { x: 0.5, y: 0.67 }],
    ["a hair away", { x: 0.514, y: 0.7 }]
  ] as const) {
    const walk = playWalk({ from: at, to, phase: 0 })
    assert.ok(walk.durationMs >= 240, `${label}: lasts ${walk.durationMs} ms`)
    assertWalkedWithSteps(walk, label)
    assert.ok(Math.abs(walk.point.x - to.x) < 1e-9 && Math.abs(walk.point.y - to.y) < 1e-9, `${label}: arrives`)
  }
})

test("a long walk keeps the distance-locked cadence and lands on a planted foot", () => {
  const walk = playWalk({ from: { x: 0.15, y: 0.75 }, to: { x: 0.8, y: 0.6 }, phase: 0 })
  assertWalkedWithSteps(walk, "long")
  assert.ok(walk.distinctFrames === WALK_FRAMES, "every walk frame shows")
  assert.ok(Math.abs(walk.travelled - walk.naturalPhase) <= ROOM_AVATAR_STRIDE_STEP_PHASE / 2 + 1e-9)
})

test("retargeting mid-walk, even right beside the avatar, keeps stepping from the current stride", () => {
  const first = playWalk({ from: { x: 0.2, y: 0.7 }, to: { x: 0.8, y: 0.7 }, phase: 0, stopAfterMs: 430 })
  assert.ok(first.phase % ROOM_AVATAR_STRIDE_STEP_PHASE > 0.01, "the first walk is interrupted mid-step")
  for (const [label, to] of [
    ["back beside it", { x: first.point.x - 0.025, y: 0.7 }],
    ["ahead beside it", { x: first.point.x + 0.025, y: 0.7 }],
    ["across the room", { x: 0.3, y: 0.55 }]
  ] as const) {
    assertWalkedWithSteps(playWalk({ from: first.point, to, phase: first.phase }), label)
  }
})

test("the stride gain is neutral without a walk", () => {
  assert.equal(getRoomAvatarStrideGain(0.3, 0, BOX_HEIGHT_PX), 1)
  assert.equal(getRoomAvatarStrideGain(0.3, 40, 0), 1)
  assert.equal(getRoomAvatarWalkPathPx([{ x: 0.5, y: 0.5 }], STAGE.width, STAGE.height), 0)
})
