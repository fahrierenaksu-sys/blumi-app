/**
 * The 2.5D avatar's idle "life": blinking and breathing (Workbench avatar25-v2/life/NATIVE_PLAN.md). Pure logic, no
 * react-native imports: compiled once on the JS thread, evaluated per frame on the UI thread (worklets).
 *
 * Both are optional per rig view (`blink`, `breath` in rig25.json): a view without them poses and draws as before.
 */
import type { Rig25View } from "./rigTypes"

/** The blink frame shown: indexes `CompiledBlink.offsets` pairs. */
export const BLINK_OPEN = 0
export const BLINK_HALF = 1
export const BLINK_CLOSED = 2
export type Avatar25BlinkFrame = typeof BLINK_OPEN | typeof BLINK_HALF | typeof BLINK_CLOSED
const BLINK_FRAME_CODE: Record<string, Avatar25BlinkFrame> = { open: BLINK_OPEN, half: BLINK_HALF, closed: BLINK_CLOSED }
export const AVATAR25_BLINK_FRAME_NAMES = ["open", "half", "closed"] as const

export interface CompiledBlink {
  /** Page-0 uv of the redirected rect (the eye rect grown by the rig's `pad`): u0, v0, u1, v1. */
  rect: number[]
  /** uv offset per frame code: [0, 0, half du, half dv, closed du, closed dv]. */
  offsets: number[]
  /** One blink: the frame code of each step and the second (from the blink's start) each step ends. */
  seqFrame: number[]
  seqEnd: number[]
  durationS: number
  /** Seconds between a blink's start slot and the next (the mean gap plus one blink). */
  slotS: number
  /** A blink starts up to this long into its slot, so the open gaps spread over the rig's `gapS` range. */
  jitterS: number
  doubleP: number
  doubleGapS: number
  /**
   * Item eye patches, AVATAR25_BLINK_ITEMS × [page, u0, v0, u1, v1, du, dv]; page -1 = unused. Applied while any
   * frame shows (an item that is not worn has no texels drawn there, so it costs nothing).
   */
  items: number[]
}

/** Item eye patches the shader can apply (export_rig.py BLINK_ITEMS_MAX). */
export const AVATAR25_BLINK_ITEMS = 2
const BLINK_ITEM_STRIDE = 7

export function compileBlink(v: Rig25View): CompiledBlink | null {
  const b = v.blink
  if (!b || b.page !== 0 || b.seq.length === 0) return null
  const [pw, ph] = v.pageSize
  const [x, y, w, h] = b.rect
  const pad = Math.max(0, b.pad ?? 0)
  const offsetOf = (name: "half" | "closed") => {
    const o = b.frames[name]
    return o ? [o[0] / pw, o[1] / ph] : [0, 0]
  }
  const seqFrame: number[] = []
  const seqEnd: number[] = []
  let end = 0
  for (const [name, seconds] of b.seq) {
    end += Math.max(0, seconds)
    seqFrame.push(BLINK_FRAME_CODE[name] ?? BLINK_OPEN)
    seqEnd.push(end)
  }
  const gapMin = Math.max(0, Math.min(b.gapS[0], b.gapS[1]))
  const gapMax = Math.max(b.gapS[0], b.gapS[1])
  const doubleGapS = Math.max(0, b.doubleGapS ?? 0)
  // a second blink must end before the shortest gap does, or it would run into the next slot's blink
  const doubleFits = gapMin > end + doubleGapS
  const items: number[] = []
  for (let k = 0; k < AVATAR25_BLINK_ITEMS; k++) {
    const it = b.items?.[k]
    if (!it) {
      items.push(-1, 0, 0, 0, 0, 0, 0)
      continue
    }
    const [ix, iy, iw, ih] = it.rect
    const ipad = Math.max(0, it.pad ?? 0)
    items.push(it.page, (ix - ipad) / pw, (iy - ipad) / ph, (ix + iw + ipad) / pw, (iy + ih + ipad) / ph, it.offset[0] / pw, it.offset[1] / ph)
  }
  return {
    rect: [(x - pad) / pw, (y - pad) / ph, (x + w + pad) / pw, (y + h + pad) / ph],
    offsets: [0, 0, ...offsetOf("half"), ...offsetOf("closed")],
    seqFrame,
    seqEnd,
    durationS: end,
    slotS: (gapMin + gapMax) / 2 + end,
    jitterS: (gapMax - gapMin) / 2,
    doubleP: doubleFits ? Math.min(1, Math.max(0, b.doubleP ?? 0)) : 0,
    doubleGapS,
    items
  }
}

/** A repeatable number in [0, 1) for one (seed, slot, channel): the blink schedule needs no stored timer. */
function lifeHash(seed: number, slot: number, channel: number): number {
  "worklet"
  const x = Math.sin(seed * 127.1 + slot * 311.7 + channel * 74.7 + 0.5) * 43758.5453
  return x - Math.floor(x)
}

/**
 * The blink frame at `timeS` for the avatar with this seed (any number; avatars with different seeds never blink in
 * step). A pure function of the clock: time is cut into slots of one mean gap plus one blink, and each slot holds one
 * blink that starts a hashed moment into it, so the eyes stay open between `gapS[0]` and `gapS[1]` seconds; with
 * chance `doubleP` a quick second blink follows `doubleGapS` after the first.
 */
export function avatar25BlinkFrame(blink: CompiledBlink, timeS: number, seed: number): Avatar25BlinkFrame {
  "worklet"
  if (!(blink.slotS > 0) || !(blink.durationS > 0) || !(timeS >= 0)) return BLINK_OPEN
  const slot = Math.floor(timeS / blink.slotS)
  let local = timeS - slot * blink.slotS - blink.jitterS * lifeHash(seed, slot, 0)
  if (local < 0) return BLINK_OPEN
  if (local >= blink.durationS) {
    if (!(lifeHash(seed, slot, 1) < blink.doubleP)) return BLINK_OPEN
    local -= blink.durationS + blink.doubleGapS
    if (local < 0 || local >= blink.durationS) return BLINK_OPEN
  }
  for (let i = 0; i < blink.seqEnd.length; i++) {
    if (local < blink.seqEnd[i]) return blink.seqFrame[i] as Avatar25BlinkFrame
  }
  return BLINK_OPEN
}

/**
 * Floats of the shader's blink block: head rect (u0, v0, u1, v1), head (du, dv, on, 0), then per item patch
 * rect (u0, v0, u1, v1) and (du, dv, page, on).
 */
export const AVATAR25_BLINK_UNIFORM_FLOATS = 8 + AVATAR25_BLINK_ITEMS * 8

/**
 * Writes the shader's blink block at `out[at…]`. Open eyes, a view without a blink (the back view has none) or no
 * blink at all write "off": the shader then samples exactly as it did before blinks existed.
 */
export function writeAvatar25BlinkUniform(blink: CompiledBlink | null, frame: number, out: Float32Array | number[], at: number): void {
  "worklet"
  const on = blink !== null && (frame === BLINK_HALF || frame === BLINK_CLOSED)
  out[at] = on ? blink.rect[0] : 0
  out[at + 1] = on ? blink.rect[1] : 0
  out[at + 2] = on ? blink.rect[2] : 0
  out[at + 3] = on ? blink.rect[3] : 0
  out[at + 4] = on ? blink.offsets[frame * 2] : 0
  out[at + 5] = on ? blink.offsets[frame * 2 + 1] : 0
  out[at + 6] = on ? 1 : 0
  out[at + 7] = 0
  for (let k = 0; k < AVATAR25_BLINK_ITEMS; k++) {
    const o = at + 8 + k * 8
    const s = k * BLINK_ITEM_STRIDE
    const itemOn = on && blink.items[s] >= 0
    out[o] = itemOn ? blink.items[s + 1] : 0
    out[o + 1] = itemOn ? blink.items[s + 2] : 0
    out[o + 2] = itemOn ? blink.items[s + 3] : 0
    out[o + 3] = itemOn ? blink.items[s + 4] : 0
    out[o + 4] = itemOn ? blink.items[s + 5] : 0
    out[o + 5] = itemOn ? blink.items[s + 6] : 0
    out[o + 6] = itemOn ? blink.items[s] : 0
    out[o + 7] = itemOn ? 1 : 0
  }
}

/**
 * What the fragment shader does with a blink block (avatar25Gpu.ts `fs`, kept in step with it): a texel of page 0
 * inside the head rect, or of an item patch's page inside its rect, is read that patch's offset away; every other
 * texel where it is.
 */
export function redirectAvatar25BlinkUv(block: ArrayLike<number>, at: number, u: number, v: number, page: number): [number, number] {
  const inside = (o: number) => u >= block[o] && v >= block[o + 1] && u <= block[o + 2] && v <= block[o + 3]
  if (block[at + 6] > 0.5 && page === 0 && inside(at)) return [u + block[at + 4], v + block[at + 5]]
  for (let k = 0; k < AVATAR25_BLINK_ITEMS; k++) {
    const o = at + 8 + k * 8
    if (block[o + 7] > 0.5 && page === Math.round(block[o + 6]) && inside(o)) return [u + block[o + 4], v + block[o + 5]]
  }
  return [u, v]
}

export interface CompiledBreath {
  periodS: number
  inhale: number
  fadeS: number
  /** POSE_BITS of the poses that breathe. */
  poseMask: number
  /** Bill px (y up) each bone's head rises at full inhale, in its parent's space; one per bone, 0 = none. */
  rise: number[]
}

const BREATH_POSE_BITS: Record<string, number> = { stand: 1, walk: 2, sit: 4, wave: 8 }

export function compileBreath(v: Rig25View): CompiledBreath | null {
  const b = v.breath
  if (!b || !(b.periodS > 0)) return null
  return {
    periodS: b.periodS,
    inhale: Math.min(0.99, Math.max(0.01, b.inhale)),
    fadeS: Math.max(0, b.fadeS),
    poseMask: b.poses.reduce((mask, pose) => mask | (BREATH_POSE_BITS[pose] ?? 0), 0),
    rise: v.bones.map((bone) => b.risePx[bone.name] ?? 0)
  }
}

/**
 * Breath 0..1 at `timeS`: an eased inhale over `inhale` of the cycle, then a longer eased exhale. `phase` (cycles)
 * shifts it per avatar.
 */
export function breathCurve(periodS: number, inhale: number, timeS: number, phase: number): number {
  "worklet"
  const cycles = timeS / periodS + phase
  const u = cycles - Math.floor(cycles)
  if (u < inhale) return 0.5 - 0.5 * Math.cos(Math.PI * u / inhale)
  return 0.5 + 0.5 * Math.cos(Math.PI * (u - inhale) / (1 - inhale))
}

/** The breath weight one frame later: toward 1 while the pose breathes, toward 0 otherwise, a full fade in `fadeS`. */
export function stepBreathWeight(weight: number, breathes: boolean, dtS: number, fadeS: number): number {
  "worklet"
  const target = breathes ? 1 : 0
  if (!(fadeS > 0)) return target
  const step = Math.max(0, dtS) / fadeS
  return breathes ? Math.min(1, weight + step) : Math.max(0, weight - step)
}
