import type {
  OnboardingStatus,
  SessionMode
} from "../session/sessionModel"

export function shouldHydrateProductionInventory(
  sessionMode: SessionMode,
  onboarding: OnboardingStatus
): boolean {
  return sessionMode === "production" &&
    onboarding.profile === "complete" &&
    onboarding.avatar === "complete" &&
    onboarding.room === "complete"
}
