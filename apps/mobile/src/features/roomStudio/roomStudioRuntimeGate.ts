export const ROOM_STUDIO_QA_RUNTIME_FLAG =
  "EXPO_PUBLIC_BLUMI_HOME_STUDIO_QA" as const

export type RoomStudioRuntimeMode =
  | "disabled"
  | "blocked"
  | "preview-only"
  | "guided-remix"

export interface RoomStudioRuntimeGateInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawFlag: string | undefined
  visualReviewApproved: boolean
  directionalAssetsApproved: boolean
}

export interface RoomStudioRuntimeGateResult {
  enabled: boolean
  mode: RoomStudioRuntimeMode
  canPreview: boolean
  canRotate: boolean
  reason:
    | "disabled"
    | "visual-review-blocked"
    | "directional-assets-blocked"
    | "guided-remix"
}

export function resolveRoomStudioRuntimeGate(
  input: RoomStudioRuntimeGateInput
): RoomStudioRuntimeGateResult {
  const allowedBuild =
    (input.isDevelopmentRuntime && input.buildProfile === "development") ||
    input.buildProfile === "native-ui-test"
  const explicitlyEnabled = allowedBuild && input.rawFlag === "1"

  if (!explicitlyEnabled) return disabledGate()

  if (!input.visualReviewApproved) {
    return {
      enabled: true,
      mode: "blocked",
      canPreview: false,
      canRotate: false,
      reason: "visual-review-blocked"
    }
  }

  if (!input.directionalAssetsApproved) {
    return {
      enabled: true,
      mode: "preview-only",
      canPreview: true,
      canRotate: false,
      reason: "directional-assets-blocked"
    }
  }

  return {
    enabled: true,
    mode: "guided-remix",
    canPreview: true,
    canRotate: true,
    reason: "guided-remix"
  }
}

function disabledGate(): RoomStudioRuntimeGateResult {
  return {
    enabled: false,
    mode: "disabled",
    canPreview: false,
    canRotate: false,
    reason: "disabled"
  }
}
