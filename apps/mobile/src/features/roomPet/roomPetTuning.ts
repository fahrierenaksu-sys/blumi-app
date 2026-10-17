import type { RoomPetTrick } from "./roomPet.types"
import { getRoomPetClipDurationMs } from "./roomPetSprite"
import { ROOM_PET_CAT_WHITE_SHEET_LAYOUT } from "./sheet/roomPetCatWhiteSheet"

/**
 * Behaviour timing. Calm like a real cat: short walks, long rests. No
 * autonomous decision is closer than idleMinMs to the last one.
 */
export const ROOM_PET_TUNING = {
  walkStepMs: 320,
  runStepMs: 170,
  /** The shortest rest stage: the spacing between autonomous decisions. */
  idleMinMs: 1200,
  /** Rest stages (see RoomPetRestStage): each lasts a random time in its range. */
  settleMinMs: 1500,
  settleMaxMs: 3500,
  sitMinMs: 5000,
  sitMaxMs: 12000,
  lieMinMs: 12000,
  lieMaxMs: 28000,
  getUpMinMs: 1200,
  getUpMaxMs: 2200,
  /** After stopping, the pet usually sits; otherwise it soon walks on. */
  sitChance: 0.8,
  /** A sitting pet often lies down curled before it gets up again. */
  lieChance: 0.5,
  wanderMinCells: 2,
  wanderMaxCells: 5,
  /** Quiet time (no tap, arrival, heart or seat change) before the pet goes to sleep. */
  sleepAfterQuietMs: 90000,
  /** A nap lasts a random time in this range; then the pet wakes on its own and starts a fresh awake period. */
  sleepMinMs: 60000,
  sleepMaxMs: 100000,
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
  /** A hop up or down lasts exactly its clip, so the pet lands on the seat (or floor) on the clip's last frame. */
  hopUpMs: getRoomPetClipDurationMs(ROOM_PET_CAT_WHITE_SHEET_LAYOUT.clips.hopUp),
  hopDownMs: getRoomPetClipDurationMs(ROOM_PET_CAT_WHITE_SHEET_LAYOUT.clips.hopDown),
  perchMinMs: 4000,
  perchMaxMs: 9000,
  emoteMs: 1600,
  /** Safety cap on scheduled actions handled in one step (a long suspend catches up in bounded work). */
  maxActionsPerStep: 512
} as const

/** The longest single rest stage. */
export const ROOM_PET_LONGEST_REST_MS = Math.max(
  ROOM_PET_TUNING.settleMaxMs,
  ROOM_PET_TUNING.sitMaxMs,
  ROOM_PET_TUNING.lieMaxMs,
  ROOM_PET_TUNING.getUpMaxMs
)

/** Tricks unlock with time spent together (owner present); they are never lost. */
export const ROOM_PET_TRICK_UNLOCKS: readonly { readonly trick: RoomPetTrick; readonly bondMs: number }[] = [
  { trick: "roll", bondMs: 10 * 60 * 1000 },
  { trick: "hop", bondMs: 30 * 60 * 1000 },
  { trick: "wave", bondMs: 60 * 60 * 1000 }
]

export const ROOM_PET_OWNER_KEY = "owner"
