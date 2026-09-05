interface ContinueFromOnboardingIntroInput {
  requiresCompletion: boolean
  completeIntro: () => Promise<void>
  beforeNavigate?: () => Promise<void> | void
  navigate: () => void
}

export async function continueFromOnboardingIntro(
  input: ContinueFromOnboardingIntroInput
): Promise<void> {
  if (input.requiresCompletion) {
    await input.completeIntro()
  }
  if (input.beforeNavigate) {
    await input.beforeNavigate()
  }
  input.navigate()
}
