import {
  completeSessionSetupStep,
  replaceSessionActorOnboarding,
  type OnboardingStatus,
  type SessionActor,
  type SessionSetupStep
} from "./sessionModel"

interface CompleteAndPersistSessionSetupStepInput {
  actor: SessionActor
  step: SessionSetupStep
  completeProductionStep: (step: SessionSetupStep) => Promise<OnboardingStatus>
  saveActor: (actor: SessionActor) => Promise<void>
}

export async function completeAndPersistSessionSetupStep(
  input: CompleteAndPersistSessionSetupStepInput
): Promise<SessionActor> {
  const nextActor = input.actor.session.mode === "production"
    ? replaceSessionActorOnboarding(
        input.actor,
        await input.completeProductionStep(input.step)
      )
    : completeSessionSetupStep(input.actor, input.step)

  await input.saveActor(nextActor)
  return nextActor
}
