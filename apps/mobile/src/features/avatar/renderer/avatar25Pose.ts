/**
 * The 2.5D avatar's posing, ported 1:1 from lab39 `doll25.js` (Avatar25.pose / applyPose / buildWalk).
 * Pure and allocation-light: compiled once on the JS thread, evaluated per frame on the UI thread (worklets).
 *
 * Space: "bill px" = sheet px relative to the view's ground point, y up (doll25's `P`).
 * The palette holds one 2×3 affine per slot (bones, then ROOT, then WAVE, then SEATED LEGS), 8 floats each:
 *   [a, c, tx, 0, b, d, ty, 0]  so  x' = a·x + c·y + tx,  y' = b·x + d·y + ty   (x, y in bill px)
 */
import type { Avatar25Pose, Avatar25ViewName, Rig25, Rig25Item, Rig25Mesh, Rig25Range, Rig25View } from "./rigTypes"
import {
  addMotionBreath,
  addMotionIdle,
  addMotionSitBend,
  SIT_BEND_SHARE,
  compileMotion,
  motionBlend,
  MOTION_ON_WEIGHT,
  sampleMotion,
  seatWeights,
  writeMotionPalette,
  type CompiledMotion
} from "./avatar25Motion"
import { seatedCardStrips, seatedShinBandRows } from "./avatar25SeatedLegs"
import { legMaskRange, legMaskVertices, legPlan, UNORM16, type LegMaskVertex } from "./avatar25Legs"
import { breathCurve, compileBlink, compileBreath, type CompiledBlink, type CompiledBreath } from "./avatar25Life"

export { legPlan } from "./avatar25Legs"

export const POSE_BITS: Record<Avatar25Pose, number> = { stand: 1, walk: 2, sit: 4, wave: 8 }
export const PALETTE_STRIDE = 8
/** The torso layer's drawings (one mesh, one range each). */
const TORSO_RANGES = new Set(["torso", "torsoUpper", "torsoNoArms", "torsoSit", "torsoCardArms", "torsoWalk"])
const ARM_SWING = 0.14
const WAVE_TIME = 1.7
const LUT_BINS = 512
const SLOT_ORDER_ALL = 15

export interface CompiledView {
  name: Avatar25ViewName
  boneCount: number
  slotCount: number
  parent: number[]
  /** Rest local translation per bone (bill px). */
  restLocal: number[]
  /** Rest head per bone (bill px), the bind pose. */
  head: number[]
  index: Record<string, number>
  /** Per side [near, far]: upper arm, fore arm, thigh, shin, outward sign. */
  sides: { ua: number; fa: number; th: number; sh: number; out: number; name: "near" | "far" }[]
  walk: { n: number; lut: number[]; drop: number[]; legPhase: number; forward: number; strideLen: number }
  sitFold: string[]
  sitArmTurn: Record<string, number>
  /** No painted walk: the standing drawing's own skinned legs step (doll25 fallback). */
  skinnedWalk: boolean
  /** The retargeted walk (lab40), or null: then the painted walk or the skinned fallback walks as before. */
  motion: CompiledMotion | null
  /**
   * Sheet px the worn shoes' soles lift the body standing, walking with the skinned legs and waving (doll25
   * soleLift: the highest `lift` of the worn items). 0 for a bare view; set by compileAvatar for its items.
   */
  soleLift: number
  /** Bill px of the seated anchor: the seat point's x, the seated soles' y. */
  seat: [number, number]
  /** Shoulder pivot of the raised-arm card, bill px. */
  wave: { pivot: [number, number]; out: number }
  ground: [number, number]
  height: number
  /** Idle breathing, or null (the rig view has none: it idles as before). */
  breath: CompiledBreath | null
  /** Blinking, or null (no eyes in this view, or the rig has none). */
  blink: CompiledBlink | null
}

/**
 * Index-buffer variants: one contiguous range per pose (and per walk frame), already in painter's order. With a
 * retargeted walk there are two walk variants: WALK0 the drawing's own leg depth order, WALK1 the far leg in front.
 */
export const VARIANT_STAND = 0
export const VARIANT_SIT = 1
export const VARIANT_WAVE = 2
export const VARIANT_WALK0 = 3

export interface CompiledAvatar {
  view: CompiledView
  itemIds: string[]
  /**
   * Interleaved vertices, 32 bytes each: pos f32×2, uv f32×2, joints u8×4, weights unorm8×4, page/arm/mask page/mask
   * on u8×4, mask uv unorm16×2 (a composed leg: the shoes' leg drawing whose coverage gates this one, see `legPlan`).
   */
  vertexData: ArrayBuffer
  indexData: Uint32Array
  /** [start, count] per variant (VARIANT_*): one indexed draw shows the whole avatar in that pose. */
  variants: number[]
  pages: string[]
}

export const AVATAR25_VERTEX_STRIDE = 32

export function compileView(name: Avatar25ViewName, v: Rig25View): CompiledView {
  const [gx, gy] = v.ground
  const P = (p: [number, number]) => [p[0] - gx, -(p[1] - gy)]
  const index: Record<string, number> = {}
  v.bones.forEach((b, i) => { index[b.name] = i })
  const head: number[] = []
  const restLocal: number[] = []
  v.bones.forEach((b) => {
    const h = P(b.head)
    head.push(h[0], h[1])
    if (b.parent < 0) restLocal.push(h[0], h[1])
    else {
      const ph = P(v.bones[b.parent].head)
      restLocal.push(h[0] - ph[0], h[1] - ph[1])
    }
  })
  const chestX = v.bones[index.chest].head[0]
  const sides = (["near", "far"] as const).map((sd) => ({
    name: sd,
    ua: index[`upperArm_${sd}`],
    fa: index[`foreArm_${sd}`],
    th: index[`thigh_${sd}`],
    sh: index[`shin_${sd}`],
    out: v.bones[index[`upperArm_${sd}`]].head[0] < chestX ? -1 : 1
  }))
  const n = v.walk.frames.length
  const start = v.walk.start
  const lut: number[] = []
  for (let b = 0; b < LUT_BINS; b++) {
    const u = b / LUT_BINS
    let i = n - 1
    while (i > 0 && start[i] > u) i--
    const end = i + 1 < n ? start[i + 1] : 1
    const len = end - start[i] || 1 / n
    lut.push(i + Math.min(1, (u - start[i]) / len))
  }
  // seated, the card hangs from the seat point with its soles on the floor line (doll25 qa: seatH = feetDrop)
  const seat = [P(v.sit.seat)[0], P(v.sit.feet)[1]]
  return {
    name,
    boneCount: v.bones.length,
    // bones, ROOT, WAVE, SEATED LEGS (the seated cards' cuffs and shoes, moved down by `sitLegDrop`)
    slotCount: v.bones.length + 3,
    parent: v.bones.map((b) => b.parent),
    restLocal,
    head,
    index,
    sides,
    walk: {
      n,
      lut,
      drop: v.walk.frames.map((f) => f.drop),
      legPhase: v.walk.legPhase,
      forward: v.walk.forward,
      strideLen: v.walk.strideLen
    },
    sitFold: v.sit.fold,
    sitArmTurn: v.sit.armTurn,
    skinnedWalk: n === 0,
    motion: compileMotion(v, name),
    soleLift: 0,
    seat: [seat[0], seat[1]],
    wave: { pivot: P(v.wave.pivot) as [number, number], out: v.wave.out },
    ground: v.ground,
    height: v.height,
    breath: compileBreath(v),
    blink: name === "front" ? compileBlink(v) : null
  }
}

/** Which poses show each body range (doll25 applyPose). */
function bodyPoseMask(name: string, has: Set<string>, v: Rig25View, motion: boolean): { mask: number; frame: number } {
  if (motion) return bodyPoseMaskMotion(name, has, v)
  const m = bodyPoseMaskPainted(name, has, v)
  // no painted walk: walking shows exactly what standing shows (legs, full torso), posed by the skeleton
  if (v.walk.frames.length === 0) m.mask = (m.mask & ~POSE_BITS.walk) | (m.mask & POSE_BITS.stand ? POSE_BITS.walk : 0)
  return m
}

/**
 * With the retargeted walk (lab40 applyPose): walking shows the standing drawing's own legs and its walking torso
 * (`torsoWalk`, else the full standing torso); painted walk cards, if any, are never drawn.
 */
function bodyPoseMaskMotion(name: string, has: Set<string>, v: Rig25View): { mask: number; frame: number } {
  const { walk } = POSE_BITS
  if (/^walk\d+$/.test(name)) return { mask: 0, frame: -1 }
  const m = bodyPoseMaskPainted(name, has, v)
  const walkTorso = has.has("torsoWalk") ? "torsoWalk" : "torso"
  if (TORSO_RANGES.has(name) && name !== walkTorso) m.mask &= ~walk
  if (name === "farLeg" || name === "nearLeg" || name === walkTorso) m.mask |= walk
  return m
}

function bodyPoseMaskPainted(name: string, has: Set<string>, v: Rig25View): { mask: number; frame: number } {
  const { stand, walk, sit, wave } = POSE_BITS
  const cardArms = v.sit.cardArms ?? []
  const seatedTorso = cardArms.length > 0 && has.has("torsoCardArms")
    ? "torsoCardArms"
    : has.has("torsoSit") ? "torsoSit" : "torsoUpper"

  const walkMatch = /^walk(\d+)$/.exec(name)
  if (walkMatch) return { mask: walk, frame: Number(walkMatch[1]) }
  switch (name) {
    case "farLeg":
    case "nearLeg": return { mask: stand | wave, frame: -1 }
    case "torso": return { mask: stand | (has.has("torsoNoArms") ? 0 : wave), frame: -1 }
    case "torsoUpper": return { mask: walk | (seatedTorso === "torsoUpper" ? sit : 0), frame: -1 }
    case "torsoNoArms": return { mask: wave, frame: -1 }
    case "torsoSit": return { mask: seatedTorso === "torsoSit" ? sit : 0, frame: -1 }
    case "torsoCardArms": return { mask: seatedTorso === "torsoCardArms" ? sit : 0, frame: -1 }
    // the walking torso shows only while the retargeted walk plays (bodyPoseMaskMotion)
    case "torsoWalk": return { mask: 0, frame: -1 }
    case "farArm": return { mask: stand | walk | wave | (cardArms.includes("far") || v.sit.hideArms ? 0 : sit), frame: -1 }
    case "nearArm": return { mask: stand | walk | (cardArms.includes("near") || v.sit.hideArms ? 0 : sit), frame: -1 }
    case "sit": return { mask: sit, frame: -1 }
    case "wave": return { mask: wave, frame: -1 }
    default: return { mask: SLOT_ORDER_ALL, frame: -1 }
  }
}

function itemPoseMask(range: Rig25Mesh["ranges"][number], v: Rig25View, motion: boolean): { mask: number; frame: number } {
  const { walk, sit, wave } = POSE_BITS
  // the retargeted walk poses the standing parts (trousers and shoes on the legs too), like the skinned fallback
  const skinnedWalk = v.walk.frames.length === 0 || motion
  const cardArms = v.sit.cardArms ?? []
  const walkMatch = /^walk(\d+)$/.exec(range.name)
  if (walkMatch) return motion ? { mask: 0, frame: -1 } : { mask: walk, frame: Number(walkMatch[1]) }
  if (range.name === "sit") return { mask: sit, frame: -1 }
  if (range.name === "wave") return { mask: wave, frame: -1 }
  let mask = SLOT_ORDER_ALL
  // a part drawn in some poses only (lab40 doll25 `poseOnly`), on top of every other rule
  if (range.poseOnly) mask &= range.poseOnly.reduce((m, pose) => m | (POSE_BITS[pose] ?? 0), 0)
  if (range.standOnly) mask &= ~(sit | (skinnedWalk ? 0 : walk))
  if (range.layer === "nearArm") mask &= ~wave
  // seated, a sleeve hides only when its standing arm is gone and the seated drawing brings no arm for that side
  // (lab40 doll25 `hideF = noArms && !ca.includes('far')`): over a drawn seated arm the item's own sleeve stays on
  if (v.sit.hideArms && (range.layer === "nearArm" || range.layer === "farArm") &&
    !cardArms.includes(range.layer === "nearArm" ? "near" : "far")) mask &= ~sit
  return { mask, frame: -1 }
}

function packVertices(meshes: Rig25Mesh[], layerOfPage: Map<number, number>, masks: Map<number, LegMaskVertex> = new Map()): ArrayBuffer {
  const total = meshes.reduce((n, m) => n + m.pos.length / 2, 0)
  const buffer = new ArrayBuffer(total * AVATAR25_VERTEX_STRIDE)
  const f = new Float32Array(buffer)
  const b = new Uint8Array(buffer)
  const h = new Uint16Array(buffer)
  let v = 0
  for (const mesh of meshes) {
    const count = mesh.pos.length / 2
    for (let i = 0; i < count; i++, v++) {
      const fo = v * 8, bo = v * AVATAR25_VERTEX_STRIDE
      f[fo] = mesh.pos[i * 2]
      f[fo + 1] = mesh.pos[i * 2 + 1]
      f[fo + 2] = mesh.uv[i * 2]
      f[fo + 3] = mesh.uv[i * 2 + 1]
      const weights = [0, 1, 2, 3].map((k) => Math.round(mesh.weights[i * 4 + k] * 255))
      // the four weights sum to exactly 255 so no vertex shrinks toward the origin
      weights[0] += 255 - weights.reduce((s, x) => s + x, 0)
      for (let k = 0; k < 4; k++) {
        b[bo + 16 + k] = mesh.joints[i * 4 + k]
        b[bo + 20 + k] = weights[k]
      }
      b[bo + 24] = layerOfPage.get(mesh.page[i]) ?? 0
      b[bo + 25] = mesh.arm[i]
      const mask = masks.get(v)
      if (mask) {
        b[bo + 26] = layerOfPage.get(mask.page) ?? 0
        b[bo + 27] = 1
        h[(bo + 28) / 2] = Math.round(Math.min(1, Math.max(0, mask.u)) * UNORM16)
        h[(bo + 30) / 2] = Math.round(Math.min(1, Math.max(0, mask.v)) * UNORM16)
      }
    }
  }
  return buffer
}

/** Whether the item carries usable mirror cards (`mirrorUv` as long as `mesh.uv`). */
function hasMirrorCards(item: Rig25Item): item is Rig25Item & { mirrorUv: number[] } {
  return item.mirrorUv !== undefined && item.mirrorUv.length === item.mesh.uv.length
}

/**
 * The mesh an item is drawn with. Mirrored directions use the item's mirror cards for the marked parts (their uv,
 * and `mirrorPage` when the cards live on another page); every other vertex, and every item without cards, keeps
 * today's mesh, so the unmarked path is the same object, not a copy.
 */
export function itemMeshFor(item: Rig25Item, mirrored: boolean): Rig25Mesh {
  if (!mirrored || !hasMirrorCards(item)) return item.mesh
  const { uv, page } = item.mesh
  const cardPage = item.mirrorPage
  const isMarked = (i: number) => item.mirrorUv[i * 2] !== uv[i * 2] || item.mirrorUv[i * 2 + 1] !== uv[i * 2 + 1]
  return {
    ...item.mesh,
    uv: item.mirrorUv,
    page: cardPage === undefined ? page : page.map((p, i) => (isMarked(i) ? cardPage : p))
  }
}

/**
 * True when some worn item has mirror cards for this view, so a mirrored drawing differs from the flipped one.
 * `allowCards` false (a baked still sits under the canvas, see AvatarHero) never builds a mirrored drawing: the still
 * is only ever the plain flip, and the live view must flip the same way or the marker swaps sides at the cross-fade.
 */
export function avatar25HasMirrorCards(rig: Rig25, viewName: Avatar25ViewName, itemIds: string[], allowCards = true): boolean {
  if (!allowCards) return false
  const items = rig.views[viewName].items
  return itemIds.some((id) => items[id] !== undefined && hasMirrorCards(items[id]))
}

/**
 * Whether the drawing the viewer sees is mirrored: `mirror` is the flip this renderer applies (AvatarLive already
 * compensates for a flip outside it), `outerMirror` the one the surrounding renderer adds, so the two cancel out when
 * both are set. The mirror cards are drawn exactly when this is true.
 */
export function avatar25MirroredOnScreen(mirror: boolean, outerMirror: boolean): boolean {
  "worklet"
  return mirror !== outerMirror
}

/**
 * The GPU view to draw for a facing: the mirrored one when this direction is mirrored and one was built (only avatars
 * that wear mirror cards have them), else the plain view, which the transform flips.
 */
export function pickAvatar25View<T>(views: readonly T[], mirrorViews: readonly (T | undefined)[], viewIndex: number, mirror: boolean): T {
  "worklet"
  return (mirror ? mirrorViews[viewIndex] : undefined) ?? views[viewIndex] ?? views[0]
}

/**
 * One avatar (a view plus worn items) as a single vertex buffer and one index buffer holding, per pose and walk
 * frame, the visible ranges in painter's order (doll25 renderOrder). Drawing it is one drawIndexed call.
 * `mirrored` builds the drawing for a mirrored direction (the transform still flips it): worn items with mirror cards
 * sample them (see `itemMeshFor`). Geometry, weights and draw order are the same either way.
 * `withCardPages` adds the pages the cards overflowed to even when drawing the plain view: an avatar that has both
 * drawings then holds ONE page set, hence one texture array (and one ASTC set) instead of a second array that
 * re-uploads the body and item pages just to add the card page.
 */
export function compileAvatar(
  rig: Rig25,
  viewName: Avatar25ViewName,
  itemIds: string[],
  mirrored = false,
  withCardPages = mirrored
): CompiledAvatar {
  const v = rig.views[viewName]
  const view = compileView(viewName, v)
  const motion = view.motion !== null
  const has = new Set(v.mesh.ranges.map((r) => r.name))
  const worn = itemIds.filter((id) => v.items[id])
  const meshes = [v.mesh, ...worn.map((id) => itemMeshFor(v.items[id], mirrored))]
  // the seated cards are drawn as strips whose shins stretch, so her soles reach the floor at any height
  // (avatar25SeatedLegs); packed after every other vertex
  const band = seatedShinBandRows(v)
  const strips = meshes.map((mesh) => seatedCardStrips(mesh, band, v.bones.length, v.bones.length + 2))
  // only the pages this avatar draws are loaded: rig page → texture-array layer
  const cardPages = withCardPages
    ? worn.map((id) => v.items[id]).flatMap((item) => (hasMirrorCards(item) && item.mirrorPage !== undefined ? [item.mirrorPage] : []))
    : []
  const usedPages = [...new Set([0, ...worn.map((id) => v.items[id].page), ...cardPages])].sort((a, b) => a - b)
  const layerOfPage = new Map(usedPages.map((page, layer) => [page, layer]))
  const base: number[] = []
  const vertexTotal = meshes.reduce((n, m) => { base.push(n); return n + m.pos.length / 2 }, 0)
  const entries = buildDrawEntries(v, worn, motion, has)
  const n = v.walk.frames.length
  const keys: DrawKey[] = [
    { bit: POSE_BITS.stand, frame: -1, farFront: false, walkWeights: false },
    { bit: POSE_BITS.sit, frame: -1, farFront: false, walkWeights: false },
    { bit: POSE_BITS.wave, frame: -1, farFront: false, walkWeights: false },
    ...(motion
      // retargeted walk: the drawing's own leg order, then the far leg in front (lab40 setLegOrder)
      ? [false, true].map((farFront) => ({ bit: POSE_BITS.walk, frame: -1, farFront, walkWeights: true }))
      : Array.from({ length: Math.max(1, n) }, (_, i) => ({ bit: POSE_BITS.walk, frame: n ? i : -1, farFront: false, walkWeights: false })))
  ]
  // walking, the torso and the items take their walk weights (baked by lab40 fix_rig.py; without them the crotch
  // fabric is re-weighted here, lab40 seatWeights): those vertices are duplicated with the walk weights, and only
  // the walk variants index the duplicates
  const extra = motion ? walkWeightedCopies(v, meshes, base, entries) : null
  const stripMeshes: Rig25Mesh[] = []
  const stripIndices = new Map<number, number[]>()
  let stripBase = vertexTotal + (extra ? extra.mesh.pos.length / 2 : 0)
  strips.forEach((mesh, set) => {
    if (!mesh) return
    stripIndices.set(set, mesh.index.map((i) => i + stripBase))
    stripMeshes.push(mesh)
    stripBase += mesh.pos.length / 2
  })
  const indices: number[] = []
  const variants: number[] = []
  for (const key of keys) {
    const start = indices.length
    const order = (e: DrawEntry) => e.order + (key.farFront && e.leg ? (e.leg === "farLeg" ? 1 : -1) : 0)
    const visible = entries
      .filter((e) => (e.mask & key.bit) !== 0 && (e.frame < 0 || e.frame === key.frame))
      .sort((a, b) => order(a) - order(b) || a.seq - b.seq)
    for (const e of visible) {
      const seated = e.seated ? stripIndices.get(e.set) : undefined
      if (seated) {
        indices.push(...seated)
        continue
      }
      const src = meshes[e.set].index
      for (let i = e.start; i < e.start + e.count; i++) {
        const g = src[i] + base[e.set]
        const copy = key.walkWeights && (e.walkBaked || e.seat) && extra ? extra.remap.get(g) : undefined
        indices.push(copy === undefined ? g : vertexTotal + copy)
      }
    }
    variants.push(start, indices.length - start)
  }
  return {
    view: { ...view, soleLift: Math.max(0, ...worn.map((id) => v.items[id].lift ?? 0)) },
    itemIds: worn,
    vertexData: packVertices([...meshes, ...(extra ? [extra.mesh] : []), ...stripMeshes], layerOfPage, legMaskVertices(entries, meshes, base)),
    indexData: Uint32Array.from(indices),
    variants,
    pages: usedPages.map((page) => v.pages[page])
  }
}

/**
 * Every drawn range of the body and the worn items with its pose mask and painter's order (doll25 renderOrder):
 * the one source of draw order for the live renderer and the still baker (tools/avatar25d/bake-stills.mjs).
 */
function buildDrawEntries(v: Rig25View, worn: string[], motion: boolean, has: Set<string>): DrawEntry[] {
  // the bare legs drawn for what is worn
  const plan = legPlan(v, worn)
  const drawnLeg = (k: number, r: Rig25Range) => plan !== null && plan.set === k + 1 && r.legVariant === plan.key && Boolean(r.layer)
  const replacedLegs = new Set<string>()
  worn.forEach((id, k) => {
    for (const r of v.items[id].mesh.ranges) if (drawnLeg(k, r)) replacedLegs.add(r.layer as string)
  })
  const entries: DrawEntry[] = []
  let seq = 0
  for (const r of v.mesh.ranges) {
    const pm = bodyPoseMask(r.name, has, v, motion)
    const leg = r.name === "farLeg" || r.name === "nearLeg" ? r.name : null
    entries.push({
      set: 0, start: r.start, count: r.count, mask: leg && replacedLegs.has(leg) ? 0 : pm.mask, frame: pm.frame,
      order: r.order, seq: seq++, leg,
      // lab40 setWalkWeights: the torso layer and every item piece take their baked walk weights while walking
      walkBaked: Boolean(r.walk) && TORSO_RANGES.has(r.name),
      seat: TORSO_RANGES.has(r.name),
      seated: r.name === "sit"
    })
  }
  worn.forEach((id, k) => {
    const item = v.items[id]
    for (const r of item.mesh.ranges) {
      const leg = r.layer === "farLeg" || r.layer === "nearLeg" ? r.layer : null
      // a leg drawing for what is worn is drawn exactly as the body leg it replaces; the others are not drawn
      const pm = r.legVariant !== undefined
        ? drawnLeg(k, r) && leg ? bodyPoseMask(leg, has, v, motion) : { mask: 0, frame: -1 }
        : itemPoseMask(r, v, motion)
      const maskRange = drawnLeg(k, r) && plan?.mask ? legMaskRange(item.mesh, v.items[worn[plan.mask - 1]].mesh, plan.mask, r) : null
      entries.push({
        set: k + 1, start: r.start, count: r.count, mask: pm.mask, frame: pm.frame, order: r.order, seq: seq++, leg,
        walkBaked: Boolean(r.walk) && r.legVariant === undefined,
        seat: item.slot === "bottom" && r.layer === "torso",
        seated: r.name === "sit",
        ...(maskRange ? { legMask: maskRange } : {})
      })
    }
  })
  return entries
}

/** One drawn range of the stand pose, in painter's order: whose it is, its order and its triangles (mesh-local). */
export interface Avatar25StandEntry {
  /** "body", or the worn rig item id. */
  owner: string
  order: number
  seq: number
  /** The worn-items key this range is drawn for (a leg drawing owned by an item), else undefined. */
  legVariant?: string
  /**
   * A composed leg: the worn shoes whose own leg drawing gates this one's coverage (drawn where both are), and the
   * offset from this range's vertices to the same vertices of that drawing (mesh-local, the shoes' mesh).
   */
  legMask?: { owner: string; vertexOffset: number }
  /** The leg layer this range is drawn on (a body leg, or an item piece on it), else null. */
  leg: "farLeg" | "nearLeg" | null
  /** Mesh-local triangle indices of this range. */
  index: number[]
}

/**
 * The stand pose's visible ranges for this worn set, sorted exactly as `compileAvatar` draws them (order, then
 * seq). Pure: the still baker and the still-order test read it, so a still and live frame 0 never drift.
 */
export function avatar25StandEntries(rig: Rig25, viewName: Avatar25ViewName, itemIds: string[]): Avatar25StandEntry[] {
  const v = rig.views[viewName]
  const motion = compileView(viewName, v).motion !== null
  const has = new Set(v.mesh.ranges.map((r) => r.name))
  const worn = itemIds.filter((id) => v.items[id])
  const meshes = [v.mesh, ...worn.map((id) => v.items[id].mesh)]
  const ranges = [v.mesh.ranges, ...worn.map((id) => v.items[id].mesh.ranges)]
  const entries = buildDrawEntries(v, worn, motion, has)
  const rangeAt = new Map<string, (typeof ranges)[number][number]>()
  ranges.forEach((list, set) => list.forEach((r) => rangeAt.set(`${set}:${r.start}`, r)))
  return entries
    .filter((e) => (e.mask & POSE_BITS.stand) !== 0 && e.frame < 0)
    .sort((a, b) => a.order - b.order || a.seq - b.seq)
    .map((e) => ({
      owner: e.set === 0 ? "body" : worn[e.set - 1]!,
      order: e.order,
      seq: e.seq,
      legVariant: rangeAt.get(`${e.set}:${e.start}`)?.legVariant,
      ...(e.legMask ? { legMask: { owner: worn[e.legMask.set - 1]!, vertexOffset: e.legMask.vertexOffset } } : {}),
      leg: e.leg,
      index: meshes[e.set].index.slice(e.start, e.start + e.count)
    }))
}

interface DrawEntry {
  set: number
  start: number
  count: number
  mask: number
  frame: number
  order: number
  seq: number
  /** Leg layer this range is drawn on (body leg or an item piece on it): its depth swaps with the other leg. */
  leg: "farLeg" | "nearLeg" | null
  /** Skinned with the mesh's baked walk weights while the retargeted walk plays. */
  walkBaked: boolean
  /** Crotch fabric: without baked walk weights, re-weighted to the thighs while the retargeted walk plays. */
  seat: boolean
  /** The seated card (range "sit"): drawn from its strips when it has them. */
  seated: boolean
  /** A composed leg (see `legPlan`): the mesh set of the gating drawing and the vertex offset into it. */
  legMask?: { set: number; vertexOffset: number }
}

interface DrawKey {
  bit: number
  frame: number
  farFront: boolean
  walkWeights: boolean
}


/** The worn-items key of the leg drawings (lab40 wear()): 'bottom', 'shoes', 'bottom+shoes', or '' for neither. */
export function wornLegKey(slots: string[]): string {
  return ["bottom", "shoes"].filter((slot) => slots.includes(slot)).join("+")
}

/**
 * Copies, with their walk weights, of every vertex the walk draws from a re-weighted range (baked weights, or the
 * computed crotch weights where none are baked); remap: packed vertex → copy index.
 */
function walkWeightedCopies(v: Rig25View, meshes: Rig25Mesh[], base: number[], entries: DrawEntry[]) {
  const weigh = seatWeights(v)
  const mesh: Rig25Mesh = { pos: [], uv: [], joints: [], weights: [], index: [], page: [], arm: [], ranges: [] }
  const remap = new Map<number, number>()
  for (const e of entries) {
    const src = meshes[e.set]
    const baked = e.walkBaked && src.walkJoints !== undefined && src.walkWeights !== undefined
    if ((!baked && !e.seat) || (e.mask & POSE_BITS.walk) === 0) continue
    for (let i = e.start; i < e.start + e.count; i++) {
      const local = src.index[i]
      const g = local + base[e.set]
      if (remap.has(g)) continue
      remap.set(g, mesh.page.length)
      const x = src.pos[local * 2], y = src.pos[local * 2 + 1]
      const w = baked
        ? { joints: (src.walkJoints as number[]).slice(local * 4, local * 4 + 4), weights: (src.walkWeights as number[]).slice(local * 4, local * 4 + 4) }
        : weigh(x, y, src.joints.slice(local * 4, local * 4 + 4), src.weights.slice(local * 4, local * 4 + 4))
      mesh.pos.push(x, y)
      mesh.uv.push(src.uv[local * 2], src.uv[local * 2 + 1])
      mesh.joints.push(...w.joints)
      mesh.weights.push(...w.weights)
      mesh.page.push(src.page[local])
      mesh.arm.push(src.arm[local])
    }
  }
  return { mesh, remap }
}

/** The index-buffer variant for a pose (and walk frame). */
export function poseVariant(pose: Avatar25Pose, frame: number): number {
  "worklet"
  if (pose === "walk") return VARIANT_WALK0 + Math.max(0, frame)
  if (pose === "sit") return VARIANT_SIT
  if (pose === "wave") return VARIANT_WAVE
  return VARIANT_STAND
}

export interface PoseInput {
  pose: Avatar25Pose
  /** Seconds, for breathing / look / wave. */
  time: number
  /** Walk cycle phase in cycles (1.0 = one full cycle; grows with distance walked). */
  walkCycles: number
  /** 0..1 walk weight (arm swing amount while speeding up / slowing down). */
  walkWeight: number
  /** 0..1 sit-down progress while the standing drawing still shows (the knees bend first); 0 otherwise. */
  sitWeight?: number
  /** Seconds since the wave began. */
  waveTime: number
  /** Seated: bill px her soles (and everything below the shin band) move down; 0 / absent = the drawing as is. */
  sitLegDrop?: number
  reduceMotion: boolean
  /**
   * 0..1 how much the avatar breathes now (eased by the caller: 1 standing or seated, 0 walking or waving). Absent
   * or 0, or a view without `breath`: the idle is exactly the one from before breathing existed.
   */
  breathWeight?: number
  /** This avatar's place in the breath cycle (cycles): two avatars with different phases never breathe in step. */
  breathPhase?: number
  /** A fixed breath (0 out, 1 in) instead of the clock's, for tests and the still baker; absent or < 0 = the clock. */
  breathHold?: number
}

/** The idle sway (-1..1) and the breathing rise (0..1) of this frame. */
function writeBreath(view: CompiledView, input: PoseInput, out: Float32Array | number[]): void {
  "worklet"
  out[0] = 0
  out[1] = 0
  if (input.reduceMotion) return
  const legacy = Math.sin(input.time * 2.0)
  out[0] = legacy
  const cfg = view.breath
  const w = cfg === null ? 0 : Math.min(1, Math.max(0, input.breathWeight ?? 0))
  if (cfg === null || w <= 0) return
  const hold = input.breathHold ?? -1
  const b = hold >= 0 ? Math.min(1, hold) : breathCurve(cfg.periodS, cfg.inhale, input.time, input.breathPhase ?? 0)
  // sway and rise share one rhythm while she breathes (lab: br = 2b - 1)
  out[0] = legacy + (2 * b - 1 - legacy) * w
  out[1] = b * w
}

/** Continuous frame position for a walk cycle fraction (doll25 lut). */
export function walkFramePosition(view: CompiledView, walkCycles: number): number {
  "worklet"
  if (view.walk.n === 0) return -1
  const u = walkCycles - Math.floor(walkCycles)
  const lut = view.walk.lut
  return lut[Math.min(lut.length - 1, Math.floor(u * lut.length))]
}

export function walkFrameIndex(view: CompiledView, walkCycles: number): number {
  "worklet"
  if (view.walk.n === 0) return -1
  return Math.round(walkFramePosition(view, walkCycles)) % view.walk.n
}

// worklets capture what exists when they are defined: these come before writeAvatarPalette
/**
 * Whether the retargeted walk poses the avatar now: walking, settling after a walk (lab40 motionOn), and bending
 * the knees on the way down to a seat before the seated drawing shows.
 */
export function motionActive(view: CompiledView, pose: Avatar25Pose, walkWeight: number, sitWeight = 0): boolean {
  "worklet"
  return view.motion !== null && (pose === "walk" || (pose === "stand" && (walkWeight > MOTION_ON_WEIGHT || sitWeight > 0)))
}

/** The index-buffer variant to draw for what writeAvatarPalette posed (it returned `frame`). */
export function avatarVariant(view: CompiledView, pose: Avatar25Pose, walkWeight: number, frame: number, sitWeight = 0): number {
  "worklet"
  if (motionActive(view, pose, walkWeight, sitWeight)) return VARIANT_WALK0 + (frame === 1 ? 1 : 0)
  return poseVariant(pose, frame)
}

/**
 * The retargeted walk at this phase, blended in with the walk weight, with the standing idle fading out; written
 * as the bone palette (plus the identity ROOT / WAVE slots). Returns 0 (near leg in front) or 1 (far leg in front).
 */
function writeMotionAvatarPalette(
  view: CompiledView,
  m: CompiledMotion,
  input: PoseInput,
  palette: Float32Array,
  clip: Float32Array | undefined,
  scratch: Float32Array | undefined
): number {
  "worklet"
  const length = m.boneCount * 2 + 2
  const pose = scratch !== undefined && scratch.length >= length ? scratch : new Float32Array(length)
  const k = motionBlend(input.walkWeight)
  const nearFront = sampleMotion(m, input.walkCycles, k, pose)
  const t = input.time
  const life = [0, 0]
  writeBreath(view, input, life)
  const look = input.reduceMotion ? 0 : 0.045 * Math.sin(t * 0.41) * Math.sin(t * 0.173 + 1.3)
  addMotionIdle(m, pose, 1 - k, life[0], look)
  addMotionBreath(m, pose, life[1] * (1 - k))
  if (input.pose === "stand") addMotionSitBend(m, pose, (input.sitWeight ?? 0) * SIT_BEND_SHARE)
  writeMotionPalette(m, pose, palette)
  if (clip) {
    clip[0] = -1e9
    clip[1] = -1e9
  }
  const n = view.boneCount
  for (let slot = n; slot < n + 3; slot++) {
    const o = slot * PALETTE_STRIDE
    palette[o] = 1; palette[o + 1] = 0; palette[o + 2] = 0; palette[o + 3] = 0
    palette[o + 4] = 0; palette[o + 5] = 1; palette[o + 6] = 0; palette[o + 7] = 0
  }
  return nearFront === 1 ? 0 : 1
}

/**
 * Fills `palette` (slotCount × 8 floats) with the skinning matrices for this pose and returns the walk frame
 * shown (or -1). Port of doll25 `pose()`; `B.hips.position.y -= drop` etc. map 1:1.
 */
export function writeAvatarPalette(
  view: CompiledView,
  input: PoseInput,
  palette: Float32Array,
  clip?: Float32Array,
  /** Reusable pose buffer for the retargeted walk (≥ motionPoseLength); allocated when absent. */
  scratch?: Float32Array
): number {
  "worklet"
  if (view.motion !== null && motionActive(view, input.pose, input.walkWeight, input.sitWeight ?? 0)) {
    return writeMotionAvatarPalette(view, view.motion, input, palette, clip, scratch)
  }
  const n = view.boneCount
  // local pose: extra translation (x, y), rotation, scale (sx, sy) per bone
  const tx = new Float32Array(n), ty = new Float32Array(n), rot = new Float32Array(n)
  const sx = new Float32Array(n).fill(1), sy = new Float32Array(n).fill(1)
  const fwd = view.walk.forward
  const life = [0, 0]
  writeBreath(view, input, life)
  const br = life[0]
  const idx = view.index
  let frame = -1
  let waveSwing = 0
  if (input.pose === "walk" && view.skinnedWalk) {
    // no painted walk yet: the standing drawing's own legs step (doll25 fallback, 1:1)
    const ph = input.walkCycles * 2 * Math.PI
    const k = Math.min(1, input.walkWeight * 1.4)
    for (let s = 0; s < view.sides.length; s++) {
      const sd = view.sides[s]
      const near = sd.name === "near"
      const sw = (near ? 1 : -1) * Math.sin(ph)
      const lift = Math.max(0, Math.sin(ph + (near ? 0 : Math.PI) + Math.PI / 2))
      rot[sd.th] = fwd * 0.30 * sw * k
      rot[sd.sh] = -fwd * 0.40 * lift * k
      rot[sd.ua] = -fwd * ARM_SWING * sw * k
    }
    ty[idx.hips] += 0.012 * view.height * (0.5 - 0.5 * Math.cos(2 * ph)) * k
  } else if (input.pose === "walk") {
    const fpos = walkFramePosition(view, input.walkCycles)
    frame = Math.round(fpos) % view.walk.n
    ty[idx.hips] -= view.walk.drop[frame]
    const k = Math.min(1, input.walkWeight * 1.4)
    const nearLeg = Math.sin((fpos / view.walk.n) * 2 * Math.PI + view.walk.legPhase)
    for (let s = 0; s < view.sides.length; s++) {
      const sd = view.sides[s]
      const arm = (sd.name === "near" ? -nearLeg : nearLeg) * k
      rot[sd.ua] = fwd * ARM_SWING * arm
      rot[sd.fa] = fwd * 0.08 * Math.max(0, arm)
    }
  } else if (input.pose === "sit") {
    for (let s = 0; s < view.sides.length; s++) {
      const sd = view.sides[s]
      if (view.sitFold.indexOf(sd.name) >= 0) {
        sx[sd.fa] = 1e-3
        sy[sd.fa] = 1e-3
        rot[sd.ua] = view.sitArmTurn[sd.name] ?? 0
      } else {
        // hands toward the lap (doll25 sit): the near upper arm a little forward, its forearm more. Over a drawn
        // seated arm (cardArms) the standing arm hides but its sleeve stays on and follows these bones
        rot[sd.ua] = sd.name === "near" ? fwd * 0.12 : 0
        rot[sd.fa] = sd.name === "near" ? fwd * 0.35 : -sd.out * 0.12
      }
    }
    rot[idx.chest] = 0.004 * br
  } else if (input.pose === "wave") {
    const p = Math.max(0, input.waveTime)
    const e = Math.min(1, p / 0.25, (WAVE_TIME - p) / 0.25)
    waveSwing = input.reduceMotion ? 0 : -view.wave.out * 0.10 * Math.max(0, e) * Math.sin(p * 9)
  } else {
    for (let s = 0; s < view.sides.length; s++) {
      const sd = view.sides[s]
      rot[sd.ua] = sd.out * 0.015 * br
    }
    rot[idx.chest] = 0.008 * br
    // a small look now and then (doll25 picks random targets; a smooth deterministic drift here)
    const t = input.time
    rot[idx.head] = input.reduceMotion ? 0 : 0.045 * Math.sin(t * 0.41) * Math.sin(t * 0.173 + 1.3)
  }
  // breathing: the listed bones' heads rise in their parent's space, so the chest, shoulders and head ride up
  // together while the hips and legs stay (lab applyBreath); bill px are y up
  if (view.breath !== null && life[1] > 0) {
    const rise = view.breath.rise
    for (let i = 0; i < n; i++) ty[i] += rise[i] * life[1]
  }
  // world = parent · T(rest + t) · R · S ; skin = world · T(-bindHead)
  const wa = new Float32Array(n * 6)
  for (let i = 0; i < n; i++) {
    const c = Math.cos(rot[i]), s = Math.sin(rot[i])
    const la = c * sx[i], lb = s * sx[i], lc = -s * sy[i], ld = c * sy[i]
    const ltx = view.restLocal[i * 2] + tx[i], lty = view.restLocal[i * 2 + 1] + ty[i]
    const p = view.parent[i]
    let a = la, b = lb, cc = lc, d = ld, ex = ltx, ey = lty
    if (p >= 0) {
      const pa = wa[p * 6], pb = wa[p * 6 + 1], pc = wa[p * 6 + 2], pd = wa[p * 6 + 3], pex = wa[p * 6 + 4], pey = wa[p * 6 + 5]
      a = pa * la + pc * lb
      b = pb * la + pd * lb
      cc = pa * lc + pc * ld
      d = pb * lc + pd * ld
      ex = pa * ltx + pc * lty + pex
      ey = pb * ltx + pd * lty + pey
    }
    wa[i * 6] = a; wa[i * 6 + 1] = b; wa[i * 6 + 2] = cc; wa[i * 6 + 3] = d; wa[i * 6 + 4] = ex; wa[i * 6 + 5] = ey
    const hx = view.head[i * 2], hy = view.head[i * 2 + 1]
    const o = i * 8
    palette[o] = a; palette[o + 1] = cc; palette[o + 2] = ex - (a * hx + cc * hy); palette[o + 3] = 0
    palette[o + 4] = b; palette[o + 5] = d; palette[o + 6] = ey - (b * hx + d * hy); palette[o + 7] = 0
  }
  // seated with painted forearms on the lap: each folded side's arm layers are clipped a little under its elbow
  // (doll25 clipFolded), so the collapsed standing forearm leaves no thin stretched triangles. [near, far], bill px.
  if (clip) {
    clip[0] = -1e9
    clip[1] = -1e9
    if (input.pose === "sit") {
      for (let s = 0; s < view.sides.length; s++) {
        const sd = view.sides[s]
        if (view.sitFold.indexOf(sd.name) < 0) continue
        clip[sd.name === "near" ? 0 : 1] = wa[sd.fa * 6 + 5] - 0.012 * view.height
      }
    }
  }
  // ROOT: identity (cards placed in sheet px)
  let o = n * 8
  palette[o] = 1; palette[o + 1] = 0; palette[o + 2] = 0; palette[o + 3] = 0
  palette[o + 4] = 0; palette[o + 5] = 1; palette[o + 6] = 0; palette[o + 7] = 0
  // WAVE: the whole raised arm card swings about the shoulder pivot
  o = (n + 1) * 8
  const c = Math.cos(waveSwing), s = Math.sin(waveSwing)
  const pvx = view.wave.pivot[0], pvy = view.wave.pivot[1]
  palette[o] = c; palette[o + 1] = -s; palette[o + 2] = pvx - (c * pvx - s * pvy); palette[o + 3] = 0
  palette[o + 4] = s; palette[o + 5] = c; palette[o + 6] = pvy - (s * pvx + c * pvy); palette[o + 7] = 0
  // SEATED LEGS: the seated cards below the shin band move straight down (bill px are y up)
  o = (n + 2) * 8
  const legDrop = input.pose === "sit" ? input.sitLegDrop ?? 0 : 0
  palette[o] = 1; palette[o + 1] = 0; palette[o + 2] = 0; palette[o + 3] = 0
  palette[o + 4] = 0; palette[o + 5] = 1; palette[o + 6] = 0 - legDrop; palette[o + 7] = 0
  return frame
}

/** Where the avatar's anchor sits in bill px: the ground point (0,0) standing, the seat point while seated. */
export function poseAnchor(view: CompiledView, pose: Avatar25Pose): [number, number] {
  "worklet"
  return pose === "sit" ? view.seat : [0, 0]
}

/**
 * Clip-space transform for one avatar: bill px → clip, `out` = [sx, sy, ox, oy]. The anchor (the shoes' soles
 * under the ground point, or the seated soles under the seat) lands on (anchorX, anchorY) of a W×H canvas; a
 * mirrored avatar flips in x.
 */
export function writeAvatarClipTransform(
  view: CompiledView,
  pose: Avatar25Pose,
  placement: { mirror: boolean; anchorX: number; anchorY: number; heightPx: number },
  W: number,
  H: number,
  out: Float32Array
): void {
  "worklet"
  const k = placement.heightPx / view.height
  const mir = placement.mirror ? -1 : 1
  const ax = pose === "sit" ? view.seat[0] : 0
  // standing on the shoes' soles: the drawing's bare-foot ground line rises by the sole height (bill px, y up);
  // painted walk cards carry their own soles, and the seated drawing sits on the seat
  const paintedWalk = pose === "walk" && view.motion === null && view.walk.n > 0
  const ay = pose === "sit" ? view.seat[1] : paintedWalk ? 0 : -view.soleLift
  out[0] = 2 * mir * k / W
  out[1] = 2 * k / H
  out[2] = 2 * placement.anchorX - 1 - out[0] * ax
  out[3] = 1 - 2 * placement.anchorY - out[1] * ay
}
