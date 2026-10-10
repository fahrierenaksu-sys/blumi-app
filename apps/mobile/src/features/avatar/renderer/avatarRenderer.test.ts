import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import {
  compileAvatar,
  compileView,
  PALETTE_STRIDE,
  poseVariant,
  VARIANT_SIT,
  VARIANT_STAND,
  VARIANT_WALK0,
  walkFrameIndex,
  writeAvatarClipTransform,
  writeAvatarPalette,
  type PoseInput
} from "./avatar25Pose"
import { avatar25TravelFacing, resolveAvatarDraw, scaleAvatarMovementTiming } from "../model/resolveAvatarDraw"
import { seatedCardStrips, seatedShinBandRows } from "./avatar25SeatedLegs"
import { ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING, timeRoomWorldMovementSegments } from "../../roomWorld/roomWorldRuntime"
import type { Rig25 } from "./rigTypes"

const rig = JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/girl/rig25.json"), "utf8")) as Rig25
const maleRig = JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/boy/rig25.json"), "utf8")) as Rig25
const RIGS = { female: rig, male: maleRig }

const stand: PoseInput = { pose: "stand", time: 0, walkCycles: 0, walkWeight: 0, waveTime: 0, reduceMotion: true }

function skinPoint(palette: Float32Array, slot: number, x: number, y: number) {
  const o = slot * PALETTE_STRIDE
  return [palette[o] * x + palette[o + 1] * y + palette[o + 2], palette[o + 4] * x + palette[o + 5] * y + palette[o + 6]]
}

test("left/right are one drawing mirrored, back is the back drawing", () => {
  const at = (direction: "front" | "left" | "right" | "back") =>
    resolveAvatarDraw(RIGS, { loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, state: "idle", direction })
  assert.equal(at("right")?.view, at("left")?.view)
  assert.notEqual(at("right")?.mirror, at("left")?.mirror)
  assert.equal(at("back")?.view, "back")
  // the mirrored transform is the unmirrored one flipped about the anchor
  const view = compileView("front", rig.views.front)
  const a = new Float32Array(4), b = new Float32Array(4)
  const placement = { anchorX: 0.4, anchorY: 0.8, heightPx: 300 }
  writeAvatarClipTransform(view, "stand", { ...placement, mirror: false }, 400, 600, a)
  writeAvatarClipTransform(view, "stand", { ...placement, mirror: true }, 400, 600, b)
  assert.equal(b[0], -a[0])
  assert.deepEqual([b[1], b[2], b[3]], [a[1], a[2], a[3]])
})

test("at rest every bone maps its own head to itself (bind pose is exact)", () => {
  const view = compileView("front", rig.views.front)
  const palette = new Float32Array(view.slotCount * PALETTE_STRIDE)
  writeAvatarPalette(view, stand, palette)
  for (let i = 0; i < view.boneCount; i++) {
    const [x, y] = skinPoint(palette, i, view.head[i * 2], view.head[i * 2 + 1])
    assert.ok(Math.abs(x - view.head[i * 2]) < 1e-3 && Math.abs(y - view.head[i * 2 + 1]) < 1e-3, view.boneCount + " " + i)
  }
})

test("walking follows distance, one stride per cycle: the same distance always gives the same pose", () => {
  for (const name of ["front", "back"] as const) {
    const view = compileView(name, rig.views[name])
    assert.ok(view.walk.strideLen > 0)
    const pose = (cycles: number) => {
      const palette = new Float32Array(view.slotCount * PALETTE_STRIDE)
      writeAvatarPalette(view, { ...stand, pose: "walk", walkCycles: cycles, walkWeight: 1 }, palette)
      return Array.from(palette)
    }
    const close = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-3)
    // periodic: a whole stride later the legs are in the same pose (no drift, so planted feet do not slide)
    for (const c of [0.1, 0.33, 0.72]) assert.ok(close(pose(c), pose(c + 1)), `${name} ${c}`)
    // and the pose really changes within a stride (the legs step)
    assert.ok(!close(pose(0.1), pose(0.35)))
    if (view.walk.n > 0) {
      let wraps = 0
      const seen: number[] = []
      for (let k = 0; k < 64; k++) seen.push(walkFrameIndex(view, k / 64))
      for (let k = 1; k < seen.length; k++) if (seen[k] < seen[k - 1]) wraps++
      assert.ok(wraps <= 1, name)
    }
  }
})

test("the 2.5D walk timing is slower by the lab's speed ratio", () => {
  const base = { durationPerDistanceMs: 1800, maxWalkDurationMs: 1800, minWalkDurationMs: 320, rampDistance: 0.04 }
  const t = scaleAvatarMovementTiming(base, rig.motion)
  const slow = rig.motion.baseWalkSpeed / rig.motion.walkSpeed
  assert.ok(slow > 1)
  assert.equal(t.durationPerDistanceMs, base.durationPerDistanceMs * slow)
  assert.equal(t.maxWalkDurationMs, base.maxWalkDurationMs * slow)
})

test("a short 2.5D walk moves at the same average speed as a long one (fixed short ease, no minimum length)", () => {
  const timing = scaleAvatarMovementTiming(ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING, rig.motion)
  const averageSpeed = (distance: number) => {
    const [segment] = timeRoomWorldMovementSegments([{ distance } as never], timing)
    return distance / segment!.durationMs
  }
  const tile = 0.1
  const short = averageSpeed(tile)
  const long = averageSpeed(8 * tile)
  assert.ok(short >= 0.8 * long, `short ${short} vs long ${long}`)
  // the whole ease is a short fixed time, not a share of the distance
  const [hop] = timeRoomWorldMovementSegments([{ distance: tile } as never], timing)
  assert.ok((hop!.rampIn ?? 0) * hop!.durationMs <= 250)
})

test("seated, the anchor is the seat point above the painted soles, so the card's seat lands on the seat", () => {
  for (const name of ["front", "back"] as const) {
    const v = rig.views[name]
    const view = compileView(name, v)
    assert.deepEqual(view.seat, [v.sit.seat[0] - v.ground[0], -(v.sit.feet[1] - v.ground[1])])
    const out = new Float32Array(4)
    writeAvatarClipTransform(view, "sit", { mirror: false, anchorX: 0.5, anchorY: 0.9, heightPx: 300 }, 300, 300, out)
    // the seat point (bill px) lands on the anchor's x, at the seat height above the anchor line
    const seatBill = [v.sit.seat[0] - v.ground[0], -(v.sit.seat[1] - v.ground[1])]
    const clipX = seatBill[0] * out[0] + out[2]
    assert.ok(Math.abs(clipX - 0) < 1e-6)
    const clipFeet = view.seat[1] * out[1] + out[3]
    assert.ok(Math.abs(clipFeet - (1 - 2 * 0.9)) < 1e-6)
  }
})

test("one indexed draw per pose shows the body and every worn item, each walk frame its own lower body", () => {
  const items = ["shoes_mint_ribbon_court_sneakers", "bottom_coral_wave_pants", "top_coral_wave_polo", "hair_ink_pageboy_star"]
  const compiled = compileAvatar(rig, "front", items)
  const v = rig.views.front
  const pageOf = (vertex: number) => new Uint8Array(compiled.vertexData)[vertex * 32 + 24]
  const pagesIn = (variant: number) => {
    const [start, count] = [compiled.variants[variant * 2], compiled.variants[variant * 2 + 1]]
    return new Set(Array.from(compiled.indexData.subarray(start, start + count), pageOf))
  }
  const itemPages = new Set(items.map((id) => v.items[id].page))
  for (const variant of [VARIANT_STAND, VARIANT_SIT, VARIANT_WALK0]) {
    assert.ok(compiled.variants[variant * 2 + 1] > 0)
    for (const page of [0, ...itemPages]) assert.ok(pagesIn(variant).has(page), `variant ${variant} page ${page}`)
  }
  const range = (k: number) => Array.from(compiled.indexData.subarray(compiled.variants[k * 2], compiled.variants[k * 2] + compiled.variants[k * 2 + 1]))
  if (v.walk.frames.length > 1) {
    // consecutive painted walk frames draw different lower bodies
    assert.notDeepEqual(range(VARIANT_WALK0), range(VARIANT_WALK0 + 1))
  } else if (v.motion) {
    // retargeted walk: the standing drawing walks, legs and every worn piece on them included (both leg orders;
    // avatar25Motion.test.ts covers the order and the crotch re-weighting)
    // the legs drawn standing (the bare legs, or the leg drawings for what is worn) also walk
    const legVertices = new Set<number>()
    const meshes = [v.mesh, ...items.map((id) => v.items[id].mesh)]
    let offset = 0
    for (const mesh of meshes) {
      for (const r of mesh.ranges) {
        if (r.name !== "farLeg" && r.name !== "nearLeg" && r.legVariant === undefined) continue
        for (let i = r.start; i < r.start + r.count; i++) legVertices.add(mesh.index[i] + offset)
      }
      offset += mesh.pos.length / 2
    }
    const standLegs = range(VARIANT_STAND).filter((i) => legVertices.has(i))
    assert.ok(standLegs.length > 0)
    for (const walk of [VARIANT_WALK0, VARIANT_WALK0 + 1]) {
      const drawn = new Set(range(walk))
      assert.ok(standLegs.every((i) => drawn.has(i)), `walk ${walk}`)
      for (const page of itemPages) assert.ok(pagesIn(walk).has(page), `walk ${walk} page ${page}`)
    }
  } else {
    // no painted walk: the skinned standing legs (and the worn trousers and shoes on them) walk
    assert.deepEqual(range(VARIANT_WALK0), range(VARIANT_STAND))
    assert.equal(poseVariant("walk", -1), VARIANT_WALK0)
  }
})

test("seated, the folded forearm layers are clipped just under the elbow; standing, nothing is clipped", () => {
  const folded = JSON.parse(JSON.stringify(rig.views.front)) as Rig25["views"]["front"]
  folded.sit.fold = ["near"]
  const view = compileView("front", folded)
  const palette = new Float32Array(view.slotCount * PALETTE_STRIDE)
  const clip = new Float32Array(2)
  writeAvatarPalette(view, { ...stand, pose: "sit" }, palette, clip)
  for (const sd of view.sides) {
    const k = sd.name === "near" ? 0 : 1
    if (folded.sit.fold.includes(sd.name)) {
      const [, elbowY] = skinPoint(palette, sd.fa, view.head[sd.fa * 2], view.head[sd.fa * 2 + 1])
      assert.ok(Math.abs(clip[k] - (elbowY - 0.012 * view.height)) < 1e-3)
    } else assert.ok(clip[k] < -1e8)
  }
  writeAvatarPalette(view, stand, palette, clip)
  assert.ok(clip[0] < -1e8 && clip[1] < -1e8)
})

test("seated with the drawing's own arms, the standing arms and their sleeves are not drawn", () => {
  const v = rig.views.front
  if (!v.sit.cardArms.length) return
  const compiled = compileAvatar(rig, "front", ["top_coral_wave_polo"])
  const arm = (vertex: number) => new Uint8Array(compiled.vertexData)[vertex * 32 + 25]
  const [start, count] = [compiled.variants[VARIANT_SIT * 2], compiled.variants[VARIANT_SIT * 2 + 1]]
  const armsSeated = new Set(Array.from(compiled.indexData.subarray(start, start + count), arm))
  for (const side of v.sit.cardArms) assert.ok(!armsSeated.has(side === "near" ? 1 : 2), side)
})

test("walking, she faces the screen quadrant she moves toward (the four drawn diagonals)", () => {
  // screen px, y down. front drawing faces down-left, back drawing faces up-right; mirrors give the other two
  assert.deepEqual(avatar25TravelFacing(-30, 20), { view: 0, mirror: false }) // down-left
  assert.deepEqual(avatar25TravelFacing(30, 20), { view: 0, mirror: true }) // down-right (the owner's bug: was down-left)
  assert.deepEqual(avatar25TravelFacing(30, -20), { view: 1, mirror: false }) // up-right
  assert.deepEqual(avatar25TravelFacing(-30, -20), { view: 1, mirror: true }) // up-left
  // a steep down-right move on a wide stage still faces down-right, and a sideways move faces the camera
  assert.deepEqual(avatar25TravelFacing(5, 40), { view: 0, mirror: true })
  assert.deepEqual(avatar25TravelFacing(40, 0), { view: 0, mirror: true })
  assert.deepEqual(avatar25TravelFacing(-40, 0.5), { view: 0, mirror: false })
  // too small to tell: keep the current facing
  assert.equal(avatar25TravelFacing(0.1, 0.2).view, -1)
})

test("both rigs' seated cards can be cut at their shin band, so the seated soles reach the floor for both", () => {
  for (const [name, r] of Object.entries(RIGS)) {
    for (const [viewName, view] of Object.entries(r.views)) {
      const band = seatedShinBandRows(view)
      const meshes = [view.mesh, ...Object.values(view.items).map((item) => item.mesh)]
      for (const mesh of meshes) {
        if (!mesh.ranges.some((range) => range.name === "sit")) continue
        assert.ok(seatedCardStrips(mesh, band, 0, 1), `${name} ${viewName}`)
      }
      assert.ok(view.sit.feet[1] > view.sit.seat[1], `${name} ${viewName}: soles below the hip`)
    }
  }
})

