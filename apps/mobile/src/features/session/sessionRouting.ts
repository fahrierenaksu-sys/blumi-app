import type { SessionActor } from "./sessionModel"

export type SessionEntryRoute =
  | "Splash"
  | "Welcome"
  | "AuthEntry"
  | "ProfileSetup"
  | "AvatarSetup"
  | "RoomSetup"
  | "Main"

export interface SelectSessionEntryRouteInput {
  isHydrating: boolean
  hasSeenIntro: boolean
  sessionActor: SessionActor | null
}

export function selectSessionEntryRoute(
  input: SelectSessionEntryRouteInput
): SessionEntryRoute {
  if (input.isHydrating) return "Splash"
  if (!input.sessionActor) {
    // The former four-step marketing carousel is no longer part of first
    // launch. Unauthenticated users should reach the actionable auth entry
    // (phone/demo) immediately; keep hasSeenIntro in the input for
    // persisted-session compatibility.
    return "AuthEntry"
  }

  const { onboarding } = input.sessionActor.session
  if (onboarding.profile !== "complete") return "ProfileSetup"
  if (onboarding.avatar !== "complete") return "AvatarSetup"
  if (onboarding.room !== "complete") return "RoomSetup"
  return "Main"
}
