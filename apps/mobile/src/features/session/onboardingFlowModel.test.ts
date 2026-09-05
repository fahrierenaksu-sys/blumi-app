import assert from "node:assert/strict"
import test from "node:test"
import {
  createOnboardingFunnelEvent,
  getCreateAccountInitialStep,
  getOnboardingBackTarget,
  getPreAuthSetupLayerDirection,
  getPreviousPreAuthSetupStep,
  getPreAuthResumeScreen,
  getUnauthenticatedOnboardingDestination,
  getUnauthenticatedNavigatorInitialRoute,
  getOnboardingSaveIntent,
  getOnboardingScreenMode,
  getSessionNavigatorKey,
  normalizePreAuthResumeStep,
  reducePreAuthSetupStep,
  shouldGateOnboardingBootPrelude,
  shouldWaitForPreAuthDraftHydration,
  shouldAcceptRegisterStageChange
} from "./onboardingFlowModel"

test("setup layers preserve navigation direction without a full page slide", () => {
  assert.equal(getPreAuthSetupLayerDirection("profile", "profile"), 0)
  assert.equal(getPreAuthSetupLayerDirection("profile", "avatar"), -1)
  assert.equal(getPreAuthSetupLayerDirection("room", "avatar"), 1)
  assert.equal(getPreAuthSetupLayerDirection("phone", "otp"), -1)
  assert.equal(getPreAuthSetupLayerDirection("otp", "phone"), 1)
})

test("persisted pre-auth routes resume on the matching setup screen", () => {
  assert.equal(getPreAuthResumeScreen("profile"), "ProfileSetup")
  assert.equal(getPreAuthResumeScreen("avatar"), "AvatarSetup")
  assert.equal(getPreAuthResumeScreen("room"), "RoomSetup")
  assert.equal(getPreAuthResumeScreen("phone"), "Register")
})

test("setup back navigation is explicit and independent of navigator history", () => {
  assert.equal(getPreviousPreAuthSetupStep("profile"), null)
  assert.equal(getPreviousPreAuthSetupStep("avatar"), "profile")
  assert.equal(getPreviousPreAuthSetupStep("room"), "avatar")
  assert.equal(getPreviousPreAuthSetupStep("phone"), "room")
  assert.equal(getPreviousPreAuthSetupStep("otp"), "phone")

  assert.equal(reducePreAuthSetupStep("otp", { type: "back" }), "phone")
  assert.equal(reducePreAuthSetupStep("phone", { type: "back" }), "room")
  assert.equal(reducePreAuthSetupStep("profile", { type: "back" }), "profile")
  assert.equal(
    reducePreAuthSetupStep("room", { type: "go-to", step: "phone" }),
    "phone"
  )
})

test("OTP is never persisted and safely resumes at phone", () => {
  assert.equal(normalizePreAuthResumeStep("otp"), "phone")
  assert.equal(normalizePreAuthResumeStep("phone"), "phone")
})

test("a hidden mounted register panel cannot override the active setup step", () => {
  assert.equal(shouldAcceptRegisterStageChange("profile"), false)
  assert.equal(shouldAcceptRegisterStageChange("avatar"), false)
  assert.equal(shouldAcceptRegisterStageChange("room"), false)
  assert.equal(shouldAcceptRegisterStageChange("phone"), true)
  assert.equal(shouldAcceptRegisterStageChange("otp"), true)
})

test("onboarding funnel events expose only bounded non-PII properties", () => {
  assert.deepEqual(
    createOnboardingFunnelEvent("viewed", {
      step: "avatar",
      resumed: true,
      reduceMotion: false,
      flow: "create-account",
      elapsedMs: 999
    }),
    {
      name: "onboarding_step_viewed",
      properties: {
        step: "avatar",
        resumed: true,
        reduce_motion: false,
        flow: "create-account"
      }
    }
  )
  assert.deepEqual(
    createOnboardingFunnelEvent("completed", {
      step: "room",
      resumed: false,
      reduceMotion: true,
      flow: "create-account",
      elapsedMs: -42
    }),
    {
      name: "onboarding_step_completed",
      properties: {
        step: "room",
        elapsed_ms: 0,
        resumed: false,
        reduce_motion: true,
        flow: "create-account"
      }
    }
  )
})

test("new accounts complete profile, avatar and room before phone verification", () => {
  assert.equal(getUnauthenticatedOnboardingDestination("create"), "PreAuthSetup")
  assert.equal(getUnauthenticatedOnboardingDestination("sign-in"), "Register")
})

test("a saved setup draft never bypasses the authored onboarding opening", () => {
  assert.equal(getUnauthenticatedNavigatorInitialRoute(), "AuthEntry")
  assert.equal(getCreateAccountInitialStep("profile"), "profile")
  assert.equal(getCreateAccountInitialStep("avatar"), "profile")
  assert.equal(getCreateAccountInitialStep("room"), "profile")
  assert.equal(getCreateAccountInitialStep("phone"), "profile")
})

test("re-entering PreAuthSetup honors a new entry step without remounting", () => {
  assert.equal(reducePreAuthSetupStep("room", { type: "go-to", step: "profile" }), "profile")
  assert.equal(reducePreAuthSetupStep("phone", { type: "go-to", step: "profile" }), "profile")
})

test("boot prelude gates every onboarding-facing cold-launch route", () => {
  assert.equal(shouldGateOnboardingBootPrelude("AuthEntry"), true)
  assert.equal(shouldGateOnboardingBootPrelude("ProfileSetup"), true)
  assert.equal(shouldGateOnboardingBootPrelude("AvatarSetup"), true)
  assert.equal(shouldGateOnboardingBootPrelude("RoomSetup"), true)
  assert.equal(shouldGateOnboardingBootPrelude("Main"), false)
  assert.equal(shouldGateOnboardingBootPrelude("Welcome"), false)
  assert.equal(shouldGateOnboardingBootPrelude("Splash"), false)
})

test("pre-auth draft hydration never blocks the authored cold-launch opening", () => {
  assert.equal(shouldWaitForPreAuthDraftHydration("AuthEntry"), false)
  assert.equal(shouldWaitForPreAuthDraftHydration("ProfileSetup"), false)
  assert.equal(shouldWaitForPreAuthDraftHydration("AvatarSetup"), false)
  assert.equal(shouldWaitForPreAuthDraftHydration("RoomSetup"), false)
  assert.equal(shouldWaitForPreAuthDraftHydration("Main"), false)
  assert.equal(shouldWaitForPreAuthDraftHydration("Splash"), false)
})

const incomplete = {
  profile: "incomplete",
  avatar: "incomplete",
  room: "incomplete"
} as const

test("onboarding saves complete only the first incomplete server step", () => {
  assert.equal(
    getOnboardingSaveIntent("profile", incomplete),
    "update-and-complete"
  )
  assert.equal(
    getOnboardingSaveIntent("profile", {
      profile: "complete",
      avatar: "incomplete",
      room: "incomplete"
    }),
    "update-only"
  )
  assert.equal(
    getOnboardingSaveIntent("avatar", {
      profile: "complete",
      avatar: "complete",
      room: "incomplete"
    }),
    "update-only"
  )
})

test("completed setup screens open in review mode without resetting progress", () => {
  const roomStage = {
    profile: "complete",
    avatar: "complete",
    room: "incomplete"
  } as const

  assert.equal(getOnboardingScreenMode("ProfileSetup", roomStage), "review")
  assert.equal(getOnboardingScreenMode("AvatarSetup", roomStage), "review")
  assert.equal(
    getOnboardingScreenMode("RoomSetup", roomStage),
    "first-completion"
  )
})

test("onboarding back targets are explicit even on cold resume", () => {
  assert.equal(getOnboardingBackTarget("ProfileSetup"), null)
  assert.equal(getOnboardingBackTarget("AvatarSetup"), "ProfileSetup")
  assert.equal(getOnboardingBackTarget("RoomSetup"), "AvatarSetup")
})

test("navigator identity stays stable while moving between onboarding screens", () => {
  assert.equal(getSessionNavigatorKey("ProfileSetup", "user_one"), "onboarding:user_one")
  assert.equal(getSessionNavigatorKey("AvatarSetup", "user_one"), "onboarding:user_one")
  assert.equal(getSessionNavigatorKey("RoomSetup", "user_one"), "onboarding:user_one")
  assert.equal(getSessionNavigatorKey("Main", "user_one"), "main:user_one")
  assert.equal(getSessionNavigatorKey("AuthEntry", undefined), "auth")
})
