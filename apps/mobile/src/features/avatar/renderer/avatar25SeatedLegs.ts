/**
 * Seated lower legs that reach the floor at any height (the "sole gap" fix).
 *
 * The layered seats were sized for N = 2.105 (Workbench avatar25-v2/furniture/ERGONOMICS.md): with her hip on the
 * seat's hip point, the seated drawing's soles land on the floor just in front of the cushion. She is now drawn
 * shorter (girl N 1.965, boy N 2.063), and the drawing's hip-to-sole drop shrinks with her while the seat does not,
 * so her soles float (about 4 shell px for the girl). The furniture stays as it is: her hip stays on the hip point
 * and her back on the backrest, and her seated shins lengthen by exactly the missing drop.
 *
 * How: every seated card (the body's and each worn item's, one quad each in the rig) is cut into three strips at
 * two rows of the shins. Above the band nothing moves; below it everything (cuffs, shoes, soles) moves down by the
 * extension (the palette slot after WAVE, avatar25Pose); the band between stretches evenly. The art is never changed.
 */
import type { Rig25Mesh, Rig25View } from "./rigTypes"

/**
 * The shin band that stretches, as shares of the seated drawing's hip-to-sole drop below the hip: under the knees
 * and the hands on them, above the trouser cuffs and the shoes (both views of the approved girl).
 */
export const SEATED_SHIN_BAND: readonly [number, number] = [0.09, 0.52]
/** The band stretches (or shrinks) by at most this share: beyond it the shins would look drawn wrong. */
export const SEATED_SHIN_MAX_STRETCH = 0.3

/** The seated drawing's hip-to-sole drop as a share of her height (rig `sit.feet` − `sit.seat`). */
export function seatedHipToSoleShare(v: Pick<Rig25View, "sit" | "height">): number {
  return (v.sit.feet[1] - v.sit.seat[1]) / v.height
}

/**
 * How far (screen px, down) her seated soles must move so they stand on the floor: `soleDropPx` is the seat's drop
 * from her hip to the floor where her front-view soles stand (`RoomV2LayeredSeatArt.soleDropBelowHip`). The front
 * drawing fixes the shin lengthening; the back drawing (feet hidden under the seat) lengthens its shins by the same
 * share, so she has the same legs whichever way the seat turns. Capped at SEATED_SHIN_MAX_STRETCH of the band.
 */
export function seatedLegExtensionPx(input: {
  soleDropPx: number
  figureHeightPx: number
  /** Hip-to-sole share of her front drawing and of the drawing she sits in. */
  frontShare: number
  viewShare: number
}): number {
  const { soleDropPx, figureHeightPx, frontShare, viewShare } = input
  if (!(soleDropPx > 0) || !(figureHeightPx > 0) || !(frontShare > 0) || !(viewShare > 0)) return 0
  const lengthen = soleDropPx / (frontShare * figureHeightPx) - 1
  const cap = SEATED_SHIN_MAX_STRETCH * (SEATED_SHIN_BAND[1] - SEATED_SHIN_BAND[0])
  return Math.max(-cap, Math.min(cap, lengthen)) * viewShare * figureHeightPx
}

/** Sheet rows (y down) of the shin band of one view's seated drawing. */
export function seatedShinBandRows(v: Pick<Rig25View, "sit">): [number, number] {
  const hip = v.sit.seat[1]
  const drop = v.sit.feet[1] - hip
  return [hip + SEATED_SHIN_BAND[0] * drop, hip + SEATED_SHIN_BAND[1] * drop]
}

/**
 * The "sit" range of `mesh` (one axis-aligned quad) as three strips cut at `bandRows`, in a mesh of their own (local
 * indices): the top strip on `rootSlot`, the bottom strip on `legSlot`, the band from one to the other (so it
 * stretches evenly). Null when the mesh has no seated card or it is any other shape (it is then drawn as it is).
 */
export function seatedCardStrips(mesh: Rig25Mesh, bandRows: [number, number], rootSlot: number, legSlot: number, rangeName = "sit"): Rig25Mesh | null {
  const range = mesh.ranges.find((r) => r.name === rangeName)
  if (!range || range.count !== 6) return null
  const corners = [...new Set(mesh.index.slice(range.start, range.start + 6))]
  if (corners.length !== 4) return null
  const at = (i: number) => ({ x: mesh.pos[i * 2]!, y: mesh.pos[i * 2 + 1]!, u: mesh.uv[i * 2]!, v: mesh.uv[i * 2 + 1]! })
  const pts = corners.map(at)
  const top = Math.min(...pts.map((p) => p.y)), bottom = Math.max(...pts.map((p) => p.y))
  const left = Math.min(...pts.map((p) => p.x)), right = Math.max(...pts.map((p) => p.x))
  const corner = (x: number, y: number) => pts.find((p) => p.x === x && p.y === y)
  const tl = corner(left, top), tr = corner(right, top), bl = corner(left, bottom), br = corner(right, bottom)
  // only an axis-aligned rectangle with an axis-aligned texture rectangle is cut (that is how the rig bakes them)
  if (!tl || !tr || !bl || !br || tl.v !== tr.v || bl.v !== br.v || tl.u !== bl.u || tr.u !== br.u) return null
  // a card cut to its own box (export_rig.py item_cards) may start inside or below the band, or end inside it: rows
  // are clamped to the card and a row inside the band blends the two slots by its depth in it, so every card's
  // pixels move exactly as the same rows of a card spanning the whole band. Cards wholly above it never move.
  if (!(bandRows[1] > bandRows[0]) || bottom <= bandRows[0]) return null
  const b0 = Math.max(top, Math.min(bottom, bandRows[0]))
  const b1 = Math.max(b0, Math.min(bottom, bandRows[1]))
  const page = mesh.page[corners[0]!]!
  const out: Rig25Mesh = { pos: [], uv: [], joints: [], weights: [], index: [], page: [], arm: [], ranges: [] }
  const depth = (y: number) => Math.min(1, Math.max(0, (y - bandRows[0]) / (bandRows[1] - bandRows[0])))
  for (const y of [top, b0, b1, bottom]) {
    const v = tl.v + ((y - top) / (bottom - top)) * (bl.v - tl.v)
    const t = depth(y)
    for (const [x, u] of [[left, tl.u], [right, tr.u]] as const) {
      out.pos.push(x, y)
      out.uv.push(u, v)
      if (t === 0 || t === 1) {
        out.joints.push(t === 0 ? rootSlot : legSlot, 0, 0, 0)
        out.weights.push(1, 0, 0, 0)
      } else {
        out.joints.push(rootSlot, legSlot, 0, 0)
        out.weights.push(1 - t, t, 0, 0)
      }
      out.page.push(page)
      out.arm.push(0)
    }
  }
  const rows = [top, b0, b1, bottom]
  for (let strip = 0; strip < 3; strip++) {
    if (!(rows[strip + 1]! > rows[strip]!)) continue   // a strip the card does not reach
    const a = strip * 2, b = a + 1, c = a + 3, d = a + 2
    out.index.push(a, b, c, a, c, d)
  }
  out.ranges.push({ name: range.name, order: range.order, start: 0, count: out.index.length })
  return out
}
