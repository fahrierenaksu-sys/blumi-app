export interface RoomV3QaRuntimeGateInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
}

/**
 * Keeps candidate Room V3 content outside production while allowing the
 * dedicated Release-mode native UI test bundle to exercise real QA assets.
 * Feature-specific resolvers must still require their explicit opt-in flag
 * and trusted artifact registry.
 */
export function isExplicitRoomV3QaRuntime(
  input: RoomV3QaRuntimeGateInput
): boolean {
  return (
    (input.isDevelopmentRuntime === true && input.buildProfile === "development") ||
    input.buildProfile === "native-ui-test"
  )
}
