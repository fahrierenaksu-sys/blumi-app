import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import {
  avatar25HasMirrorCards,
  avatar25MirroredOnScreen,
  compileAvatar,
  compileView,
  PALETTE_STRIDE,
  pickAvatar25View,
  poseVariant,
  VARIANT_SIT,
  VARIANT_STAND,
  VARIANT_WALK0,
  avatar25StandEntries,
  legPlan,
  walkFrameIndex,
  writeAvatarClipTransform,
  writeAvatarPalette,
  type PoseInput
} from "./avatar25Pose"
import { avatar25TravelFacing, resolveAvatarDraw, scaleAvatarMovementTiming } from "../model/resolveAvatarDraw"
import { seatedCardStrips, seatedShinBandRows } from "./avatar25SeatedLegs"
import { ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING, timeRoomWorldMovementSegments } from "../../roomWorld/roomWorldRuntime"
import type { Rig25, Rig25Item } from "./rigTypes"

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
        const sit = mesh.ranges.find((range) => range.name === "sit")
        if (!sit) continue
        // a card cut to its own box that ends above the shin band (a top) has no leg rows: it is drawn as it is
        const rows = mesh.index.slice(sit.start, sit.start + sit.count).map((i) => mesh.pos[i * 2 + 1]!)
        if (Math.max(...rows) <= band[0]) continue
        assert.ok(seatedCardStrips(mesh, band, 0, 1), `${name} ${viewName}`)
      }
      assert.ok(view.sit.feet[1] > view.sit.seat[1], `${name} ${viewName}: soles below the hip`)
    }
  }
})


// mirror cards: a fixture rig (the girl's rig, its pageboy hair given cards for its drawing) against the same rig without
const CARD_HAIR = "hair_ink_pageboy_star"
const CARD_SHIFT = 0.125
const VERTEX_STRIDE = 32

/** A copy of the girl rig whose hair has mirror cards on its main drawing (`part0`) only. */
function withMirrorCards(cardPage?: number): Rig25 {
  const copy = structuredClone(rig)
  const hair: Rig25Item = copy.views.front.items[CARD_HAIR]
  const part = hair.mesh.ranges.find((r) => r.name === "part0")!
  const marked = new Set(hair.mesh.index.slice(part.start, part.start + part.count))
  hair.mirrorUv = hair.mesh.uv.map((u, k) => (marked.has(k >> 1) && k % 2 === 0 ? u + CARD_SHIFT : u))
  if (cardPage !== undefined) hair.mirrorPage = cardPage
  return copy
}

/** [u, v, page layer] of vertex `i` in a compiled avatar's vertex buffer. */
function vertexAt(data: ArrayBuffer, i: number) {
  const f = new Float32Array(data, i * VERTEX_STRIDE, 4)
  return { u: f[2], v: f[3], layer: new Uint8Array(data)[i * VERTEX_STRIDE + 24] }
}

test("mirror cards: a mirrored direction samples them for the marked parts only, and only for items that carry them", () => {
  const worn = [CARD_HAIR]
  const cards = withMirrorCards()
  const bodyVertices = rig.views.front.mesh.pos.length / 2
  const hair = cards.views.front.items[CARD_HAIR]
  const plain = compileAvatar(cards, "front", worn, false)
  const mirrored = compileAvatar(cards, "front", worn, true)
  // the unmirrored drawing is the rig without cards, byte for byte; geometry, order and pages never change
  const without = compileAvatar(rig, "front", worn)
  assert.deepEqual(new Uint8Array(plain.vertexData), new Uint8Array(without.vertexData))
  assert.deepEqual(plain.indexData, without.indexData)
  assert.deepEqual(mirrored.indexData, plain.indexData)
  assert.deepEqual(mirrored.variants, plain.variants)
  assert.equal(mirrored.vertexData.byteLength, plain.vertexData.byteLength)
  // every vertex of the hair takes the card's uv in the mirrored drawing; the body does not change at all
  const changed = new Set<number>()
  for (let i = 0; i < mirrored.vertexData.byteLength / VERTEX_STRIDE; i++) {
    const [a, b] = [vertexAt(plain.vertexData, i), vertexAt(mirrored.vertexData, i)]
    if (a.u !== b.u || a.v !== b.v) changed.add(i)
    assert.equal(b.layer, a.layer)
  }
  assert.ok(changed.size > 0)
  // only hair vertices move (the walk's weighted copies of them move too): by exactly the card's shift, never the body
  for (const i of changed) {
    assert.ok(i >= bodyVertices, "the body is not touched")
    const [from, to] = [vertexAt(plain.vertexData, i), vertexAt(mirrored.vertexData, i)]
    assert.ok(Math.abs(to.u - from.u - CARD_SHIFT) < 1e-6 && to.v === from.v)
  }
  for (let k = 0; k < hair.mesh.uv.length / 2; k++) {
    const vertex = vertexAt(mirrored.vertexData, bodyVertices + k)
    assert.ok(Math.abs(vertex.u - hair.mirrorUv![k * 2]) < 1e-6 && Math.abs(vertex.v - hair.mirrorUv![k * 2 + 1]) < 1e-6, `vertex ${k}`)
  }
  // an avatar wearing nothing with cards draws the same for both directions (the transform flips it)
  const others = ["bottom_coral_wave_pants", "top_coral_wave_polo", "shoes_mint_ribbon_court_sneakers"]
  const a = compileAvatar(cards, "front", others, true)
  const b = compileAvatar(cards, "front", others, false)
  assert.deepEqual(new Uint8Array(a.vertexData), new Uint8Array(b.vertexData))
  assert.deepEqual(a.pages, b.pages)
  assert.equal(avatar25HasMirrorCards(cards, "front", worn), true)
  assert.equal(avatar25HasMirrorCards(cards, "front", others), false)
  assert.equal(avatar25HasMirrorCards(cards, "back", worn), false)
  assert.equal(avatar25HasMirrorCards(rig, "front", worn), false)
})

test("mirror cards on their own page: only the marked vertices use it, and that page is loaded only when mirrored", () => {
  const cardPage = rig.views.front.items.shoes_mint_ribbon_court_sneakers.page
  assert.notEqual(cardPage, rig.views.front.items[CARD_HAIR].page)
  const cards = withMirrorCards(cardPage)
  const plain = compileAvatar(cards, "front", [CARD_HAIR], false)
  const mirrored = compileAvatar(cards, "front", [CARD_HAIR], true)
  assert.ok(!plain.pages.includes(cards.views.front.pages[cardPage]))
  assert.ok(mirrored.pages.includes(cards.views.front.pages[cardPage]))
  const layerOf = (compiled: typeof plain, page: number) => compiled.pages.indexOf(cards.views.front.pages[page])
  const hair = cards.views.front.items[CARD_HAIR]
  const bodyVertices = cards.views.front.mesh.pos.length / 2
  for (let k = 0; k < hair.mesh.uv.length / 2; k++) {
    const isMarked = hair.mirrorUv![k * 2] !== hair.mesh.uv[k * 2]
    const vertex = vertexAt(mirrored.vertexData, bodyVertices + k)
    assert.equal(vertex.layer, layerOf(mirrored, isMarked ? cardPage : hair.page), `vertex ${k}`)
  }
})

test("mirror cards on their own page: the plain view of that avatar holds the same page set, so one texture array serves both", () => {
  const cardPage = rig.views.front.items.shoes_mint_ribbon_court_sneakers.page
  const cards = withMirrorCards(cardPage)
  const worn = [CARD_HAIR]
  const mirrored = compileAvatar(cards, "front", worn, true)
  const plain = compileAvatar(cards, "front", worn, false, true)
  // equal page sets key one cached texture array (the body and item pages are not uploaded a second time)
  assert.deepEqual(plain.pages, mirrored.pages)
  // and every vertex samples the same layer in both drawings except the marked ones, which move to the card's layer
  const cardLayer = mirrored.pages.indexOf(cards.views.front.pages[cardPage])
  assert.ok(cardLayer >= 0)
  for (let i = 0; i < plain.vertexData.byteLength / VERTEX_STRIDE; i++) {
    const [a, b] = [vertexAt(plain.vertexData, i), vertexAt(mirrored.vertexData, i)]
    if (a.layer !== b.layer) assert.equal(b.layer, cardLayer, `vertex ${i}`)
    assert.notEqual(a.layer, cardLayer, `vertex ${i}`)
  }
  // an avatar wearing no carded item keeps the page set it always had
  const others = ["bottom_coral_wave_pants", "top_coral_wave_polo"]
  assert.deepEqual(compileAvatar(cards, "front", others, false, true).pages, compileAvatar(rig, "front", others).pages)
})

test("the card is drawn exactly when the drawing the viewer sees is mirrored (the renderer's flip and an outer flip cancel)", () => {
  // [flip applied by the canvas, flip applied around it, the viewer sees a mirrored drawing]
  const table: [boolean, boolean, boolean][] = [
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, false]
  ]
  for (const [mirror, outer, seen] of table) {
    assert.equal(avatar25MirroredOnScreen(mirror, outer), seen, `mirror ${mirror}, outer ${outer}`)
    const view = pickAvatar25View(["f", "b"], ["fM", "bM"], 1, avatar25MirroredOnScreen(mirror, outer))
    assert.equal(view, seen ? "bM" : "b", `mirror ${mirror}, outer ${outer}`)
  }
})

test("an avatar with a baked still under it never builds mirror cards, so the still and the live view flip alike", () => {
  const cards = withMirrorCards()
  assert.equal(avatar25HasMirrorCards(cards, "front", [CARD_HAIR]), true)
  assert.equal(avatar25HasMirrorCards(cards, "front", [CARD_HAIR], false), false)
  // without a mirrored view the pick is the plain view whatever the facing: the same flip the still shows
  assert.equal(pickAvatar25View(["f", "b"], [undefined, undefined], 0, avatar25MirroredOnScreen(true, false)), "f")
})

test("mirror cards that do not match the mesh are ignored, never half applied", () => {
  const cards = withMirrorCards()
  cards.views.front.items[CARD_HAIR].mirrorUv = cards.views.front.items[CARD_HAIR].mirrorUv!.slice(2)
  assert.equal(avatar25HasMirrorCards(cards, "front", [CARD_HAIR]), false)
  const a = compileAvatar(cards, "front", [CARD_HAIR], true)
  const b = compileAvatar(rig, "front", [CARD_HAIR], false)
  assert.deepEqual(new Uint8Array(a.vertexData), new Uint8Array(b.vertexData))
})

test("the mirrored view is picked only where one was built", () => {
  assert.equal(pickAvatar25View(["f", "b"], [undefined, undefined], 0, true), "f")
  assert.equal(pickAvatar25View(["f", "b"], ["fM", "bM"], 0, true), "fM")
  assert.equal(pickAvatar25View(["f", "b"], ["fM", "bM"], 1, true), "bM")
  assert.equal(pickAvatar25View(["f", "b"], ["fM", "bM"], 1, false), "b")
  assert.equal(pickAvatar25View(["f", "b"], ["fM", undefined], 1, true), "b")
})

test("every shipped rig's mirror cards line up with their mesh", () => {
  for (const [name, r] of Object.entries(RIGS)) {
    for (const [viewName, view] of Object.entries(r.views)) {
      for (const [id, item] of Object.entries(view.items)) {
        if (item.mirrorUv === undefined) {
          assert.equal(item.mirrorPage, undefined, `${name} ${viewName} ${id}: mirrorPage needs mirrorUv`)
          continue
        }
        assert.equal(item.mirrorUv.length, item.mesh.uv.length, `${name} ${viewName} ${id}`)
        if (item.mirrorPage !== undefined) assert.ok(view.pages[item.mirrorPage], `${name} ${viewName} ${id}: mirrorPage exists`)
      }
    }
  }
})

// leg composition: any bottom with any shoes. A boy-style fixture from the girl's data: items own role-keyed leg
// drawings ('bottom' / 'shoes') and no pair drawing, with a second bottom and a second pair of shoes.
const PANTS = "bottom_coral_wave_pants"
const SNEAKERS = "shoes_mint_ribbon_court_sneakers"
const LEGS = ["farLeg", "nearLeg"] as const

function roleKeyedMix(): Rig25 {
  const copy = structuredClone(rig)
  for (const view of Object.values(copy.views)) {
    const pants = view.items[PANTS]
    pants.mesh.ranges = pants.mesh.ranges.filter((r) => r.legVariant !== "bottom+shoes")
    view.items.bottom_b = structuredClone(pants)
    view.items.shoes_b = structuredClone(view.items[SNEAKERS])
  }
  return copy
}

/** Global vertex ids drawn in one variant, and the global ids of a named range of a worn set (0 body, k+1 item k). */
function drawnVertices(compiled: ReturnType<typeof compileAvatar>, variant: number): Set<number> {
  const start = compiled.variants[variant * 2], count = compiled.variants[variant * 2 + 1]
  return new Set(compiled.indexData.slice(start, start + count))
}
function rangeVertices(r: Rig25, worn: string[], set: number, name: string): Set<number> {
  const v = r.views.front
  const meshes = [v.mesh, ...worn.map((id) => v.items[id].mesh)]
  const base = meshes.slice(0, set).reduce((n, m) => n + m.pos.length / 2, 0)
  const range = meshes[set].ranges.find((x) => x.name === name)!
  return new Set(meshes[set].index.slice(range.start, range.start + range.count).map((i) => i + base))
}
/** The mask bytes of vertex `i`: flag, page layer and uv (unorm16). */
function maskAt(data: ArrayBuffer, i: number) {
  const b = new Uint8Array(data), h = new Uint16Array(data)
  return { on: b[i * VERTEX_STRIDE + 27], layer: b[i * VERTEX_STRIDE + 26], u: h[(i * VERTEX_STRIDE + 28) / 2] / 65535, v: h[(i * VERTEX_STRIDE + 30) / 2] / 65535 }
}
const every = (s: Set<number>, f: (i: number) => boolean) => [...s].every(f)

test("legs: a bottom worn with shoes from another outfit draws its own leg drawing gated by the shoes' leg drawing", () => {
  const mix = roleKeyedMix()
  const worn = ["bottom_b", SNEAKERS]
  const compiled = compileAvatar(mix, "front", worn)
  const shown = drawnVertices(compiled, VARIANT_STAND)
  const shoes = mix.views.front.items[SNEAKERS].mesh
  const shoesLayer = compiled.pages.indexOf(mix.views.front.pages[mix.views.front.items[SNEAKERS].page])
  const gated = new Set<number>()
  for (const leg of LEGS) {
    const own = rangeVertices(mix, worn, 1, `${leg}@bottom`)
    assert.ok(every(own, (i) => shown.has(i)), `${leg}: the bottom's drawing is drawn`)
    assert.ok(every(rangeVertices(mix, worn, 0, leg), (i) => !shown.has(i)), `${leg}: the bare leg is hidden`)
    assert.ok(every(rangeVertices(mix, worn, 2, `${leg}@shoes`), (i) => !shown.has(i)), `${leg}: the shoes' drawing is only a gate`)
    // the gate is the shoes' drawing at the same vertex of the shared body-leg mesh, on the shoes' page
    const gate = shoes.ranges.find((r) => r.name === `${leg}@shoes`)!
    const gateVerts = shoes.index.slice(gate.start, gate.start + gate.count)
    const ownRange = mix.views.front.items.bottom_b.mesh.ranges.find((r) => r.name === `${leg}@bottom`)!
    const ownVerts = mix.views.front.items.bottom_b.mesh.index.slice(ownRange.start, ownRange.start + ownRange.count)
    const base = mix.views.front.mesh.pos.length / 2
    ownVerts.forEach((local, t) => {
      const m = maskAt(compiled.vertexData, local + base)
      assert.equal(m.on, 1)
      assert.equal(m.layer, shoesLayer)
      assert.ok(Math.abs(m.u - shoes.uv[gateVerts[t] * 2]) < 1e-4 && Math.abs(m.v - shoes.uv[gateVerts[t] * 2 + 1]) < 1e-4, `${leg} uv`)
      gated.add(local + base)
    })
  }
  // nothing else is gated, and the still baker sees the same gate
  for (let i = 0; i < compiled.vertexData.byteLength / VERTEX_STRIDE; i++) if (!gated.has(i)) assert.equal(maskAt(compiled.vertexData, i).on, 0)
  const legs = avatar25StandEntries(mix, "front", worn).filter((e) => e.legVariant !== undefined)
  assert.deepEqual(legs.map((e) => [e.owner, e.legVariant, e.legMask?.owner]), LEGS.map(() => ["bottom_b", "bottom", SNEAKERS]))
})

test("legs: one item alone draws its own leg drawing ungated, and any bottom mixes with any shoes", () => {
  const mix = roleKeyedMix()
  const view = mix.views.front
  for (const [worn, key] of [[[PANTS], "bottom"], [["shoes_b"], "shoes"], [["hair_ink_pageboy_star"], null]] as const) {
    const plan = legPlan(view, [...worn])
    assert.equal(plan?.key ?? null, key, worn.join())
    assert.equal(plan?.mask, undefined)
    const compiled = compileAvatar(mix, "front", [...worn])
    for (let i = 0; i < compiled.vertexData.byteLength / VERTEX_STRIDE; i++) assert.equal(maskAt(compiled.vertexData, i).on, 0)
  }
  for (const bottom of [PANTS, "bottom_b"]) {
    for (const shoes of [SNEAKERS, "shoes_b"]) {
      for (const worn of [[bottom, shoes], [shoes, bottom]]) {
        const plan = legPlan(view, worn)
        assert.deepEqual(plan, { set: worn.indexOf(bottom) + 1, key: "bottom", mask: worn.indexOf(shoes) + 1 }, worn.join())
      }
    }
  }
})

test("legs: shoes missing the drawing for one leg degrade that one avatar to the bottom's leg uncut, never a failed draw", () => {
  const mix = roleKeyedMix()
  const shoes = mix.views.front.items.shoes_b.mesh
  shoes.ranges = shoes.ranges.filter((r) => r.name !== "nearLeg@shoes")
  const worn = ["bottom_b", "shoes_b"]
  const warn = console.warn
  const warnings: string[] = []
  console.warn = (message: string) => warnings.push(message)
  try {
    const compiled = compileAvatar(mix, "front", worn)
    const again = compileAvatar(mix, "front", worn)
    assert.ok(again.vertexData.byteLength > 0)
    const shown = drawnVertices(compiled, VARIANT_STAND)
    for (const leg of LEGS) {
      assert.ok(every(rangeVertices(mix, worn, 1, `${leg}@bottom`), (i) => shown.has(i)), `${leg}: the bottom's drawing is drawn`)
      assert.ok(every(rangeVertices(mix, worn, 0, leg), (i) => !shown.has(i)), `${leg}: the bare leg is hidden`)
    }
    const near = rangeVertices(mix, worn, 1, "nearLeg@bottom")
    const far = rangeVertices(mix, worn, 1, "farLeg@bottom")
    assert.ok(every(near, (i) => maskAt(compiled.vertexData, i).on === 0), "near leg: drawn uncut")
    assert.ok(every(far, (i) => maskAt(compiled.vertexData, i).on === 1), "far leg: still gated")
  } finally {
    console.warn = warn
  }
  assert.ok(warnings.length <= 1, "logged at most once")
  assert.ok(warnings.every((m) => !m.includes("bottom_b") && !m.includes("shoes_b")), "no item IDs in the log")
})

test("legs: the girl's QA'd pair drawing is drawn as before, with no gate", () => {
  for (const name of ["front", "back"] as const) {
    const worn = [SNEAKERS, PANTS]
    assert.deepEqual(legPlan(rig.views[name], worn), { set: 2, key: "bottom+shoes" })
    const compiled = compileAvatar(rig, name, worn)
    for (let i = 0; i < compiled.vertexData.byteLength / VERTEX_STRIDE; i++) assert.equal(maskAt(compiled.vertexData, i).on, 0)
    if (name !== "front") continue
    const shown = drawnVertices(compiled, VARIANT_STAND)
    for (const leg of LEGS) {
      assert.ok(every(rangeVertices(rig, worn, 2, `${leg}@bottom+shoes`), (i) => shown.has(i)), leg)
      assert.ok(every(rangeVertices(rig, worn, 2, `${leg}@bottom`), (i) => !shown.has(i)), leg)
      assert.ok(every(rangeVertices(rig, worn, 1, `${leg}@shoes`), (i) => !shown.has(i)), leg)
    }
    assert.ok(avatar25StandEntries(rig, name, worn).every((e) => e.legMask === undefined))
  }
})

test("seated cards cut to their own box move exactly as the same rows of a full card", () => {
  const band: [number, number] = [100, 200]
  const card = (top: number, bottom: number): Rig25["views"]["front"]["mesh"] => ({
    pos: [0, top, 10, top, 10, bottom, 0, bottom], uv: [0, 0, 1, 0, 1, 1, 0, 1], joints: [5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0],
    weights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], index: [0, 1, 2, 0, 2, 3], page: [1, 1, 1, 1], arm: [0, 0, 0, 0],
    ranges: [{ name: "sit", order: 1, start: 0, count: 6 }]
  })
  // [slot, weight] pairs per row (two vertices each): root 7, leg 9
  const rows = (m: Rig25["views"]["front"]["mesh"] | null) =>
    m ? Array.from({ length: m.pos.length / 4 }, (_, r) => [m.pos[r * 4 + 1], m.joints[r * 8], m.weights[r * 8], m.joints[r * 8 + 1], m.weights[r * 8 + 1]]) : null
  // a full card: above the band on root, below it on the leg slot (as before)
  assert.deepEqual(rows(seatedCardStrips(card(50, 300), band, 7, 9)), [[50, 7, 1, 0, 0], [100, 7, 1, 0, 0], [200, 9, 1, 0, 0], [300, 9, 1, 0, 0]])
  // shoes cut below the band: all on the leg slot, drawn
  const shoes = seatedCardStrips(card(250, 300), band, 7, 9)!
  assert.ok(shoes.index.length > 0)
  assert.ok(rows(shoes)!.every(([, slot, w]) => slot === 9 && w === 1))
  // a card starting inside the band: its top row moves by its depth in the band
  assert.deepEqual(rows(seatedCardStrips(card(150, 300), band, 7, 9))![0], [150, 7, 0.5, 9, 0.5])
  // a card wholly above the band never moves
  assert.equal(seatedCardStrips(card(10, 90), band, 7, 9), null)
})
