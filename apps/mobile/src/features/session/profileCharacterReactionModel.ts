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
