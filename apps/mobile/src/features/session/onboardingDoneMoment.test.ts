import assert from "node:assert/strict"
import test from "node:test"
import {
  getOnboardingDoneCopy,
  ONBOARDING_DONE_RECENT_MS,
  shouldCelebrateOnboardingDone
} from "./onboardingDoneMomentModel"

// "You did it" plays once, for the account that just finished setting up,
// and never for a restored session, a returning sign-in or demo mode.

const now = Date.parse("2026-10-02T12:00:00.000Z")
const justCompleted = new Date(now - 4_000).toISOString()
const fresh = {
  previousRoute: "RoomSetup",
  nextRoute: "Main",
  mode: "production",
  completedAt: justCompleted,
  now,
  alreadyCelebrated: false
}

test("finishing setup lands in the app with the moment", () => {
  assert.equal(shouldCelebrateOnboardingDone(fresh), true)
  // An account created complete goes straight from the auth flow into the app.
  assert.equal(shouldCelebrateOnboardingDone({ ...fresh, previousRoute: "AuthEntry" }), true)
})

test("a restored session, a returning account, demo mode or a replay never celebrate", () => {
  assert.equal(shouldCelebrateOnboardingDone({ ...fresh, previousRoute: undefined }), false, "cold start")
  assert.equal(shouldCelebrateOnboardingDone({ ...fresh, previousRoute: "Splash" }), false, "restored session")
  assert.equal(shouldCelebrateOnboardingDone({ ...fresh, previousRoute: "Main" }), false)
  assert.equal(shouldCelebrateOnboardingDone({
    ...fresh,
    previousRoute: "AuthEntry",
    completedAt: new Date(now - ONBOARDING_DONE_RECENT_MS - 1).toISOString()
  }), false, "signing back in to an older account")
  assert.equal(shouldCelebrateOnboardingDone({ ...fresh, completedAt: undefined }), false)
  assert.equal(shouldCelebrateOnboardingDone({ ...fresh, mode: "demo" }), false)
  assert.equal(shouldCelebrateOnboardingDone({ ...fresh, alreadyCelebrated: true }), false)
  assert.equal(shouldCelebrateOnboardingDone({ ...fresh, nextRoute: "RoomSetup" }), false)
})

test("the moment greets by name in the device language, and without a name too", () => {
  assert.match(getOnboardingDoneCopy("tr", "Deniz").body, /Deniz/)
  assert.match(getOnboardingDoneCopy("en", "Deniz").body, /Deniz/)
  assert.notEqual(getOnboardingDoneCopy("tr", "Deniz").headline, getOnboardingDoneCopy("en", "Deniz").headline)
  assert.doesNotMatch(getOnboardingDoneCopy("en", "  ").body, /,\s*\./)
})
