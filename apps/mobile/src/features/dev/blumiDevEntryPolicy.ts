import type { BlumiDevEntryRoute } from "../../config/env"

export function canApplyBlumiDevEntry(input: {
  route: BlumiDevEntryRoute | undefined
  buildProfile: string
  isDevelopmentRuntime: boolean
}): boolean {
  if (!input.route) return false

  // Native UI tests run from a signed, isolated test profile where React
  // Native's __DEV__ flag is intentionally false. Keep the entry explicit
  // and profile-bound while allowing that profile to reach its QA surface.
  return input.buildProfile === "native-ui-test" ||
    (input.isDevelopmentRuntime && input.buildProfile === "development")
}

export function shouldApplyBlumiDevEntryNavigation(input: {
  route: BlumiDevEntryRoute | undefined
  buildProfile: string
  isDevelopmentRuntime: boolean
  sessionEntryRoute: string
  hasSessionActor: boolean
  navigationReady: boolean
  appliedNavigationGeneration: number | null
  navigationGeneration: number
}): boolean {
  return canApplyBlumiDevEntry({
    route: input.route,
    buildProfile: input.buildProfile,
    isDevelopmentRuntime: input.isDevelopmentRuntime
  }) &&
    input.sessionEntryRoute === "Main" &&
    input.hasSessionActor &&
    input.navigationReady &&
    input.appliedNavigationGeneration !== input.navigationGeneration
}
