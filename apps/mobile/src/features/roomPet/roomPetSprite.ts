import type { RoomPoint2D } from "../roomV2/roomV2.types"
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
export type RoomPetClipName = "idle" | "walk" | "sit" | "sleep" | "happy" | "greet" | "hopUp" | "hopDown" | "hopPlay"
export type RoomPetSpriteHeading = 45 | 135 | 225 | 315
export type RoomPetDrawnHeading = 45 | 135

export interface RoomPetSpriteClip {
  readonly fps: number
  readonly loop: boolean
  /** A looping clip plays frames before this index once (sit down, curl up), then loops from it. */
  readonly loopFrom: number
  readonly frames: Readonly<Record<RoomPetDrawnHeading, readonly number[]>>
  /** Hop clips only: where the feet are on each frame (the cells hold the body pose, not the jump). */
  readonly rootMotion?: RoomPetRootMotion
}

/**
 * Root motion of a hop, one entry per frame (same for both headings).
 * The feet stand at lerp(from, to, travel[i]) and then arcShellPx[i] room
 * shell pixels higher. `from`/`to` are the floor point and the seat point
 * (hopUp), the reverse (hopDown), or the same point (hopPlay, travel all 0).
 * The seat height comes from the furniture's seat point, never from the art.
 */
export interface RoomPetRootMotion {
  readonly travel: readonly number[]
  readonly arcShellPx: readonly number[]
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

export const ROOM_PET_CLIP_NAMES: readonly RoomPetClipName[] = ["idle", "walk", "sit", "sleep", "happy", "greet", "hopUp", "hopDown", "hopPlay"]

/** Every engine pose plays one clip; P3 tricks without art fall back to the nearest clip. A hop down picks hopDown by its phase. */
const CLIP_BY_POSE: Readonly<Record<RoomPetPose, RoomPetClipName>> = {
  stand: "idle",
  walk: "walk",
  run: "walk",
  hop: "hopUp",
  sit: "sit",
  perch: "sit",
  curl: "sleep",
  sleep: "sleep",
  happy: "happy",
  trickRoll: "happy",
  trickHop: "hopPlay",
  trickWave: "happy"
}

export function getRoomPetClipForPose(pose: RoomPetPose): RoomPetClipName {
  return CLIP_BY_POSE[pose]
}

/** The clip for a pose; a hop plays hopDown on its way back to the floor. */
export function getRoomPetClipForHop(pose: RoomPetPose, hopPhase: "approach" | "up" | "perch" | "down" | null): RoomPetClipName {
  return pose === "hop" && hopPhase === "down" ? "hopDown" : getRoomPetClipForPose(pose)
}

/** How long a clip plays once, from its frame count and fps (a one-shot holds its last frame after this). */
export function getRoomPetClipDurationMs(clip: RoomPetSpriteClip): number {
  const frameCount = Math.max(clip.frames[45]?.length ?? 0, clip.frames[135]?.length ?? 0)
  return clip.fps > 0 ? (frameCount * 1000) / clip.fps : 0
}

/** The frame a one-shot clip shows `elapsedMs` after it started (holds the last frame). Runs on the UI thread. */
export function getRoomPetClipFrameIndex(frameCount: number, fps: number, elapsedMs: number): number {
  "worklet"
  if (frameCount <= 0) return 0
  return Math.min(Math.max(0, Math.floor((Math.max(0, elapsedMs) * fps) / 1000)), frameCount - 1)
}

/** The feet of a hopping pet on frame `frameIndex`, in shell-canvas units (`shellPxToStage` converts the arc). Runs on the UI thread. */
export function getRoomPetRootMotionFoot(
  from: RoomPoint2D,
  to: RoomPoint2D,
  motion: RoomPetRootMotion,
  frameIndex: number,
  shellPxToStage: number
): RoomPoint2D {
  "worklet"
  const last = motion.travel.length - 1
  if (last < 0) return from
  const index = Math.min(Math.max(0, Math.floor(frameIndex)), last)
  const travel = motion.travel[index]!
  const lift = (motion.arcShellPx[index] ?? 0) * shellPxToStage
  return { x: from.x + (to.x - from.x) * travel, y: from.y + (to.y - from.y) * travel - lift }
}

function getRootMotionProblems(name: string, clip: RoomPetSpriteClip): string[] {
  const motion = clip.rootMotion
  if (!motion) return []
  const problems: string[] = []
  const lengths = [clip.frames[45]?.length ?? 0, clip.frames[135]?.length ?? 0]
  if (lengths.some((length) => length !== motion.travel.length || length !== motion.arcShellPx.length)) {
    problems.push(`clip ${name} root motion needs one entry per frame`)
  }
  if (motion.travel.some((value, index) => !(value >= 0 && value <= 1) || (index > 0 && value < motion.travel[index - 1]!))) {
    problems.push(`clip ${name} root motion travel must rise from 0 to 1`)
  }
  if (motion.arcShellPx.some((value) => !(Number.isFinite(value) && value >= 0))) problems.push(`clip ${name} root motion arc must be 0 or more`)
  return problems
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
    problems.push(...getRootMotionProblems(name, clip))
  }
  return problems
}
