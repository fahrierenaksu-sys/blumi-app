import type {
  OnboardingStatus,
  SessionSetupStep
} from "./sessionModel"
import type { SessionEntryRoute } from "./sessionRouting"
import type { PreAuthOnboardingResumeStep } from "./preAuthOnboardingStorage"

export type OnboardingRoute = Extract<
  SessionEntryRoute,
  "ProfileSetup" | "AvatarSetup" | "RoomSetup"
>

export type OnboardingScreenMode = "first-completion" | "review"
export type OnboardingSaveIntent = "update-and-complete" | "update-only"
export type UnauthenticatedOnboardingIntent = "create" | "sign-in"
export type PreAuthSetupStep = PreAuthOnboardingResumeStep | "otp"
export type PreAuthSetupStepEvent =
  | { readonly type: "back" }
  | { readonly type: "go-to"; readonly step: PreAuthSetupStep }

const preAuthSetupStepOrder: Readonly<Record<PreAuthSetupStep, number>> = {
  profile: 0,
  avatar: 1,
  room: 2,
  phone: 3,
  otp: 4
}

export function getPreAuthSetupLayerDirection(
  layerStep: PreAuthSetupStep,
  activeStep: PreAuthSetupStep
): -1 | 0 | 1 {
  const delta = preAuthSetupStepOrder[layerStep] - preAuthSetupStepOrder[activeStep]
  return delta === 0 ? 0 : delta < 0 ? -1 : 1
}

export interface OnboardingFunnelContext {
  readonly step: PreAuthSetupStep | "intro" | "account"
  readonly resumed: boolean
  readonly reduceMotion: boolean
  readonly flow: "create-account" | "sign-in"
  readonly elapsedMs?: number
}

export type OnboardingFunnelEvent =
  | {
      readonly name: "onboarding_step_viewed"
      readonly properties: {
        readonly step: OnboardingFunnelContext["step"]
        readonly resumed: boolean
        readonly reduce_motion: boolean
        readonly flow: OnboardingFunnelContext["flow"]
      }
    }
  | {
      readonly name: "onboarding_step_completed"
      readonly properties: {
        readonly step: OnboardingFunnelContext["step"]
        readonly elapsed_ms: number
        readonly resumed: boolean
        readonly reduce_motion: boolean
        readonly flow: OnboardingFunnelContext["flow"]
      }
    }

export function getUnauthenticatedOnboardingDestination(
  intent: UnauthenticatedOnboardingIntent
): "PreAuthSetup" | "Register" {
  return intent === "create" ? "PreAuthSetup" : "Register"
}

export function getUnauthenticatedNavigatorInitialRoute(): "AuthEntry" {
  return "AuthEntry"
}

/**
 * The cinematic Whoa CTA starts the authored create-account story at identity.
 * A saved draft still hydrates its fields, but never skips the visible
 * profile-to-avatar-to-room-to-phone sequence.
 */
export function getCreateAccountInitialStep(
  _resumeStep: PreAuthOnboardingResumeStep
): "profile" {
  return "profile"
}

export function shouldGateOnboardingBootPrelude(
  route: SessionEntryRoute
): boolean {
  return (
    route === "AuthEntry" ||
    route === "ProfileSetup" ||
    route === "AvatarSetup" ||
    route === "RoomSetup"
  )
}

export function shouldWaitForPreAuthDraftHydration(
  _: SessionEntryRoute
): boolean {
  return false
}

export function getPreAuthResumeScreen(
  route: PreAuthOnboardingResumeStep
): "ProfileSetup" | "AvatarSetup" | "RoomSetup" | "Register" {
  const screens = {
    profile: "ProfileSetup",
    avatar: "AvatarSetup",
    room: "RoomSetup",
    phone: "Register"
  } as const
  return screens[route]
}

const previousPreAuthSetupSteps: Readonly<
  Record<PreAuthSetupStep, PreAuthSetupStep | null>
> = Object.freeze({
  profile: null,
  avatar: "profile",
  room: "avatar",
  phone: "room",
  otp: "phone"
})

export function getPreviousPreAuthSetupStep(
  step: PreAuthSetupStep
): PreAuthSetupStep | null {
  return previousPreAuthSetupSteps[step]
}

export function normalizePreAuthResumeStep(
  step: PreAuthSetupStep
): PreAuthOnboardingResumeStep {
  return step === "otp" ? "phone" : step
}

export function shouldAcceptRegisterStageChange(
  currentStep: PreAuthSetupStep
): boolean {
  return currentStep === "phone" || currentStep === "otp"
}

export function reducePreAuthSetupStep(
  currentStep: PreAuthSetupStep,
  event: PreAuthSetupStepEvent
): PreAuthSetupStep {
  if (event.type === "go-to") return event.step
  return getPreviousPreAuthSetupStep(currentStep) ?? currentStep
}

export function createOnboardingFunnelEvent(
  kind: "viewed" | "completed",
  context: OnboardingFunnelContext
): OnboardingFunnelEvent {
  const commonProperties = {
    step: context.step,
    resumed: context.resumed,
    reduce_motion: context.reduceMotion,
    flow: context.flow
  } as const

  if (kind === "viewed") {
    return {
      name: "onboarding_step_viewed",
      properties: commonProperties
    }
  }

  return {
    name: "onboarding_step_completed",
    properties: {
      step: commonProperties.step,
      elapsed_ms: normalizeElapsedMilliseconds(context.elapsedMs),
      resumed: commonProperties.resumed,
      reduce_motion: commonProperties.reduce_motion,
      flow: commonProperties.flow
    }
  }
}

function normalizeElapsedMilliseconds(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

const routeSteps: Record<OnboardingRoute, SessionSetupStep> = {
  ProfileSetup: "profile",
  AvatarSetup: "avatar",
  RoomSetup: "room"
}

export function getOnboardingSaveIntent(
  step: SessionSetupStep,
  onboarding: OnboardingStatus
): OnboardingSaveIntent {
  return onboarding[step] === "complete"
    ? "update-only"
    : "update-and-complete"
}

export function getOnboardingScreenMode(
  route: OnboardingRoute,
  onboarding: OnboardingStatus
): OnboardingScreenMode {
  return getOnboardingSaveIntent(routeSteps[route], onboarding) === "update-only"
    ? "review"
    : "first-completion"
}

export function getOnboardingBackTarget(
  route: OnboardingRoute
): OnboardingRoute | null {
  if (route === "AvatarSetup") return "ProfileSetup"
  if (route === "RoomSetup") return "AvatarSetup"
  return null
}

export function getSessionNavigatorKey(
  route: SessionEntryRoute,
  userId: string | undefined
): string {
  if (route === "Main") return `main:${userId ?? "no-session"}`
  if (route in routeSteps) return `onboarding:${userId ?? "no-session"}`
  return "auth"
}
