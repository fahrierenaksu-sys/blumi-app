import assert from "node:assert/strict"
import test from "node:test"
import {
  createOnboardingFunnelEvent,
  getPreAuthSetupLayerDirection,
  getPreviousPreAuthSetupStep,
  getUnauthenticatedOnboardingDestination,
  getOnboardingSaveIntent,
  getOnboardingScreenMode,
  getSessionNavigatorKey,
  shouldGateOnboardingBootPrelude,
  shouldAcceptRegisterStageChange,
  getPreAuthSetupStepToPrepare,
  PRE_AUTH_NEXT_STEP_PREPARE_DELAY_MS
} from "./onboardingFlowModel"

test("setup layers preserve navigation direction without a full page slide", () => {
  assert.equal(getPreAuthSetupLayerDirection("profile", "profile"), 0)
  assert.equal(getPreAuthSetupLayerDirection("profile", "avatar"), -1)
  assert.equal(getPreAuthSetupLayerDirection("room", "avatar"), 1)
  assert.equal(getPreAuthSetupLayerDirection("phone", "otp"), -1)
  assert.equal(getPreAuthSetupLayerDirection("otp", "phone"), 1)
})

test("setup back navigation is explicit and independent of navigator history", () => {
  assert.equal(getPreviousPreAuthSetupStep("profile"), null)
  assert.equal(getPreviousPreAuthSetupStep("avatar"), "profile")
  assert.equal(getPreviousPreAuthSetupStep("room"), "avatar")
  assert.equal(getPreviousPreAuthSetupStep("phone"), "room")
  assert.equal(getPreviousPreAuthSetupStep("otp"), "phone")
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

test("boot prelude gates every onboarding-facing cold-launch route", () => {
  assert.equal(shouldGateOnboardingBootPrelude("AuthEntry"), true)
  assert.equal(shouldGateOnboardingBootPrelude("ProfileSetup"), true)
  assert.equal(shouldGateOnboardingBootPrelude("AvatarSetup"), true)
  assert.equal(shouldGateOnboardingBootPrelude("RoomSetup"), true)
  assert.equal(shouldGateOnboardingBootPrelude("Main"), false)
  assert.equal(shouldGateOnboardingBootPrelude("Splash"), false)
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

test("navigator identity stays stable while moving between onboarding screens", () => {
  assert.equal(getSessionNavigatorKey("ProfileSetup", "user_one"), "onboarding:user_one")
  assert.equal(getSessionNavigatorKey("AvatarSetup", "user_one"), "onboarding:user_one")
  assert.equal(getSessionNavigatorKey("RoomSetup", "user_one"), "onboarding:user_one")
  assert.equal(getSessionNavigatorKey("Main", "user_one"), "main:user_one")
  assert.equal(getSessionNavigatorKey("AuthEntry", undefined), "auth")
})

test("each setup step prepares only its direct successor", () => {
  assert.equal(getPreAuthSetupStepToPrepare("profile"), "avatar")
  assert.equal(getPreAuthSetupStepToPrepare("avatar"), "room")
  assert.equal(getPreAuthSetupStepToPrepare("room"), "phone")
  assert.equal(getPreAuthSetupStepToPrepare("phone"), null)
  assert.equal(getPreAuthSetupStepToPrepare("otp"), null)
  assert.ok(PRE_AUTH_NEXT_STEP_PREPARE_DELAY_MS >= 400, "after the 360 ms step entrance settles")
})
