export type RoomVNextRuntimeMode = "disabled" | "candidate-proof" | "promoted"

export interface RoomVNextRuntimeGateInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawFlag: string | undefined
  independentReviewApproved: boolean
  finalUserApproval: boolean
}

export interface RoomVNextRuntimeGateResult {
  enabled: boolean
  mode: RoomVNextRuntimeMode
  reason:
    | "disabled"
    | "candidate-proof"
    | "promotion-locked"
    | "promoted"
}

/**
 * Keeps the VNext renderer fail-closed. Candidate proof may be enabled only in
 * the interactive development build or the isolated native-ui-test build;
 * promotion requires both independent review and the single final user
 * approval. The default path remains the legacy renderer.
 */
export function resolveRoomVNextRuntimeGate(
  input: RoomVNextRuntimeGateInput
): RoomVNextRuntimeGateResult {
  const allowedBuild =
    (input.isDevelopmentRuntime && input.buildProfile === "development") ||
    input.buildProfile === "native-ui-test"
  const explicitlyEnabled = allowedBuild && input.rawFlag?.trim() === "1"

  if (!explicitlyEnabled) {
    return {
      enabled: false,
      mode: "disabled",
      reason: "disabled"
    }
  }

  if (!input.independentReviewApproved || !input.finalUserApproval) {
    return {
      enabled: true,
      mode: "candidate-proof",
      reason: "promotion-locked"
    }
  }

  return {
    enabled: true,
    mode: "promoted",
    reason: "promoted"
  }
}

export const ROOM_VNEXT_RUNTIME_PROOF_FLAG =
  "EXPO_PUBLIC_BLUMI_ROOM_VNEXT_RUNTIME_PROOF"
