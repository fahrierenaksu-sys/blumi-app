/**
 * Body replacement: worn items that draw a body range in place of the body's own drawing (export_rig.py
 * body_replacements). The black high-waist trousers bring her torso, arms and seated card with the grey shorts
 * trimmed to their silhouette; a crop top brings the shared bare-belly torso (`torso: "midriff"`). Each such range has
 * the body range's mesh and order, so drawn instead of it the avatar looks exactly as the factory lab draws it.
 * Pure; the live renderer and the still baker read it through avatar25Pose.
 */
import type { Rig25Item, Rig25Range, Rig25View } from "./rigTypes"

/** The torso layer's drawings (one mesh, one range each). */
export const TORSO_RANGES: ReadonlySet<string> = new Set(["torso", "torsoUpper", "torsoNoArms", "torsoSit", "torsoCardArms", "torsoWalk"])

/**
 * Families of body ranges an item replaces together (lab doll25: one key picks all torso maps, one the arms, one the
 * seated card). Within a family one worn item wins (see `bodySwapPlan`); the body ranges it has no drawing for stay
 * the body's.
 */
function familyOf(bodyPart: string): "torso" | "arms" | "sit" | null {
  if (TORSO_RANGES.has(bodyPart)) return "torso"
  if (bodyPart === "farArm" || bodyPart === "nearArm") return "arms"
  if (bodyPart === "sit") return "sit"
  return null
}

/** Which worn item's drawing wins a family: a pair over a single item, then top, bottom, shoes, hair, then item id. */
const SLOT_RANK: Record<Rig25Item["slot"], number> = { top: 0, bottom: 1, shoes: 2, hair: 3 }

/** A body range drawn from a worn item: the item's mesh set (1 + index in `worn`) and its range. */
export interface BodySwap {
  set: number
  range: Rig25Range
}

interface Claim {
  set: number
  partner: string | undefined
  rank: [number, number, string]
}

const before = (a: Claim["rank"], b: Claim["rank"]) =>
  a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2]

/**
 * Body range name → the worn item drawing that replaces it. Per family, the winning claim is the best of the worn
 * items' (item, partner) sets whose partner, if any, is worn too (lab precedence `bottom+top`, top, bottom, made
 * total); the winner replaces exactly the body ranges it has drawings for. Empty when nothing worn replaces the body.
 */
export function bodySwapPlan(v: Rig25View, worn: readonly string[]): Map<string, BodySwap> {
  const winners = new Map<string, Claim>()
  worn.forEach((id, k) => {
    const item = v.items[id]
    if (!item) return
    for (const r of item.mesh.ranges) {
      const family = r.bodyPart !== undefined ? familyOf(r.bodyPart) : null
      if (family === null || (r.bodyWith !== undefined && !worn.includes(r.bodyWith))) continue
      const claim: Claim = { set: k + 1, partner: r.bodyWith, rank: [r.bodyWith !== undefined ? 0 : 1, SLOT_RANK[item.slot] ?? 9, id] }
      const best = winners.get(family)
      if (!best || before(claim.rank, best.rank)) winners.set(family, claim)
    }
  })
  const plan = new Map<string, BodySwap>()
  for (const [family, claim] of winners) {
    const ranges = v.items[worn[claim.set - 1]!]!.mesh.ranges
    for (const r of ranges) {
      if (r.bodyPart === undefined || familyOf(r.bodyPart) !== family || r.bodyWith !== claim.partner) continue
      plan.set(r.bodyPart, { set: claim.set, range: r })
    }
  }
  return plan
}

const LOWER_SLOTS: ReadonlySet<string> = new Set(["bottom", "shoes"])

/** True when the torso drawn now bares her waist: the torso family is won by an item marked `torso: "midriff"`. */
export function waistBared(v: Rig25View, worn: readonly string[], plan: Map<string, BodySwap>): boolean {
  for (const swap of plan.values()) {
    if (TORSO_RANGES.has(swap.range.bodyPart as string)) return v.items[worn[swap.set - 1]!]?.torso === "midriff"
  }
  return false
}

/**
 * The painter's order of an item's seated card. Under a bared waist (`waistBared`), bottoms' and shoes' seated cards
 * are drawn above the torso layer, as their standing torso pieces already are (DESIGN_CROP option 2): the waistband
 * covers the belly. Otherwise every card keeps its exported order: with the tank, the QA'd outfits draw the tops'
 * hems over the seated bottoms (raising the bottoms everywhere covered the boy's c3 jacket flap and c12/c13 sweater
 * hems, integration/body_repl_1945/sit_regression_sheet.png). A view whose seated card is in front keeps its order.
 */
export function seatedCardOrder(v: Rig25View, item: Rig25Item, r: Rig25Range, bared: boolean): number {
  if (!bared || r.name !== "sit" || !LOWER_SLOTS.has(item.slot)) return r.order
  const torso = v.mesh.ranges.find((b) => b.name === "torso")
  const bodySit = v.mesh.ranges.find((b) => b.name === "sit")
  if (!torso || !bodySit) return r.order
  return Math.max(r.order, torso.order + (r.order - bodySit.order))
}
