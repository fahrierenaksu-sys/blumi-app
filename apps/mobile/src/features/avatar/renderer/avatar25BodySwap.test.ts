import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { avatar25PoseRanges, compileAvatar, VARIANT_SIT, type Avatar25PoseRange } from "./avatar25Pose"
import type { Avatar25Pose, Avatar25ViewName, Rig25 } from "./rigTypes"

const girl = JSON.parse(readFileSync(resolve(import.meta.dirname, "../rigs/girl/rig25.json"), "utf8")) as Rig25
const VIEWS: Avatar25ViewName[] = ["front", "back"]
const POSES: Avatar25Pose[] = ["stand", "walk", "sit", "wave"]
/** The first item of a slot that draws no body range of its own (the girl's starter pieces: the fixtures below add them). */
const itemOf = (rig: Rig25, slot: string) => Object.keys(rig.views.front.items).find((id) => {
  const item = rig.views.front.items[id]
  return item.slot === slot && item.torso === undefined && item.mesh.ranges.every((r) => r.bodyPart === undefined)
})!
const TOP = itemOf(girl, "top")
const BOTTOM = itemOf(girl, "bottom")
const SHOES = itemOf(girl, "shoes")
const HAIR = itemOf(girl, "hair")
const OUTFIT = [TOP, BOTTOM, SHOES, HAIR]
/** What the black trousers replace (the factory's torso, arm and seated-card variants). */
const TROUSER_PARTS = ["torso", "torsoUpper", "torsoNoArms", "torsoSit", "torsoCardArms", "torsoWalk", "farArm", "nearArm", "sit"]
/** What a crop top replaces (the shared bare-belly torso, `torso: "midriff"`). */
const MIDRIFF_PARTS = ["torso", "torsoNoArms", "torsoCardArms", "torsoWalk"]

/**
 * The rig as export_rig.py writes it when `itemId` owns drawings of these body ranges: each a copy of the body
 * range's vertices (same positions, uvs and weights) appended to the item's mesh as `<part>@body`.
 */
function withBodyDrawings(src: Rig25, itemId: string, parts: string[], bodyWith?: string, torso?: "midriff"): Rig25 {
  const rig = structuredClone(src)
  for (const view of VIEWS) {
    const v = rig.views[view]
    const item = v.items[itemId]
    if (torso) item.torso = torso
    const m = item.mesh, b = v.mesh
    if (b.walkJoints && !m.walkJoints) {
      m.walkJoints = [...m.joints]
      m.walkWeights = [...m.weights]
    }
    for (const part of parts) {
      const r = b.ranges.find((x) => x.name === part)
      if (!r) continue
      const local = new Map<number, number>()
      for (const g of b.index.slice(r.start, r.start + r.count)) {
        if (local.has(g)) continue
        local.set(g, m.pos.length / 2)
        m.pos.push(b.pos[g * 2]!, b.pos[g * 2 + 1]!)
        m.uv.push(b.uv[g * 2]!, b.uv[g * 2 + 1]!)
        m.joints.push(...b.joints.slice(g * 4, g * 4 + 4))
        m.weights.push(...b.weights.slice(g * 4, g * 4 + 4))
        m.walkJoints?.push(...(b.walkJoints ?? b.joints).slice(g * 4, g * 4 + 4))
        m.walkWeights?.push(...(b.walkWeights ?? b.weights).slice(g * 4, g * 4 + 4))
        m.page.push(item.page)
        m.arm.push(b.arm[g]!)
      }
      const start = m.index.length
      m.index.push(...b.index.slice(r.start, r.start + r.count).map((g) => local.get(g)!))
      m.ranges.push({
        name: bodyWith ? `${part}@with:${bodyWith}` : `${part}@body`, order: r.order, start, count: r.count,
        bodyPart: part, ...(bodyWith ? { bodyWith } : {}), ...(r.walk ? { walk: true } : {})
      })
    }
  }
  return rig
}

const key = (e: Avatar25PoseRange) => `${e.owner}:${e.name}@${e.order}`
const drawn = (rig: Rig25, view: Avatar25ViewName, worn: string[], pose: Avatar25Pose) => avatar25PoseRanges(rig, view, worn, pose).map(key)
/** Who draws body range `part` in this pose: "body", an item id, or null (not drawn). */
const ownerOf = (rig: Rig25, view: Avatar25ViewName, worn: string[], pose: Avatar25Pose, part: string) => {
  const hit = avatar25PoseRanges(rig, view, worn, pose).find((e) => e.name === part || e.name.startsWith(`${part}@`))
  return hit ? hit.owner : null
}

test("a worn item draws its body drawings instead of exactly the body ranges it declares, in every pose", () => {
  const trousers = withBodyDrawings(girl, BOTTOM, TROUSER_PARTS)
  for (const view of VIEWS) for (const pose of POSES) for (const worn of [[BOTTOM], OUTFIT]) {
    // the same draw list as without the drawings, with each body range it replaces drawn from the item instead
    const expected = avatar25PoseRanges(girl, view, worn, pose)
      .map((e) => (e.owner === "body" && TROUSER_PARTS.includes(e.name) ? { ...e, owner: BOTTOM, name: `${e.name}@body` } : e))
      .map(key)
    assert.deepEqual(drawn(trousers, view, worn, pose), expected, `${view} ${pose} ${worn.length}`)
  }
  // the item's seated card replacement is cut into the same shin strips as the body's card it replaces
  for (const view of VIEWS) {
    const plain = compileAvatar(girl, view, [BOTTOM]).variants, swapped = compileAvatar(trousers, view, [BOTTOM]).variants
    assert.equal(swapped[VARIANT_SIT * 2 + 1], plain[VARIANT_SIT * 2 + 1], view)
  }
})

test("taking the item off restores the body's own drawings, byte for byte", () => {
  const trousers = withBodyDrawings(girl, BOTTOM, TROUSER_PARTS)
  for (const view of VIEWS) {
    const rest = [TOP, SHOES, HAIR]
    for (const pose of POSES) assert.deepEqual(drawn(trousers, view, rest, pose), drawn(girl, view, rest, pose), `${view} ${pose}`)
    const a = compileAvatar(trousers, view, rest), b = compileAvatar(girl, view, rest)
    assert.deepEqual(new Uint8Array(a.vertexData), new Uint8Array(b.vertexData))
    assert.deepEqual(a.indexData, b.indexData)
    assert.deepEqual(a.variants, b.variants)
  }
})

test("a crop top's bare-belly torso replaces the tank in every pose and the waistband stays over it", () => {
  const crop = withBodyDrawings(girl, TOP, MIDRIFF_PARTS, undefined, "midriff")
  for (const view of VIEWS) {
    for (const pose of POSES) {
      for (const part of ["torso", "torsoNoArms", "torsoCardArms", "torsoWalk"]) {
        const bare = ownerOf(girl, view, [TOP], pose, part)
        assert.equal(ownerOf(crop, view, [TOP], pose, part), bare === "body" ? TOP : bare, `${view} ${pose} ${part}`)
      }
      // the arms and the seated card are not the top's to replace
      for (const part of ["farArm", "nearArm", "sit"]) assert.equal(ownerOf(crop, view, [TOP], pose, part), ownerOf(girl, view, [TOP], pose, part))
    }
    // standing, the bottom's waist piece is drawn over the belly; seated, the bottom's seated card is
    const stand = drawn(crop, view, OUTFIT, "stand")
    const belly = stand.findIndex((k) => k.startsWith(`${TOP}:torso@body`))
    assert.ok(belly >= 0 && stand.slice(belly + 1).some((k) => k.startsWith(`${BOTTOM}:part`)), `${view} stand`)
    const sit = drawn(crop, view, OUTFIT, "sit")
    const seatedBelly = sit.findIndex((k) => k.startsWith(`${TOP}:torsoCardArms@body`))
    assert.ok(seatedBelly >= 0 && sit.indexOf(sit.find((k) => k.startsWith(`${BOTTOM}:sit@`))!) > seatedBelly, `${view} sit`)
  }
})

test("seated, bottoms' and shoes' cards go above the torso only under a bared waist; other outfits keep their order", () => {
  const crop = withBodyDrawings(girl, TOP, MIDRIFF_PARTS, undefined, "midriff")
  const tankTorso = withBodyDrawings(girl, TOP, MIDRIFF_PARTS)   // a torso drawing that does not bare the waist
  for (const view of VIEWS) {
    const sit = drawn(crop, view, OUTFIT, "sit")
    const torso = sit.findIndex((k) => k.startsWith(`${TOP}:torsoCardArms@body`))
    assert.ok(torso >= 0, view)
    for (const id of [BOTTOM, SHOES]) assert.ok(sit.findIndex((k) => k.startsWith(`${id}:sit@`)) > torso, `${view} ${id}`)
    const top = sit.findIndex((k) => k.startsWith(`${TOP}:sit@`))
    if (top >= 0) assert.ok(top < torso, `${view} top`)
    // a bottom's pair drawing made with the crop top (her belly fitted to that bottom) bares the waist just the same
    const fitted = withBodyDrawings(crop, BOTTOM, MIDRIFF_PARTS, TOP)
    const fittedSit = drawn(fitted, view, OUTFIT, "sit")
    const fittedTorso = fittedSit.findIndex((k) => k.startsWith(`${BOTTOM}:torsoCardArms@with:${TOP}`))
    assert.ok(fittedTorso >= 0, `${view} pair`)
    for (const id of [BOTTOM, SHOES]) assert.ok(fittedSit.findIndex((k) => k.startsWith(`${id}:sit@`)) > fittedTorso, `${view} pair ${id}`)
    // no bared waist: every card keeps its exported order (the QA'd seated outfits)
    for (const rig of [girl, tankTorso]) {
      const plain = avatar25PoseRanges(rig, view, OUTFIT, "sit")
      for (const id of [BOTTOM, SHOES]) {
        const card = plain.find((e) => e.owner === id && e.name === "sit")
        const range = rig.views[view].items[id].mesh.ranges.find((r) => r.name === "sit")
        assert.equal(card?.order, range?.order, `${view} ${id}`)
      }
    }
  }
})

test("two worn items replacing the same body range resolve the same way whatever the wearing order", () => {
  // the top and the bottom both bring a torso; the bottom also brings arms and a pair torso for this top
  let rig = withBodyDrawings(girl, TOP, ["torso"])
  rig = withBodyDrawings(rig, BOTTOM, ["torso", "torsoCardArms", "farArm", "nearArm"])
  const pair = withBodyDrawings(rig, BOTTOM, ["torso"], TOP)
  for (const view of VIEWS) {
    for (const pose of POSES) {
      const one = drawn(rig, view, [TOP, BOTTOM], pose)
      assert.deepEqual(drawn(rig, view, [BOTTOM, TOP], pose).sort(), [...one].sort(), `${view} ${pose} order`)
    }
    // the top wins the torso family over the bottom, and replaces only what it has: seated, the body's torso shows
    assert.equal(ownerOf(rig, view, [BOTTOM, TOP], "stand", "torso"), TOP)
    assert.equal(ownerOf(rig, view, [BOTTOM, TOP], "sit", "torsoCardArms"), "body")
    // other families are won separately: the arms are the bottom's
    assert.equal(ownerOf(rig, view, [BOTTOM, TOP], "stand", "farArm"), BOTTOM)
    // a pair drawing beats both, but only while its partner is worn
    assert.equal(avatar25PoseRanges(pair, view, [TOP, BOTTOM], "stand").find((e) => e.name.startsWith("torso"))!.name, `torso@with:${TOP}`)
    assert.equal(ownerOf(pair, view, [BOTTOM], "stand", "torso"), BOTTOM)
    assert.equal(avatar25PoseRanges(pair, view, [BOTTOM], "stand").find((e) => e.name.startsWith("torso"))!.name, "torso@body")
  }
})

test("the shipped girl's crop tops bare her waist and her black trousers bring their own body, in every pose and view", () => {
  const items = girl.views.front.items
  const crops = Object.keys(items).filter((id) => items[id].torso === "midriff")
  const trousers = Object.keys(items).filter((id) => items[id].slot === "bottom" && items[id].mesh.ranges.some((r) => r.bodyPart === "sit"))
  assert.equal(crops.length, 2)
  assert.equal(trousers.length, 1)
  const [TROUSERS] = trousers as [string]
  const bodyDrawn = (worn: string[], view: Avatar25ViewName, pose: Avatar25Pose, part: string) => ownerOf(girl, view, worn, pose, part)
  for (const view of VIEWS) for (const pose of POSES) {
    // the parts the body draws in this pose, with nothing worn
    const torsoNow = TROUSER_PARTS.filter((p) => p.startsWith("torso") && bodyDrawn([], view, pose, p) === "body")
    assert.equal(torsoNow.length, 1, `${view} ${pose}: one torso drawing`)
    for (const crop of crops) for (const bottom of [undefined, BOTTOM, TROUSERS]) {
      const worn = [crop, ...(bottom ? [bottom] : []), SHOES, HAIR]
      // exactly one torso is drawn and it is the top's bare belly (with the trousers: their drawing of it, shorts trimmed);
      // the arms and seated card are the trousers' or the body's
      const torso = avatar25PoseRanges(girl, view, worn, pose).filter((e) => e.name.startsWith("torso"))
      assert.equal(torso.length, 1, `${view} ${pose} ${crop} ${bottom}`)
      assert.deepEqual([torso[0]!.owner, torso[0]!.name], bottom === TROUSERS ? [TROUSERS, `${torsoNow[0]}@with:${crop}`] : [crop, `${torsoNow[0]}@body`])
      for (const part of ["farArm", "nearArm", "sit"]) {
        const now = bodyDrawn([], view, pose, part)
        assert.equal(bodyDrawn(worn, view, pose, part), now === "body" && bottom === TROUSERS ? TROUSERS : now, `${view} ${pose} ${part}`)
      }
    }
    // the trousers with any other top draw the torso too; the starter outfit draws the body's own
    assert.equal(bodyDrawn([TOP, TROUSERS, SHOES, HAIR], view, pose, torsoNow[0]!), TROUSERS)
    for (const part of [torsoNow[0]!, "farArm", "nearArm", "sit"]) assert.ok([null, "body"].includes(bodyDrawn(OUTFIT, view, pose, part)), `${view} ${pose} ${part}`)
  }
  // seated under a crop top, the bottom's and shoes' cards are above the belly; with the starter top they keep their order
  for (const view of VIEWS) for (const crop of crops) for (const bottom of [BOTTOM, TROUSERS]) {
    const sit = drawn(girl, view, [crop, bottom, SHOES, HAIR], "sit")
    const belly = sit.findIndex((k) => k.includes(":torsoCardArms@"))
    assert.ok(belly >= 0, `${view} ${crop} ${bottom}`)
    // (the item's own seated card, not the trousers' replacement of the body's card, `sit@body`)
    for (const id of [bottom, SHOES]) assert.ok(sit.findIndex((k) => k.startsWith(`${id}:sit@`) && !k.startsWith(`${id}:sit@body`)) > belly, `${view} ${bottom} ${id}`)
  }
})
