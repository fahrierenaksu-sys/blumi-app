import type { RoomPetPose } from "./roomPet.types"

/**
 * The room pet sprite-sheet contract. A sheet is a grid of equal cells; each
 * clip lists, per drawn heading, the cell indices it plays in order.
 *
 * Headings are screen directions, clockwise from "up the screen": 45 is
 * back-right (walking away), 135 is front-right (walking toward the camera).
 * The sheet draws only those two; 315 and 225 are the same frames mirrored,
 * so the art must be mirror-safe (no one-sided markings).
 */
export type RoomPetClipName = "idle" | "walk" | "sit" | "sleep" | "happy" | "greet"
export type RoomPetSpriteHeading = 45 | 135 | 225 | 315
export type RoomPetDrawnHeading = 45 | 135

export interface RoomPetSpriteClip {
  readonly fps: number
  readonly loop: boolean
  /** A looping clip plays frames before this index once (sit down, curl up), then loops from it. */
  readonly loopFrom: number
  readonly frames: Readonly<Record<RoomPetDrawnHeading, readonly number[]>>
}

export interface RoomPetSpriteSheetLayout {
  readonly cellWidth: number
  readonly cellHeight: number
  readonly columns: number
  readonly rows: number
  /** Where the feet touch the floor inside a cell, as a fraction of its height (from the top). */
  readonly footAnchorY: number
  /** A cell's drawn height in room shell pixels, so the pet keeps the art's scale next to the avatars. */
  readonly cellHeightShellPx: number
  readonly clips: Readonly<Record<RoomPetClipName, RoomPetSpriteClip>>
}

export const ROOM_PET_CLIP_NAMES: readonly RoomPetClipName[] = ["idle", "walk", "sit", "sleep", "happy", "greet"]

/** Every engine pose plays one clip; P2/P3 poses fall back to the nearest P1 clip until their art exists. */
const CLIP_BY_POSE: Readonly<Record<RoomPetPose, RoomPetClipName>> = {
  stand: "idle",
  walk: "walk",
  run: "walk",
  hop: "walk",
  sit: "sit",
  perch: "sit",
  curl: "sleep",
  sleep: "sleep",
  happy: "happy",
  trickRoll: "happy",
  trickHop: "happy",
  trickWave: "happy"
}

export function getRoomPetClipForPose(pose: RoomPetPose): RoomPetClipName {
  return CLIP_BY_POSE[pose]
}

/** The heading for a screen-space direction (dy > 0 is down the screen, toward the camera). */
export function getRoomPetSpriteHeading(dx: number, dy: number): RoomPetSpriteHeading {
  const isRight = dx >= 0
  const isToward = dy >= 0
  if (isToward) return isRight ? 135 : 225
  return isRight ? 45 : 315
}

/** The drawn heading and whether to mirror it: 315 mirrors 45, 225 mirrors 135. */
export function getRoomPetDrawnHeading(heading: RoomPetSpriteHeading): { heading: RoomPetDrawnHeading; mirrored: boolean } {
  if (heading === 315) return { heading: 45, mirrored: true }
  if (heading === 225) return { heading: 135, mirrored: true }
  return { heading, mirrored: false }
}

/**
 * The cell shown `elapsedMs` after a clip started. A loop plays its lead-in
 * (frames before `loopFrom`) once and then wraps; a one-shot clip holds its
 * last frame. Runs on the UI thread.
 */
export function getRoomPetSpriteCell(
  frames: readonly number[],
  fps: number,
  loop: boolean,
  elapsedMs: number,
  loopFrom = 0
): number {
  "worklet"
  if (frames.length === 0) return 0
  const step = Math.max(0, Math.floor((Math.max(0, elapsedMs) * fps) / 1000))
  if (!loop) return frames[Math.min(step, frames.length - 1)]!
  const start = Math.min(Math.max(0, Math.floor(loopFrom)), frames.length - 1)
  const index = step < frames.length ? step : start + ((step - start) % (frames.length - start))
  return frames[index]!
}

/** Problems that would make a sheet draw the wrong cell; empty when the sheet is usable. */
export function getRoomPetSpriteSheetProblems(layout: RoomPetSpriteSheetLayout): string[] {
  const problems: string[] = []
  const cellCount = layout.columns * layout.rows
  if (!(layout.cellWidth > 0 && layout.cellHeight > 0 && cellCount > 0)) problems.push("sheet has no cells")
  if (!(layout.footAnchorY > 0 && layout.footAnchorY <= 1)) problems.push("foot anchor must sit inside the cell")
  if (!(layout.cellHeightShellPx > 0)) problems.push("cell needs a positive height in shell pixels")
  for (const name of ROOM_PET_CLIP_NAMES) {
    const clip = layout.clips[name]
    if (!clip) {
      problems.push(`clip ${name} is missing`)
      continue
    }
    if (!(clip.fps > 0)) problems.push(`clip ${name} needs a positive fps`)
    const shortest = Math.min(clip.frames[45]?.length ?? 0, clip.frames[135]?.length ?? 0)
    if (!(Number.isInteger(clip.loopFrom) && clip.loopFrom >= 0 && (clip.loopFrom === 0 || clip.loopFrom < shortest))) {
      problems.push(`clip ${name} loops from outside its frames`)
    }
    for (const heading of [45, 135] as const) {
      const frames = clip.frames[heading] ?? []
      if (frames.length === 0) problems.push(`clip ${name} has no frames for heading ${heading}`)
      if (frames.some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= cellCount)) {
        problems.push(`clip ${name} heading ${heading} points outside the sheet`)
      }
    }
  }
  return problems
}
