/**
 * The retargeted walk (lab40 doll25.js buildMotion / poseMotion / applyMotion / setLegOrder / seatWeights), for the
 * native renderer. A 3D walk retargeted onto the standing drawing: every key pose gives each bone an absolute
 * on-screen turn θ (rad, sheet px, y down) and a stretch ρ along its rest axis, plus the hips' offset.
 *
 * Pure. Compiled once on the JS thread; sampled and posed on the UI thread every rendered frame (worklets), with
 * linear interpolation between key poses (never stepping). The per-frame functions allocate nothing: the caller
 * passes the pose buffer (`motionPoseLength`) and the palette.
 *
 * FK, chained from the hips (sheet px): D = T(posed head) · R(θ) · S_axis(ρ) · T(-rest head), child posed head =
 * parent D · child rest head. The palette is in bill px (y up, origin at the ground point): conjugating by the
 * y flip turns R(θ) into R(-θ) and S_u into S_(flip u), so the same chain runs directly in bill px.
 */
import type { Rig25View } from "./rigTypes"

/** Palette slot stride (matches avatar25Pose PALETTE_STRIDE). */
const STRIDE = 8
/** Below this share of the stride the legs keep the drawing's own depth order (lab40 MOTION_ORDER_K). */
export const MOTION_ORDER_K = 0.3
/** The motion poses the body while walking and while settling after a walk (lab40 motionOn: walkW > 0.002). */
export const MOTION_ON_WEIGHT = 0.002
/** Walk weight → motion blend (lab40 / doll25: k = min(1, walkW · 1.4)). */
const WEIGHT_GAIN = 1.4
/** The planted foot's travel along its own line counts fully; any travel counts at least half (lab40 update()). */
const MIN_TRAVEL_SHARE = 0.5
/** stepDir shorter than this is clamped (doll25 strideLen). */
const MIN_STEP_DIR = 0.3
const TWO_PI = Math.PI * 2
/** Share of the sit-down progress the knees bend by before the seated drawing takes over (doll25 `sitW * 0.6`). */
export const SIT_BEND_SHARE = 0.6
/** The seated drawing replaces the standing one half way down (doll25 showSit = sitW > 0.5). */
export const SIT_CARD_FROM = 0.5

export interface CompiledMotion extends MotionStance {
  /** Key poses per cycle. */
  n: number
  boneCount: number
  /** Bones in FK order (every parent before its children). */
  order: number[]
  parent: number[]
  /** Rest head (bill px) and unit rest axis (bill px, y up) per bone. */
  hx: number[]
  hy: number[]
  ux: number[]
  uy: number[]
  /** n × (boneCount·2 + 2): θ, ρ per bone, then the hips offset dx, dy (sheet px, y down). */
  frames: number[]
  /** 1 while the near leg is in front, per key pose. */
  nearFront: number[]
  /** Idle overlay bones (-1 when the rig has no such bone). */
  chest: number
  neck: number
  head: number
  /** Per arm (near, far; four numbers each): upper arm, fore arm, hand, side of the chest it is drawn on (-1 / 1). */
  arms: number[]
  /** Per leg (near, far; three numbers each): thigh, shin, foot. */
  legs: number[]
  /** The way a step forward turns the leg on screen: -1 front view, 1 back view (doll25 `fwd`). */
  fwd: number
  /**
   * Breathing while this pose path draws the standing idle (pairs: bone, rise ÷ bone length): the spine and chest
   * stretch by that share at full inhale, the same rise the posed skeleton gets as a translation (lab poseMotion).
   */
  breathStretch: number[]
}

/** Length of the pose buffer sampleMotion writes: θ, ρ per bone, then the hips offset. */
export function motionPoseLength(m: CompiledMotion): number {
  "worklet"
  return m.boneCount * 2 + 2
}

/** How far and which way a planted foot slides on screen per walk cycle (sheet px, y down). */
export interface MotionStance {
  stanceLen: number
  dirX: number
  dirY: number
}

/** The view's planted-foot travel per cycle, or null when it has no retargeted walk. */
export function compileMotionStance(v: Rig25View): MotionStance | null {
  if (!v.motion || v.motion.frames.length === 0) return null
  const [sx, sy] = v.motion.stancePx
  const stanceLen = Math.hypot(sx, sy)
  return { stanceLen, dirX: stanceLen > 0 ? sx / stanceLen : 1, dirY: stanceLen > 0 ? sy / stanceLen : 0 }
}

/** Compiles a view's retargeted walk, or null when the view has none (or lacks bone tails): today's walk then. */
export function compileMotion(v: Rig25View, viewName: "front" | "back" = "front"): CompiledMotion | null {
  const M = v.motion
  if (!M || M.frames.length === 0) return null
  const bones = v.bones
  const B = bones.length
  if (bones.some((b) => !b.tail)) return null
  const index: Record<string, number> = {}
  bones.forEach((b, i) => { index[b.name] = i })
  const [gx, gy] = v.ground
  const hx: number[] = [], hy: number[] = [], ux: number[] = [], uy: number[] = []
  for (const b of bones) {
    const tail = b.tail as [number, number]
    const dx = tail[0] - b.head[0], dy = tail[1] - b.head[1]
    const L = Math.hypot(dx, dy)
    hx.push(b.head[0] - gx)
    hy.push(-(b.head[1] - gy))
    ux.push(L > 0 ? dx / L : 0)
    uy.push(L > 0 ? -dy / L : 1)
  }
  const order: number[] = []
  const visit = (i: number) => {
    order.push(i)
    bones.forEach((b, c) => { if (b.parent === i) visit(c) })
  }
  bones.forEach((b, i) => { if (b.parent < 0) visit(i) })
  if (order.length !== B) throw new Error("2.5D rig bones do not form a tree")
  const stride = B * 2 + 2
  const frames: number[] = []
  const nearFront: number[] = []
  for (const f of M.frames) {
    if (f.pose.length !== B * 2) throw new Error(`2.5D walk key pose has ${f.pose.length / 2} bones, rig has ${B}`)
    for (let k = 0; k < B * 2; k++) frames.push(f.pose[k])
    frames.push(f.root[0], f.root[1])
    nearFront.push(f.nearFront ? 1 : 0)
  }
  if (frames.length !== M.frames.length * stride) throw new Error("2.5D walk frames are malformed")
  const stance = compileMotionStance(v) as MotionStance
  const at = (name: string) => index[name] ?? -1
  const chestX = at("chest") >= 0 ? bones[index.chest].head[0] : 0
  const arms: number[] = []
  for (const sd of ["near", "far"]) {
    const ua = at(`upperArm_${sd}`), fa = at(`foreArm_${sd}`), hand = at(`hand_${sd}`)
    if (ua >= 0 && fa >= 0 && hand >= 0) arms.push(ua, fa, hand, bones[ua].head[0] < chestX ? -1 : 1)
  }
  const legs: number[] = []
  for (const sd of ["near", "far"]) {
    const th = at(`thigh_${sd}`), sh = at(`shin_${sd}`), ft = at(`foot_${sd}`)
    if (th >= 0 && sh >= 0 && ft >= 0) legs.push(th, sh, ft)
  }
  return {
    n: M.frames.length,
    boneCount: B,
    order,
    parent: bones.map((b) => b.parent),
    hx, hy, ux, uy,
    frames,
    nearFront,
    ...stance,
    chest: at("chest"),
    neck: at("neck"),
    head: at("head"),
    arms,
    legs,
    fwd: viewName === "front" ? -1 : 1,
    breathStretch: ["spine", "chest"].flatMap((name) => {
      const i = at(name)
      const rise = v.breath?.risePx[name] ?? 0
      if (i < 0 || rise === 0) return []
      const tail = bones[i].tail as [number, number]
      const length = Math.hypot(tail[0] - bones[i].head[0], tail[1] - bones[i].head[1])
      return length > 0 ? [i, rise / length] : []
    })
  }
}

/** Walk weight (0..1, eased toward 1 while walking) → share of the walk shown. */
export function motionBlend(walkWeight: number): number {
  "worklet"
  return Math.min(1, Math.max(0, walkWeight) * WEIGHT_GAIN)
}

/**
 * Samples the walk at `cycles` (1 = one full cycle, two steps), blended toward rest by `k`, into `out`
 * (motionPoseLength). Linear between the two key poses around the phase; turns take the short way round.
 * Returns the depth order to draw: 1 = near leg in front (the drawing's own order), 0 = far leg in front.
 */
export function sampleMotion(m: CompiledMotion, cycles: number, k: number, out: Float32Array | number[]): number {
  "worklet"
  const u = cycles - Math.floor(cycles)
  const f = u * m.n
  const i0 = Math.floor(f) % m.n
  const i1 = (i0 + 1) % m.n
  const a = f - Math.floor(f)
  const stride = m.boneCount * 2 + 2
  const o0 = i0 * stride, o1 = i1 * stride
  const F = m.frames
  for (let b = 0; b < m.boneCount; b++) {
    const p = F[o0 + b * 2], q = F[o1 + b * 2]
    let d = q - p
    if (d > Math.PI) d -= TWO_PI
    if (d < -Math.PI) d += TWO_PI
    out[b * 2] = (p + d * a) * k
    const r0 = F[o0 + b * 2 + 1]
    out[b * 2 + 1] = 1 + (r0 + (F[o1 + b * 2 + 1] - r0) * a - 1) * k
  }
  const R = m.boneCount * 2
  out[R] = (F[o0 + R] + (F[o1 + R] - F[o0 + R]) * a) * k
  out[R + 1] = (F[o0 + R + 1] + (F[o1 + R + 1] - F[o0 + R + 1]) * a) * k
  if (k < MOTION_ORDER_K) return 1
  return m.nearFront[a < 0.5 ? i0 : i1]
}

/**
 * The standing idle fading out as she sets off (lab40 poseMotion): breathing turns the chest (and everything on
 * it), the arms sway outward, and the head looks around. `idle` = 1 - k; `breath` = sin(2t) (0 with reduced
 * motion); `lookBill` = the head's look turn as a bill-px angle (y up), as the standing pose uses it.
 */
export function addMotionIdle(m: CompiledMotion, pose: Float32Array | number[], idle: number, breath: number, lookBill: number): void {
  "worklet"
  if (idle <= 0) return
  const ch = -0.008 * breath * idle
  if (m.chest >= 0) pose[m.chest * 2] += ch
  if (m.neck >= 0) pose[m.neck * 2] += ch
  if (m.head >= 0) pose[m.head * 2] += ch - lookBill * idle
  for (let s = 0; s < m.arms.length / 4; s++) {
    const sw = ch - m.arms[s * 4 + 3] * 0.015 * breath * idle
    for (let j = 0; j < 3; j++) pose[m.arms[s * 4 + j] * 2] += sw
  }
}


/**
 * On the way down to a seat, before the seated drawing appears (doll25 poseMotion sitW branch): the thighs come
 * forward, the shins fold back under the knees, the feet stay level, and the arms bend toward the lap. `bend` is
 * 0..SIT_BEND_SHARE·SIT_CARD_FROM. Turns are absolute on-screen angles (sheet px, y down), added to the sampled pose.
 */
/** The breathing rise on the idle overlay: `amount` = breath (0..1) × breath weight × idle weight. */
export function addMotionBreath(m: CompiledMotion, pose: Float32Array | number[], amount: number): void {
  "worklet"
  if (amount <= 0) return
  for (let k = 0; k < m.breathStretch.length; k += 2) pose[m.breathStretch[k] * 2 + 1] *= 1 + amount * m.breathStretch[k + 1]
}

export function addMotionSitBend(m: CompiledMotion, pose: Float32Array | number[], bend: number): void {
  "worklet"
  if (bend <= 0) return
  const fwd = m.fwd
  const th = -fwd * 1.15 * bend
  const sh = th + fwd * 1.2 * bend
  for (let s = 0; s < m.legs.length / 3; s++) {
    pose[m.legs[s * 3] * 2] += th
    pose[m.legs[s * 3 + 1] * 2] += sh
    pose[m.legs[s * 3 + 2] * 2] += sh - fwd * 0.1 * bend
  }
  const ua = -fwd * 0.35 * bend
  const fa = ua - fwd * 0.6 * bend
  for (let s = 0; s < m.arms.length / 4; s++) {
    pose[m.arms[s * 4] * 2] += ua
    pose[m.arms[s * 4 + 1] * 2] += fa
    pose[m.arms[s * 4 + 2] * 2] += fa
  }
}

/**
 * Sit-down progress (0..1) after `seconds` (doll25 update(), mode 'sitting'): cubic ease in-out, complete at 90%
 * of the sit-down's 0.6 s (0.25 s with Reduce Motion). The seated drawing takes over at SIT_CARD_FROM.
 */
export function sitDownWeight(seconds: number, reduceMotion: boolean): number {
  "worklet"
  const p = Math.min(1, Math.max(0, seconds / (reduceMotion ? 0.25 : 0.6) / 0.9))
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
}

/**
 * 2D FK from the hips: writes one bill-px affine per bone into `palette` (slot stride 8, [a, c, tx, 0, b, d, ty, 0]
 * so x' = a·x + c·y + tx, y' = b·x + d·y + ty). Each matrix maps the rest drawing onto the posed drawing, so it
 * is the skinning matrix itself (the bind pose is the rest drawing).
 */
export function writeMotionPalette(m: CompiledMotion, pose: Float32Array | number[], palette: Float32Array): void {
  "worklet"
  const R = m.boneCount * 2
  for (let o = 0; o < m.order.length; o++) {
    const i = m.order[o]
    const th = -pose[i * 2]
    const k = pose[i * 2 + 1] - 1
    const ux = m.ux[i], uy = m.uy[i]
    const s00 = 1 + k * ux * ux, s01 = k * ux * uy, s11 = 1 + k * uy * uy
    const c = Math.cos(th), s = Math.sin(th)
    const a = c * s00 - s * s01
    const b = c * s01 - s * s11
    const cc = s * s00 + c * s01
    const d = s * s01 + c * s11
    const hx = m.hx[i], hy = m.hy[i]
    const p = m.parent[i]
    let nx: number, ny: number
    if (p < 0) {
      nx = hx + pose[R]
      ny = hy - pose[R + 1]
    } else {
      const q = p * STRIDE
      nx = palette[q] * hx + palette[q + 1] * hy + palette[q + 2]
      ny = palette[q + 4] * hx + palette[q + 5] * hy + palette[q + 6]
    }
    const w = i * STRIDE
    palette[w] = a; palette[w + 1] = b; palette[w + 2] = nx - (a * hx + b * hy); palette[w + 3] = 0
    palette[w + 4] = cc; palette[w + 5] = d; palette[w + 6] = ny - (cc * hx + d * hy); palette[w + 7] = 0
  }
}

/**
 * Screen distance (in the drawing's sheet px) the body must travel per walk cycle so planted feet stay still,
 * when it walks along the floor axis the view faces (doll25 strideLen): |stancePx| · scale / |stepDir|, where
 * stepDir is that floor axis projected on screen (clamped, so a walk straight at the camera still steps).
 */
export function motionStrideLength(stanceLen: number, scale: number, stepDirX: number, stepDirY: number): number {
  "worklet"
  return stanceLen * scale / Math.max(MIN_STEP_DIR, Math.hypot(stepDirX, stepDirY))
}

/**
 * Walk cycles covered by an on-screen move (dx, dy) (lab40 update()): the travel along the planted foot's line on
 * screen (x flipped when mirrored), at least half the whole travel, over the foot's travel per cycle. `pxPerSheet`
 * = screen px per drawing sheet px.
 */
export function motionCyclesForTravel(m: MotionStance, dx: number, dy: number, mirror: boolean, pxPerSheet: number): number {
  "worklet"
  const cyclePx = m.stanceLen * pxPerSheet
  if (!(cyclePx > 0)) return 0
  const along = Math.abs(dx * m.dirX * (mirror ? -1 : 1) + dy * m.dirY)
  return Math.max(along, MIN_TRAVEL_SHARE * Math.hypot(dx, dy)) / cyclePx
}

function smoothstep(x: number, e0: number, e1: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * Walk weights for the fabric around the crotch (lab40 seatWeights): below the hip joints the torso's shorts and
 * the trousers' seat piece bend with the thighs, smoothly from the hip line to 70% of the way to the knees,
 * shared across the crotch by x; above the hips they keep the drawing's own weights. Sheet px in, at most four
 * (joint, weight) pairs out, heaviest first.
 */
export function seatWeights(v: Rig25View): (x: number, y: number, joints: number[], weights: number[]) => { joints: number[]; weights: number[] } {
  const idx: Record<string, number> = {}
  v.bones.forEach((b, i) => { idx[b.name] = i })
  const B = v.bones
  const hipY = B[idx.hips].head[1]
  const kneeY = Math.min(B[idx.shin_near].head[1], B[idx.shin_far].head[1])
  const xn = B[idx.thigh_near].head[0], xf = B[idx.thigh_far].head[0]
  const tn = idx.thigh_near, tf = idx.thigh_far
  return (x, y, joints, weights) => {
    const t = smoothstep(y, hipY, hipY + 0.7 * (kneeY - hipY))
    if (t <= 0) return { joints: joints.slice(), weights: weights.slice() }
    const wn = smoothstep((x - xf) / (xn - xf), 0.2, 0.8)
    const acc = new Map<number, number>()
    for (let k = 0; k < joints.length; k++) {
      if (weights[k] > 0) acc.set(joints[k], (acc.get(joints[k]) ?? 0) + weights[k] * (1 - t))
    }
    acc.set(tn, (acc.get(tn) ?? 0) + t * wn)
    acc.set(tf, (acc.get(tf) ?? 0) + t * (1 - wn))
    const top = [...acc.entries()].filter(([, w]) => w > 0).sort((p, q) => q[1] - p[1]).slice(0, 4)
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1
    const outJ = top.map(([j]) => j), outW = top.map(([, w]) => w / sum)
    while (outJ.length < 4) { outJ.push(0); outW.push(0) }
    return { joints: outJ, weights: outW }
  }
}
