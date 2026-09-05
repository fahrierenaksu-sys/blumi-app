import assert from "node:assert/strict"
import test from "node:test"
import type { OnboardingStatus, SessionActor, SessionSetupStep } from "./sessionModel"
import { completeAndPersistSessionSetupStep } from "./onboardingCompletion"

const actor: SessionActor = {
  session: {
    accountId: "account-1",
    sessionId: "session-1",
    mode: "production",
    userId: "user-1",
    sessionToken: "token-1",
    expiresAt: "2999-01-01T00:00:00.000Z",
    onboarding: {
      profile: "complete",
      avatar: "incomplete",
      room: "incomplete"
    }
  },
  profile: {
    userId: "user-1",
    displayName: "QA",
    avatar: { presetId: "dusk" }
  }
}

for (const step of ["avatar", "room"] as const) {
  test(`production ${step} completion replaces then persists a concrete actor`, async () => {
    const events: string[] = []
    const completed: OnboardingStatus = {
      profile: "complete",
      avatar: "complete",
      room: step === "room" ? "complete" : "incomplete"
    }

    const result = await completeAndPersistSessionSetupStep({
      actor,
      step,
      completeProductionStep: async (requestedStep: SessionSetupStep) => {
        events.push(`complete:${requestedStep}`)
        return completed
      },
      saveActor: async (nextActor: SessionActor) => {
        events.push(`save:${nextActor.session.onboarding[step]}`)
        assert.ok(nextActor.session)
      }
    })

    assert.deepEqual(events, [`complete:${step}`, "save:complete"])
    assert.equal(result.session.mode, "production")
    assert.deepEqual(result.session.onboarding, completed)
  })
}
