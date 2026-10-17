/**
 * Leg composition: which drawing replaces the bare legs for what is worn, and the gate that lets any bottom be worn
 * with any shoes (the bottom's own leg drawing, drawn only where the shoes' own leg drawing is drawn too).
 * Pure; the GPU shader (avatar25Gpu.ts) and the still baker (tools/avatar25d/bake-stills.mjs) apply the gate.
 */
import type { Rig25Mesh, Rig25Range, Rig25View } from "./rigTypes"

/** A draw range carrying a composed leg's gate (avatar25Pose DrawEntry). */
export interface LegMaskedEntry {
  set: number
  start: number
  count: number
  legMask?: { set: number; vertexOffset: number }
}

/** A composed leg vertex's mask: the uv and page of the same vertex in the shoes' leg drawing. */
export interface LegMaskVertex {
  u: number
  v: number
  page: number
}

export const UNORM16 = 65535

/** Which leg drawing replaces the bare legs: the worn item (mesh set) and range key, and the shoes gating it. */
export interface LegPlan {
  set: number
  key: string
  /** Mesh set of the worn shoes whose 'shoes' drawing gates the bottom's 'bottom' drawing. */
  mask?: number
}

/**
 * The leg drawing for what is worn. Items own their drawings ('bottom' on a bottom, 'shoes' on shoes; export_rig.py
 * leg_variant_owners). A legacy pair drawing ('bottom+shoes', the girl's QA'd one, one item per slot) wins when worn
 * with both and the shoes are the ones it was fitted with (LEGACY_PAIR_SHOES); otherwise a bottom worn with shoes draws its own 'bottom' drawing only where the shoes' 'shoes' drawing
 * is drawn too (the AND of the two coverages, which equals the factory's fitted pair up to a hidden heel rim:
 * WB integration/combo_proof_0750/PROOF.md). One alone draws its own drawing; neither leaves the bare legs.
 */
/**
 * The shoes a legacy pair drawing was fitted and QA'd with (the girl's starter sneakers). Its bare feet are cut to
 * their silhouette, so with any other shoes (an ankle boot) they show past the shoe: those shoes compose instead.
 */
export const LEGACY_PAIR_SHOES: ReadonlySet<string> = new Set(["shoes_mint_ribbon_court_sneakers", "shoes_white_sneakers"])

export function legPlan(v: Rig25View, worn: string[]): LegPlan | null {
  const owns = (k: number, key: string) => k >= 0 && v.items[worn[k]].mesh.ranges.some((r) => r.legVariant === key && r.layer)
  // a one-piece dress is the bottom for the legs (the bare legs under its skirt)
  const bottom = worn.findIndex((id) => v.items[id].slot === "bottom" || v.items[id].slot === "dress")
  const shoes = worn.findIndex((id) => v.items[id].slot === "shoes")
  if (bottom >= 0 && shoes >= 0) {
    const pair = LEGACY_PAIR_SHOES.has(worn[shoes]) ? worn.findIndex((_, k) => owns(k, "bottom+shoes")) : -1
    if (pair >= 0) return { set: pair + 1, key: "bottom+shoes" }
    if (owns(bottom, "bottom") && owns(shoes, "shoes")) return { set: bottom + 1, key: "bottom", mask: shoes + 1 }
  }
  if (owns(bottom, "bottom")) return { set: bottom + 1, key: "bottom" }
  if (owns(shoes, "shoes")) return { set: shoes + 1, key: "shoes" }
  return null
}

let warnedUngated = false

/**
 * The gating range of a composed leg: the shoes' 'shoes' drawing on the same leg. Both are the body leg's own mesh
 * (export_rig.py), so their triangles list the same vertices in the same order; the offset maps one onto the other.
 * Null when the shoes have no drawing for that leg or it is not the same mesh: that one avatar then draws the bottom's
 * leg uncut (never the bare leg, never a failed room), and it is logged once, without IDs.
 */
export function legMaskRange(own: Rig25Mesh, mesh: Rig25Mesh, maskSet: number, r: Rig25Range): { set: number; vertexOffset: number } | null {
  const gate = mesh.ranges.find((m) => m.legVariant === "shoes" && m.layer === r.layer)
  const a = own.index.slice(r.start, r.start + r.count)
  const b = gate ? mesh.index.slice(gate.start, gate.start + gate.count) : []
  const offset = (b[0] ?? 0) - (a[0] ?? 0)
  if (!gate || a.length !== b.length || a.some((x, i) => b[i] - x !== offset)) {
    if (!warnedUngated) {
      warnedUngated = true
      console.warn(`[avatar25] a ${r.layer} leg of a worn bottom has no matching shoes leg drawing; drawn uncut`)
    }
    return null
  }
  return { set: maskSet, vertexOffset: offset }
}

/** Packed vertex → mask uv/page for every vertex of a composed leg range (the shoes drawing's same vertex). */
export function legMaskVertices(entries: readonly LegMaskedEntry[], meshes: Rig25Mesh[], base: number[]): Map<number, LegMaskVertex> {
  const out = new Map<number, LegMaskVertex>()
  for (const e of entries) {
    if (!e.legMask) continue
    const src = meshes[e.set], gate = meshes[e.legMask.set]
    for (let i = e.start; i < e.start + e.count; i++) {
      const local = src.index[i]
      const g = local + e.legMask.vertexOffset
      out.set(local + base[e.set], { u: gate.uv[g * 2], v: gate.uv[g * 2 + 1], page: gate.page[g] })
    }
  }
  return out
}
