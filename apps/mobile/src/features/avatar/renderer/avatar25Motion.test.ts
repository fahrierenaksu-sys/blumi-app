import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  addMotionSitBend,
  compileMotion,
  SIT_CARD_FROM,
  sitDownWeight,
  MOTION_ORDER_K,
  motionCyclesForTravel,
  motionPoseLength,
  motionStrideLength,
  sampleMotion,
  writeMotionPalette
} from "./avatar25Motion"
import {
  avatarVariant,
  compileAvatar,
  compileView,
  PALETTE_STRIDE,
  VARIANT_STAND,
  VARIANT_WALK0,
  writeAvatarClipTransform,
  writeAvatarPalette,
  type PoseInput
} from "./avatar25Pose"
import type { Rig25, Rig25View, Rig25WalkMotion } from "./rigTypes"

const bundled = JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/girl/rig25.json"), "utf8")) as Rig25

function skin(palette: Float32Array, slot: number, x: number, y: number): [number, number] {
  const o = slot * PALETTE_STRIDE
  return [palette[o] * x + palette[o + 1] * y + palette[o + 2], palette[o + 4] * x + palette[o + 5] * y + palette[o + 6]]
}

function near(a: number, b: number, eps = 1e-4) {
  return Math.abs(a - b) < eps
}

/** A tiny three-bone chain standing up from the ground point (sheet px, y down), each bone 10 px long. */
function chainView(frames: Rig25WalkMotion["frames"]): Rig25View {
  const view = JSON.parse(JSON.stringify(bundled.views.front)) as Rig25View
  view.ground = [100, 200]
  view.bones = [
    { name: "hips", head: [100, 200], tail: [100, 190], parent: -1 },
    { name: "chest", head: [100, 190], tail: [100, 180], parent: 0 },
    { name: "head", head: [100, 180], tail: [100, 170], parent: 1 }
  ]
  view.motion = { stancePx: [-300, 100], frames }
  return view
}

/** The bundled rig's views with a synthetic retargeted walk (and bone tails) when the export has none. */
function rigWithMotion(): Rig25 {
  const rig = JSON.parse(JSON.stringify(bundled)) as Rig25
  for (const view of Object.values(rig.views)) {
    if (view.motion && view.bones.every((b) => b.tail)) continue
    view.bones.forEach((b, i) => {
      const child = view.bones.find((c) => c.parent === i)
      b.tail ??= child ? child.head : [b.head[0], b.head[1] + 10]
    })
    const B = view.bones.length
    const pose = (th: number) => view.bones.flatMap((b) => [b.name.startsWith("thigh") ? th : 0, 1])
    view.motion = { stancePx: [-300, 110], frames: [
      { root: [0, 4], nearFront: true, pose: pose(0.3) },
      { root: [0, 0], nearFront: false, pose: pose(-0.3) }
    ] }
    assert.equal(view.motion.frames[0].pose.length, B * 2)
  }
  return rig
}

const walkInput: PoseInput = { pose: "walk", time: 1.3, walkCycles: 0.37, walkWeight: 1, waveTime: 0, reduceMotion: true }

test("zero motion leaves the drawing exactly at rest: every bone's palette is the identity", () => {
  const zero = (root: [number, number]) => ({ root, nearFront: true, pose: [0, 1, 0, 1, 0, 1] })
  const m = compileMotion(chainView([zero([0, 0]), zero([0, 0])]))
  assert.ok(m)
  const pose = new Float32Array(motionPoseLength(m))
  const palette = new Float32Array(3 * PALETTE_STRIDE)
  for (const cycles of [0, 0.3, 0.99, 7.5]) {
    sampleMotion(m, cycles, 1, pose)
    writeMotionPalette(m, pose, palette)
    const identity = [1, 0, 0, 0, 0, 1, 0, 0]
    for (let b = 0; b < 3; b++) assert.ok(Array.from(palette.subarray(b * 8, b * 8 + 8)).every((x, i) => near(x, identity[i], 1e-9)))
  }
  // a real walk at zero walk weight is also the rest pose
  const moving = compileMotion(chainView([
    { root: [3, 9], nearFront: false, pose: [0.4, 1.2, -0.3, 0.8, 1, 1] },
    { root: [0, 0], nearFront: true, pose: [0, 1, 0, 1, 0, 1] }
  ]))
  assert.ok(moving)
  sampleMotion(moving, 0.2, 0, pose)
  writeMotionPalette(moving, pose, palette)
  for (let b = 0; b < 3; b++) {
    const [x, y] = skin(palette, b, 12.5, -40)
    assert.ok(near(x, 12.5) && near(y, -40), `bone ${b}`)
  }
})

test("the full avatar with an all-zero walk draws every vertex where the standing drawing has it", () => {
  const rig = rigWithMotion()
  const v = rig.views.front
  v.motion = { stancePx: [-300, 110], frames: [0, 1].map(() => ({ root: [0, 0] as [number, number], nearFront: true, pose: v.bones.flatMap(() => [0, 1]) })) }
  const view = compileView("front", v)
  const palette = new Float32Array(view.slotCount * PALETTE_STRIDE)
  writeAvatarPalette(view, walkInput, palette)
  for (let b = 0; b < view.slotCount; b++) {
    const [x, y] = skin(palette, b, 37, 211)
    assert.ok(near(x, 37, 1e-3) && near(y, 211, 1e-3), `slot ${b}`)
  }
})

test("FK chains each bone from its parent's posed head: turns, stretch along the bone and the hips offset", () => {
  // sheet px, y down: +π/2 turns the upward bone (0,-10) to point right (+10, 0)
  const q = Math.PI / 2
  const m = compileMotion(chainView([
    { root: [3, 4], nearFront: true, pose: [q, 1, Math.PI, 1, Math.PI, 2] },
    { root: [3, 4], nearFront: true, pose: [q, 1, Math.PI, 1, Math.PI, 2] }
  ]))
  assert.ok(m)
  const pose = new Float32Array(motionPoseLength(m))
  const palette = new Float32Array(3 * PALETTE_STRIDE)
  sampleMotion(m, 0, 1, pose)
  writeMotionPalette(m, pose, palette)
  const bill = (sx: number, sy: number): [number, number] => [sx - 100, -(sy - 200)]
  const expectAt = (slot: number, restSheet: [number, number], posedSheet: [number, number]) => {
    const [x, y] = skin(palette, slot, ...bill(...restSheet))
    const [ex, ey] = bill(...posedSheet)
    assert.ok(near(x, ex) && near(y, ey), `slot ${slot}: got ${x},${y} want ${ex},${ey}`)
  }
  // hips head moves by the root offset (3, 4) sheet px
  expectAt(0, [100, 200], [103, 204])
  // chest head = hips' matrix on its rest head: 10 px to the right of the moved hips
  expectAt(1, [100, 190], [113, 204])
  // chest turned π (absolute): from its head, the bone points down; its tail lands 10 px below
  expectAt(1, [100, 180], [113, 214])
  // head bone: π turn and stretched ×2 along itself: its tail is 20 px below its posed head
  expectAt(2, [100, 180], [113, 214])
  expectAt(2, [100, 170], [113, 234])
})

test("sampling interpolates between key poses every frame, the short way round, and wraps the cycle", () => {
  const m = compileMotion(chainView([
    { root: [0, 0], nearFront: true, pose: [3.1, 1, 0, 1, 0, 1] },
    { root: [10, 0], nearFront: false, pose: [-3.1, 2, 0, 1, 0, 1] }
  ]))
  assert.ok(m)
  const pose = new Float32Array(motionPoseLength(m))
  sampleMotion(m, 0.25, 1, pose)
  // half way from 3.1 to -3.1 the short way passes through π, not 0
  assert.ok(near(Math.abs(pose[0]), Math.PI, 1e-3), String(pose[0]))
  assert.ok(near(pose[1], 1.5))
  assert.ok(near(pose[6], 5))
  // the cycle wraps: whole cycles later (or before) the pose is the same
  const at = (c: number) => { sampleMotion(m, c, 1, pose); return Array.from(pose) }
  for (const c of [0.1, 0.6]) {
    assert.deepEqual(at(c + 3), at(c))
    assert.ok(at(c - 2).every((x, i) => near(x, at(c)[i])))
  }
  // continuous across a key pose: a tiny step in phase never moves the drawing visibly (turns compare mod 2π)
  const palette = new Float32Array(3 * PALETTE_STRIDE)
  const drawn = (c: number) => { sampleMotion(m, c, 1, pose); writeMotionPalette(m, pose, palette); return Array.from(palette) }
  for (const c of [0.5, 1]) {
    const before = drawn(c - 1e-6), after = drawn(c + 1e-6)
    assert.ok(before.every((x, i) => near(x, after[i], 1e-3)), String(c))
  }
  // blend k scales turns toward 0 and stretch toward 1
  sampleMotion(m, 0.5, 0.5, pose)
  assert.ok(near(pose[0], -3.1 * 0.5) && near(pose[1], 1.5))
})

test("leg depth: the far leg comes in front only past the order threshold, on its key pose's flag", () => {
  const m = compileMotion(chainView([
    { root: [0, 0], nearFront: true, pose: [0, 1, 0, 1, 0, 1] },
    { root: [0, 0], nearFront: false, pose: [0, 1, 0, 1, 0, 1] }
  ]))
  assert.ok(m)
  const pose = new Float32Array(motionPoseLength(m))
  assert.equal(sampleMotion(m, 0.6, 1, pose), 0)
  assert.equal(sampleMotion(m, 0.1, 1, pose), 1)
  assert.equal(sampleMotion(m, 0.6, MOTION_ORDER_K * 0.9, pose), 1)
})

test("stride: planted feet stay still, so one cycle covers the foot's on-screen travel", () => {
  // doll25 strideLen: |stancePx|·s / |stepDir|, stepDir clamped
  assert.equal(motionStrideLength(300, 0.5, 0.6, 0.8), 150)
  assert.equal(motionStrideLength(300, 0.5, 0.3, 0.4), 300)
  assert.equal(motionStrideLength(300, 0.5, 0, 0.1), 500)
  // lab40 travel: along the foot's own line it takes |stancePx|·px per cycle; across it, half the travel counts
  const stance = { stanceLen: 200, dirX: 0.8, dirY: 0.6 }
  assert.ok(near(motionCyclesForTravel(stance, 0.8 * 100, 0.6 * 100, false, 0.5), 1))
  assert.ok(near(motionCyclesForTravel(stance, -0.6 * 50, 0.8 * 50, false, 0.5), 0.25))
  // mirrored, the foot's line flips in x
  assert.ok(near(motionCyclesForTravel(stance, -80, 60, true, 0.5), 1))
  assert.ok(motionCyclesForTravel(stance, -80, 60, false, 0.5) < 1)
})

test("with a retargeted walk the avatar has two walk draw orders and its crotch fabric follows the thighs", () => {
  const rig = rigWithMotion()
  const items = ["shoes_mint_ribbon_court_sneakers", "bottom_coral_wave_pants", "top_coral_wave_polo", "hair_ink_pageboy_star"]
  const compiled = compileAvatar(rig, "front", items)
  const view = compiled.view
  assert.ok(view.motion)
  const range = (k: number) => Array.from(compiled.indexData.subarray(compiled.variants[k * 2], compiled.variants[k * 2] + compiled.variants[k * 2 + 1]))
  const tris = (k: number) => {
    const r = range(k), out: string[] = []
    for (let i = 0; i < r.length; i += 3) out.push(r.slice(i, i + 3).join(","))
    return out
  }
  // the same triangles, drawn in another order (the far leg in front)
  assert.deepEqual([...tris(VARIANT_WALK0)].sort(), [...tris(VARIANT_WALK0 + 1)].sort())
  assert.notDeepEqual(tris(VARIANT_WALK0), tris(VARIANT_WALK0 + 1))
  // walking or settling with the walk draws a walk variant; standing still, sitting and waving as before
  assert.equal(avatarVariant(view, "walk", 1, 1), VARIANT_WALK0 + 1)
  assert.equal(avatarVariant(view, "stand", 0.2, 0), VARIANT_WALK0)
  assert.equal(avatarVariant(view, "stand", 0, 0), VARIANT_STAND)
  // only the walk variants reach the re-weighted copies, and those lean on the thighs
  const v = rig.views.front
  const drawn = [v.mesh, ...items.map((id) => v.items[id].mesh)].reduce((n, mesh) => n + mesh.pos.length / 2, 0)
  const joints = new Uint8Array(compiled.vertexData)
  const thighs = new Set([view.index.thigh_near, view.index.thigh_far])
  const copies = new Set(range(VARIANT_WALK0).filter((i) => i >= drawn))
  assert.ok(range(VARIANT_STAND).every((i) => i < drawn))
  let onThighs = 0
  for (const i of copies) {
    const w = Array.from({ length: 4 }, (_, k) => [joints[i * 32 + 16 + k], joints[i * 32 + 20 + k]])
    if (w.some(([j, wt]) => thighs.has(j) && wt > 0)) onThighs++
  }
  assert.ok(copies.size > 0 && onThighs > 0)
})

test("without a retargeted walk nothing changes: the walk is today's", () => {
  const plain = JSON.parse(JSON.stringify(bundled)) as Rig25
  for (const v of Object.values(plain.views)) delete v.motion
  const view = compileView("front", plain.views.front)
  assert.equal(view.motion, null)
  assert.equal(avatarVariant(view, "stand", 0.5, -1), VARIANT_STAND)
  assert.equal(avatarVariant(view, "walk", 1, -1), VARIANT_WALK0)
})

test("sitting down, the knees bend more as she lowers, and the seated drawing takes over half way", () => {
  // the progress eases in, never goes back, and passes half way well inside the sit-down (0.6 s; 0.25 s reduced)
  let last = 0
  for (let t = 0; t <= 0.7; t += 0.02) {
    const w = sitDownWeight(t, false)
    assert.ok(w >= last && w <= 1)
    last = w
  }
  assert.equal(sitDownWeight(0, false), 0)
  assert.equal(sitDownWeight(0.54, false), 1)
  assert.ok(sitDownWeight(0.3, false) >= SIT_CARD_FROM && sitDownWeight(0.25, true) === 1)
  const rig = rigWithMotion()
  for (const name of ["front", "back"] as const) {
    const view = compileView(name, rig.views[name])
    const m = view.motion
    assert.ok(m)
    const foot = (sitWeight: number) => {
      const palette = new Float32Array(view.slotCount * PALETTE_STRIDE)
      writeAvatarPalette(view, { ...walkInput, pose: "stand", walkWeight: 0, sitWeight }, palette)
      const f = view.index.foot_near
      return skin(palette, f, view.head[f * 2], view.head[f * 2 + 1])
    }
    // the knees come forward the way the drawing faces (front: screen left, back: right), more the further down
    // she is, and the feet never sink below the floor (bill px, y up)
    const along = (w: number) => foot(w)[0] * m.fwd
    assert.ok(along(0.25) > along(0) + 5 && along(0.45) > along(0.25) + 5, name)
    // (a leaning thigh first swings through upright: well under a pixel at phone size, 0.2% of her height)
    for (const w of [0.1, 0.25, 0.45]) assert.ok(foot(w)[1] >= foot(0)[1] - 0.002 * view.height, `${name} ${w}`)
    // still the standing drawing (posed), not the seated card, while it bends
    assert.equal(avatarVariant(view, "stand", 0, 0, 0.3), VARIANT_WALK0)
    // bending is relative to the step and mirrors between the views; nothing bends at 0
    const pose = new Float32Array(motionPoseLength(m))
    addMotionSitBend(m, pose, 0)
    assert.ok(pose.every((x) => x === 0))
    addMotionSitBend(m, pose, 0.3)
    assert.ok(near(pose[view.index.thigh_near * 2], -m.fwd * 1.15 * 0.3))
  }
})

test("shoes with a sole lift raise her standing and walking, never seated; bare feet stand on the floor", () => {
  const rig = rigWithMotion()
  const items = ["shoes_mint_ribbon_court_sneakers", "bottom_coral_wave_pants"]
  rig.views.front.items.shoes_mint_ribbon_court_sneakers.lift = 12
  const dressed = compileAvatar(rig, "front", items).view
  const bare = compileAvatar(rig, "front", []).view
  assert.equal(dressed.soleLift, 12)
  assert.equal(bare.soleLift, 0)
  const placement = { mirror: false, anchorX: 0.5, anchorY: 0.9, heightPx: 300 }
  const groundOnScreen = (view: typeof dressed, pose: "stand" | "walk" | "wave" | "sit") => {
    const out = new Float32Array(4)
    writeAvatarClipTransform(view, pose, placement, 400, 600, out)
    return (1 - out[3]) / 2 * 600   // the bare-foot ground point's screen y (px, y down)
  }
  const k = placement.heightPx / dressed.height
  for (const pose of ["stand", "walk", "wave"] as const) {
    assert.ok(near(groundOnScreen(bare, pose), 0.9 * 600), pose)
    assert.ok(near(groundOnScreen(dressed, pose), 0.9 * 600 - 12 * k), pose)
  }
  const seatOut = new Float32Array(4), bareSeat = new Float32Array(4)
  writeAvatarClipTransform(dressed, "sit", placement, 400, 600, seatOut)
  writeAvatarClipTransform(bare, "sit", placement, 400, 600, bareSeat)
  assert.deepEqual(Array.from(seatOut), Array.from(bareSeat))
})

/** Indices a variant draws; the packed vertex's uv (floats 2, 3 of 8) and its joints/weights (bytes 16..23). */
function drawn(compiled: ReturnType<typeof compileAvatar>, variant: number) {
  return Array.from(compiled.indexData.subarray(compiled.variants[variant * 2], compiled.variants[variant * 2] + compiled.variants[variant * 2 + 1]))
}
/** A texel address: texture-array layer and uv (two atlases can share uvs on different pages). */
function uvKey(compiled: ReturnType<typeof compileAvatar>, vertex: number) {
  const f = new Float32Array(compiled.vertexData)
  const layer = new Uint8Array(compiled.vertexData)[vertex * 32 + 24]
  return `${layer}:${f[vertex * 8 + 2].toFixed(5)},${f[vertex * 8 + 3].toFixed(5)}`
}
function uvsOf(mesh: Rig25View["mesh"], rangeName: string, compiled: ReturnType<typeof compileAvatar>, view: Rig25View) {
  const r = mesh.ranges.find((x) => x.name === rangeName)
  assert.ok(r, rangeName)
  const out = new Set<string>()
  for (let i = r.start; i < r.start + r.count; i++) {
    const v = mesh.index[i]
    const layer = compiled.pages.indexOf(view.pages[mesh.page[v]])
    out.add(`${layer}:${Math.fround(mesh.uv[v * 2]).toFixed(5)},${Math.fround(mesh.uv[v * 2 + 1]).toFixed(5)}`)
  }
  return out
}

const PANTS = "bottom_coral_wave_pants"
const SHOES = "shoes_mint_ribbon_court_sneakers"
const POLO = "top_coral_wave_polo"

test("the bare legs are drawn for what is worn: trousers, shoes, both, or neither", () => {
  for (const name of ["front", "back"] as const) {
    const v = bundled.views[name]
    const all = Object.values(v.items).flatMap((it) => it.mesh.ranges.filter((r) => r.legVariant))
    if (all.length === 0) continue
    const cases: [string[], string][] = [[[], ""], [[PANTS], "bottom"], [[SHOES], "shoes"], [[SHOES, PANTS], "bottom+shoes"]]
    for (const [items, key] of cases) {
      const compiled = compileAvatar(bundled, name, items)
      for (const variant of [VARIANT_STAND, VARIANT_WALK0]) {
        const uvs = new Set(drawn(compiled, variant).map((i) => uvKey(compiled, i)))
        for (const leg of ["nearLeg", "farLeg"]) {
          const bare = uvsOf(v.mesh, leg, compiled, v)
          const owner = items.map((id) => v.items[id]).find((it) => it.mesh.ranges.some((r) => r.legVariant === key && r.layer === leg))
          if (key === "" || !owner) {
            assert.ok([...bare].every((u) => uvs.has(u)), `${name} ${key || "bare"} ${leg}`)
            continue
          }
          // the drawing for exactly this set replaces the bare leg; the other sets' drawings never show
          assert.ok([...uvsOf(owner.mesh, `${leg}@${key}`, compiled, v)].every((u) => uvs.has(u)), `${name} ${key} ${leg}`)
          assert.ok([...bare].every((u) => !uvs.has(u)), `${name} ${key} ${leg} bare hidden`)
          for (const other of all.filter((r) => r.legVariant !== key)) {
            const otherOwner = Object.values(v.items).find((it) => it.mesh.ranges.includes(other))
            if (otherOwner && items.some((id) => v.items[id] === otherOwner)) {
              assert.ok([...uvsOf(otherOwner.mesh, other.name, compiled, v)].every((u) => !uvs.has(u)), `${name} ${key}: ${other.name} hidden`)
            }
          }
        }
      }
    }
  }
})

test("walking skins the torso and the worn items with their baked walk weights; standing keeps the drawing's own", () => {
  const v = bundled.views.front
  const polo = v.items[POLO].mesh
  if (!polo.walkJoints || !polo.walkWeights) return
  const items = [SHOES, PANTS, POLO]
  const compiled = compileAvatar(bundled, "front", items)
  const bytes = new Uint8Array(compiled.vertexData)
  const skinOf = (i: number) => Array.from({ length: 4 }, (_, k) => [bytes[i * 32 + 16 + k], bytes[i * 32 + 20 + k]] as const)
    .filter(([, w]) => w > 0).map(([j, w]) => `${j}:${Math.round(w / 255 * 50)}`).sort().join(" ")
  const expect = (mesh: Rig25View["mesh"], local: number, joints: number[], weights: number[]) =>
    Array.from({ length: 4 }, (_, k) => [joints[local * 4 + k], Math.round(weights[local * 4 + k] * 255)] as const)
      .filter(([, w]) => w > 0).map(([j, w]) => `${j}:${Math.round(w / 255 * 50)}`).sort().join(" ")
  // the polo's torso piece, by its uv, in the standing and the walking draw
  const part = polo.ranges.find((r) => r.name === "part1")
  assert.ok(part?.walk)
  const local = polo.index[part.start]
  const layer = compiled.pages.indexOf(v.pages[polo.page[local]])
  const target = `${layer}:${Math.fround(polo.uv[local * 2]).toFixed(5)},${Math.fround(polo.uv[local * 2 + 1]).toFixed(5)}`
  const find = (variant: number) => drawn(compiled, variant).find((i) => uvKey(compiled, i) === target)
  const standing = find(VARIANT_STAND), walking = find(VARIANT_WALK0)
  assert.ok(standing !== undefined && walking !== undefined)
  assert.notEqual(standing, walking)
  assert.equal(skinOf(standing), expect(polo, local, polo.joints, polo.weights))
  assert.equal(skinOf(walking), expect(polo, local, polo.walkJoints, polo.walkWeights))
})

test("the walking torso drawing shows only while the retargeted walk plays", () => {
  const v = bundled.views.front
  if (!v.mesh.ranges.some((r) => r.name === "torsoWalk")) return
  const compiled = compileAvatar(bundled, "front", [])
  const walkUvs = uvsOf(v.mesh, "torsoWalk", compiled, v)
  const has = (variant: number) => {
    const uvs = new Set(drawn(compiled, variant).map((i) => uvKey(compiled, i)))
    return [...walkUvs].some((u) => uvs.has(u))
  }
  assert.ok(has(VARIANT_WALK0) && has(VARIANT_WALK0 + 1))
  assert.ok(!has(VARIANT_STAND))
})
