export type ProfileCharacterMotionStyle = "idle" | "twirl" | "collar"

export interface ProfileCharacterReactionTimeline {
  atlasColumns: number
  atlasRows: number
  frameCount: number
  frameDurationsMs: readonly number[]
  settleFrameIndex: number
}

export interface ProfileCharacterReaction {
  interactionLabel: string
  motionStyle: ProfileCharacterMotionStyle
  timeline: ProfileCharacterReactionTimeline | null
}

const FEMALE_TWIRL_TIMELINE: ProfileCharacterReactionTimeline = {
  atlasColumns: 4,
  atlasRows: 4,
  frameCount: 16,
  // More authored inbetweens let us slow the twirl without a stop-motion snap.
  frameDurationsMs: [112, 108, 108, 112, 112, 112, 112, 112, 112, 112, 112, 112, 112, 112, 176],
  settleFrameIndex: 15
}

const MALE_COLLAR_TIMELINE: ProfileCharacterReactionTimeline = {
  atlasColumns: 4,
  atlasRows: 4,
  frameCount: 16,
  // The collar gesture reads more naturally with a deliberate cadence before
  // settling into the native idle loop.
  frameDurationsMs: [150, 144, 144, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 220],
  settleFrameIndex: 15
}

export interface ProfileCharacterReactionFrameStep {
  /** The atlas frame shown from this step on. */
  frameIndex: number
  /** How long the previous frame holds before this one shows. */
  holdMs: number
}

/** Each frame change of the reaction, in order, after frame 0. */
export function getProfileCharacterReactionFrameSteps(
  timeline: ProfileCharacterReactionTimeline
): ProfileCharacterReactionFrameStep[] {
  return timeline.frameDurationsMs.map((holdMs, index) => ({ frameIndex: index + 1, holdMs }))
}

/** When the settle frame shows, from the reaction's start. */
export function getProfileCharacterReactionSettleDelayMs(
  timeline: ProfileCharacterReactionTimeline
): number {
  return timeline.frameDurationsMs
    .slice(0, timeline.settleFrameIndex)
    .reduce((total, durationMs) => total + durationMs, 0)
}

/**
 * Where the atlas sits so frame `frame` fills the cell (a translate of the
 * whole atlas). UI thread: the frame advances without a React render.
 */
export function getProfileCharacterReactionAtlasOffset(
  frame: number,
  timeline: Pick<ProfileCharacterReactionTimeline, "atlasColumns" | "frameCount">,
  cellWidth: number,
  cellHeight: number
): { x: number; y: number } {
  "worklet"
  const index = Math.max(0, Math.min(timeline.frameCount - 1, Math.round(Number.isFinite(frame) ? frame : 0)))
  const column = index % timeline.atlasColumns
  const row = Math.floor(index / timeline.atlasColumns)
  return { x: -column * cellWidth, y: -row * cellHeight }
}

export function getProfileCharacterReaction(
  gender: "woman" | "man" | undefined
): ProfileCharacterReaction {
  if (gender === "woman") {
    return {
      interactionLabel: "Kendi etrafında neşeyle dönüp tatlıca yerleşiyor",
      motionStyle: "twirl",
      timeline: FEMALE_TWIRL_TIMELINE
    }
  }
  if (gender === "man") {
    return {
      interactionLabel: "Yakasını düzelterek havalı bir duruşa yerleşiyor",
      motionStyle: "collar",
      timeline: MALE_COLLAR_TIMELINE
    }
  }
  return {
    interactionLabel: "Karakterini seçebilirsin",
    motionStyle: "idle",
    timeline: null
  }
}
