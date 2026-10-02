import assert from "node:assert/strict"
import test from "node:test"
import type { MiniRoomAvatarMotion } from "@blumi/contracts"
import {
  INITIAL_MINI_ROOM_MOTION_PRESENTATION_CURSOR,
  planMiniRoomMotionPresentation
} from "./miniRoomMotionPresentationModel"

const avatar = (userId: string, patch: Partial<MiniRoomAvatarMotion> = {}): MiniRoomAvatarMotion =>
  ({ userId, x: userId === "local" ? .38 : .62, y: .76, present: true, revision: 1, ...patch })

function present(steps: { avatars: MiniRoomAvatarMotion[]; snapKey: number; sceneEpoch: number }[]) {
  let cursor = INITIAL_MINI_ROOM_MOTION_PRESENTATION_CURSOR
  return steps.map((step) => {
    const plan = planMiniRoomMotionPresentation(cursor, { ...step, localUserId: "local" })
    cursor = plan.cursor
    return plan.apply.map(({ avatar: value, snap }) => `${snap ? "snap" : "walk"} ${value.userId} ${value.x}`)
  })
}

test("a join snapshot places both avatars, then only newer partner steps walk", () => {
  assert.deepEqual(present([
    { avatars: [avatar("local"), avatar("partner")], snapKey: 1, sceneEpoch: 1 },
    // One rendered state after a burst: the partner's step and this phone's echo.
    { avatars: [avatar("local", { x: .45, revision: 2 }), avatar("partner", { x: .6, revision: 2 })], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local", { x: .45, revision: 2 }), avatar("partner", { x: .6, revision: 2 })], snapKey: 1, sceneEpoch: 1 }
  ]), [
    ["snap local 0.38", "snap partner 0.62"],
    ["walk partner 0.6"],
    []
  ])
})

test("a rebuilt scene or a new join snapshot re-places both avatars at the latest records", () => {
  assert.deepEqual(present([
    { avatars: [avatar("local"), avatar("partner")], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local", { x: .45, revision: 2 }), avatar("partner", { x: .6, revision: 2 })], snapKey: 1, sceneEpoch: 2 },
    { avatars: [avatar("local", { x: .5, revision: 9 }), avatar("partner", { x: .7, revision: 9 })], snapKey: 2, sceneEpoch: 2 }
  ]), [
    ["snap local 0.38", "snap partner 0.62"],
    ["snap local 0.45", "snap partner 0.6"],
    ["snap local 0.5", "snap partner 0.7"]
  ])
})

test("a presence flap at the same target does not restart the partner's walk; a return after absence does", () => {
  assert.deepEqual(present([
    { avatars: [avatar("local"), avatar("partner", { x: .6, hotspotId: "chair:seat" })], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local"), avatar("partner", { x: .6, hotspotId: "chair:seat", revision: 2 })], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local"), avatar("partner", { x: .6, hotspotId: "chair:seat", present: false, revision: 3 })], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local"), avatar("partner", { x: .6, hotspotId: "chair:seat", revision: 4 })], snapKey: 1, sceneEpoch: 1 }
  ]), [
    ["snap local 0.38", "snap partner 0.6"],
    [],
    ["walk partner 0.6"],
    ["walk partner 0.6"]
  ])
})

function arrivals(steps: { avatars: MiniRoomAvatarMotion[]; snapKey: number; sceneEpoch: number }[]) {
  let cursor = INITIAL_MINI_ROOM_MOTION_PRESENTATION_CURSOR
  return steps.map((step) => {
    const plan = planMiniRoomMotionPresentation(cursor, { ...step, localUserId: "local" })
    cursor = plan.cursor
    return plan.apply.filter(({ arrival }) => arrival).map(({ avatar: value }) => value.userId)
  })
}

test("a partner who comes in after this phone arrives once; one already inside does not", () => {
  const away = avatar("partner", { present: false })
  assert.deepEqual(arrivals([
    { avatars: [avatar("local"), away], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local"), avatar("partner", { revision: 2 })], snapKey: 1, sceneEpoch: 1 },
    // Backgrounded and back: a presence flap, not a new entrance.
    { avatars: [avatar("local"), avatar("partner", { present: false, revision: 3 })], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local"), avatar("partner", { revision: 4 })], snapKey: 1, sceneEpoch: 1 },
    // This phone joins again: the partner it already saw is placed, not walked in again.
    { avatars: [avatar("local", { revision: 5 }), avatar("partner", { present: false, revision: 5 })], snapKey: 2, sceneEpoch: 1 },
    { avatars: [avatar("local", { revision: 5 }), avatar("partner", { revision: 6 })], snapKey: 2, sceneEpoch: 1 }
  ]), [[], ["partner"], [], [], [], []])
  assert.deepEqual(arrivals([
    { avatars: [avatar("local"), avatar("partner")], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local"), avatar("partner", { x: .5, revision: 2 })], snapKey: 1, sceneEpoch: 1 }
  ]), [[], []], "already in the room when this phone joined")
  assert.deepEqual(arrivals([
    { avatars: [avatar("local"), away], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local"), avatar("partner", { revision: 2 })], snapKey: 1, sceneEpoch: 1 },
    // A new partner rebuilds the scene: their own first entrance plays.
    { avatars: [avatar("local"), avatar("partner", { present: false, revision: 3 })], snapKey: 1, sceneEpoch: 2 },
    { avatars: [avatar("local"), avatar("partner", { revision: 4 })], snapKey: 1, sceneEpoch: 2 }
  ]), [[], ["partner"], [], ["partner"]])
})

test("leaving the scene clears nothing on screen and the next join snaps again", () => {
  assert.deepEqual(present([
    { avatars: [avatar("local"), avatar("partner")], snapKey: 1, sceneEpoch: 1 },
    { avatars: [], snapKey: 1, sceneEpoch: 1 },
    { avatars: [avatar("local", { revision: 3 }), avatar("partner", { revision: 3 })], snapKey: 2, sceneEpoch: 1 }
  ]), [
    ["snap local 0.38", "snap partner 0.62"],
    [],
    ["snap local 0.38", "snap partner 0.62"]
  ])
})
