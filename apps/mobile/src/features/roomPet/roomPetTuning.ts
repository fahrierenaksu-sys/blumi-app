import type { RoomPetTrick } from "./roomPet.types"

/** Behaviour timing. Lively but calm: no autonomous decision is closer than IDLE_MIN_MS to the last one. */
export const ROOM_PET_TUNING = {
  walkStepMs: 320,
  runStepMs: 170,
  idleMinMs: 2500,
  idleMaxMs: 6000,
  wanderMinCells: 2,
  wanderMaxCells: 6,
  /** Quiet time (no tap, arrival, heart or seat change) before the pet goes to sleep. */
  sleepAfterQuietMs: 45000,
  /** The pet wakes on its own after this long and starts a fresh awake period. */
  sleepMaxMs: 120000,
  /** The heart shows within this time of an avatar arriving, reached or not. */
  greetDeadlineMs: 3000,
  greetHoldMs: 1600,
  /** One greeting per avatar per window, so reconnect flaps do not spam hearts. */
  greetCooldownMs: 60000,
  reactMs: 1400,
  tapCooldownMs: 900,
  chatHeartCooldownMs: 4000,
  hopChance: 0.25,
  hopCooldownMs: 45000,
  hopPhaseMs: 450,
  perchMinMs: 4000,
  perchMaxMs: 9000,
  emoteMs: 1600,
  /** Safety cap on scheduled actions handled in one step (a long suspend catches up in bounded work). */
  maxActionsPerStep: 512
} as const

/** Tricks unlock with time spent together (owner present); they are never lost. */
export const ROOM_PET_TRICK_UNLOCKS: readonly { readonly trick: RoomPetTrick; readonly bondMs: number }[] = [
  { trick: "roll", bondMs: 10 * 60 * 1000 },
  { trick: "hop", bondMs: 30 * 60 * 1000 },
  { trick: "wave", bondMs: 60 * 60 * 1000 }
]

export const ROOM_PET_OWNER_KEY = "owner"
