interface ContinueFromOnboardingIntroInput {
  requiresCompletion: boolean
  completeIntro: () => Promise<void>
  beforeNavigate?: () => Promise<void> | void
  navigate: () => void
}

/**
 * Persisting "intro seen" is a local write; it must not hold the visible
 * handoff back. Both start together and navigation waits for both, so a
 * failed write still never navigates (the caller cancels the handoff).
 */
export async function continueFromOnboardingIntro(
  input: ContinueFromOnboardingIntroInput
): Promise<void> {
  await Promise.all([
    input.requiresCompletion ? input.completeIntro() : Promise.resolve(),
    Promise.resolve().then(() => input.beforeNavigate?.())
  ])
  input.navigate()
}
