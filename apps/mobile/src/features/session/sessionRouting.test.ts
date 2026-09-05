import assert from "node:assert/strict"
import test from "node:test"
import {
  createProductionSessionActor,
  completeSessionSetupStep
} from "./sessionModel"
import { selectSessionEntryRoute } from "./sessionRouting"

test("hydrating state always keeps the app on the bounded splash route", () => {
  assert.equal(
    selectSessionEntryRoute({
      isHydrating: true,
      hasSeenIntro: true,
      sessionActor: null
    }),
    "Splash"
  )
})

test("missing session starts at auth entry without the retired intro carousel", () => {
  assert.equal(
    selectSessionEntryRoute({
      isHydrating: false,
      hasSeenIntro: false,
      sessionActor: null
    }),
    "AuthEntry"
  )
  assert.equal(
    selectSessionEntryRoute({
      isHydrating: false,
      hasSeenIntro: true,
      sessionActor: null
    }),
    "AuthEntry"
  )
})

test("incomplete onboarding resumes at the first missing setup step", () => {
  const actor = createProductionSessionActor({
    accountId: "account-1",
    sessionId: "session-1",
    userId: "user-1",
    sessionToken: "token-1",
    expiresAt: "2999-01-01T00:00:00.000Z",
    profile: {
      userId: "user-1",
      displayName: "",
      avatar: { presetId: "dusk" }
    }
  })

  assert.equal(
    selectSessionEntryRoute({
      isHydrating: false,
      hasSeenIntro: true,
      sessionActor: actor
    }),
    "ProfileSetup"
  )

  const profileComplete = completeSessionSetupStep(actor, "profile")
  assert.equal(
    selectSessionEntryRoute({
      isHydrating: false,
      hasSeenIntro: true,
      sessionActor: profileComplete
    }),
    "AvatarSetup"
  )

  const avatarComplete = completeSessionSetupStep(profileComplete, "avatar")
  assert.equal(
    selectSessionEntryRoute({
      isHydrating: false,
      hasSeenIntro: true,
      sessionActor: avatarComplete
    }),
    "RoomSetup"
  )
})

test("completed onboarding unlocks the main app", () => {
  let actor = createProductionSessionActor({
    accountId: "account-1",
    sessionId: "session-1",
    userId: "user-1",
    sessionToken: "token-1",
    expiresAt: "2999-01-01T00:00:00.000Z",
    profile: {
      userId: "user-1",
      displayName: "Ece",
      age: 24,
      avatar: { presetId: "sunset" }
    }
  })

  actor = completeSessionSetupStep(actor, "profile")
  actor = completeSessionSetupStep(actor, "avatar")
  actor = completeSessionSetupStep(actor, "room")

  assert.equal(
    selectSessionEntryRoute({
      isHydrating: false,
      hasSeenIntro: true,
      sessionActor: actor
    }),
    "Main"
  )
})
