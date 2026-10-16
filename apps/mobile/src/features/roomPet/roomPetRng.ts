/**
 * Seeded, immutable RNG (mulberry32). Each draw returns the value and the next
 * state, so the engine state carries the whole random stream.
 */
export interface RoomPetRandomDraw {
  readonly value: number
  readonly rngState: number
}

const MULBERRY_INCREMENT = 0x6d2b79f5
const UINT32_RANGE = 4294967296

export function createRoomPetRngState(seed: number): number {
  if (!Number.isFinite(seed)) throw new Error("Room pet seed must be a finite number")
  return Math.trunc(seed) >>> 0
}

/** A float in [0, 1). */
export function drawRoomPetRandom(rngState: number): RoomPetRandomDraw {
  const next = (rngState + MULBERRY_INCREMENT) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE
  return { value, rngState: next }
}

/** An integer in [min, max]. */
export function drawRoomPetInteger(rngState: number, min: number, max: number): RoomPetRandomDraw {
  const draw = drawRoomPetRandom(rngState)
  return { value: min + Math.floor(draw.value * (max - min + 1)), rngState: draw.rngState }
}
