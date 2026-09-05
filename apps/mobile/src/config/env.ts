import { resolveRoomVNextRuntimeGate } from "../features/roomV2/roomVNextRuntimeGate"
import { resolveOnboardingRunAssetMode } from "../features/session/onboardingRunAssetGate"
import { resolveOnboardingWelcomeHomeAssetMode } from "../features/session/onboardingWelcomeHomeAssetGate"
import { ONBOARDING_ASSET_PRODUCTION_PROMOTION } from "../features/session/onboardingAssetPromotion"
import { resolveProfileCharacterReactionAssetMode } from "../features/session/profileCharacterReactionAssetGate"

function ensureNoTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

export const MOBILE_HTTP_BASE_URL = ensureNoTrailingSlash(
  process.env.EXPO_PUBLIC_BLUMI_API_HTTP_URL ?? "http://127.0.0.1:4000"
)

export const MOBILE_WS_BASE_URL = ensureNoTrailingSlash(
  process.env.EXPO_PUBLIC_REALTIME_EDGE_WS_URL ?? "ws://127.0.0.1:4100"
)

export type BlumiMediaMode = "demo" | "native"

const rawMediaMode = process.env.EXPO_PUBLIC_BLUMI_MEDIA_MODE
  ?.trim()
  .toLowerCase()

export const BLUMI_MEDIA_MODE: BlumiMediaMode =
  rawMediaMode === "native" ? "native" : "demo"

export const IS_BLUMI_MEDIA_DEMO_MODE = BLUMI_MEDIA_MODE === "demo"

export const IS_BLUMI_DEMO_ENABLED =
  process.env.EXPO_PUBLIC_BLUMI_ENABLE_DEMO?.trim() === "1"

export const BLUMI_BUILD_PROFILE =
  process.env.EXPO_PUBLIC_BLUMI_BUILD_PROFILE?.trim() || "development"

export interface BlumiNativeUiTestSessionResetInput {
  buildProfile: string
  rawResetFlag: string | undefined
}

/**
 * This flag is compiled into the dedicated native UI test build only. It must
 * never reset an installed production user's session.
 */
export function resolveBlumiNativeUiTestSessionResetEnabled(
  input: BlumiNativeUiTestSessionResetInput
): boolean {
  return (
    input.buildProfile === "native-ui-test" &&
    input.rawResetFlag?.trim() === "1"
  )
}

export const IS_BLUMI_NATIVE_UI_TEST_SESSION_RESET =
  resolveBlumiNativeUiTestSessionResetEnabled({
    buildProfile: BLUMI_BUILD_PROFILE,
    rawResetFlag: process.env.EXPO_PUBLIC_BLUMI_NATIVE_UI_TEST_SESSION_RESET
  })

export interface BlumiRoomV3DraftPreviewInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawPreviewFlag: string | undefined
}

export function resolveBlumiRoomV3DraftPreviewEnabled(
  input: BlumiRoomV3DraftPreviewInput
): boolean {
  return (
    input.isDevelopmentRuntime &&
    input.buildProfile === "development" &&
    input.rawPreviewFlag?.trim() === "1"
  )
}

/**
 * Universal Core furniture QA has its own explicit gate. Keeping a named
 * resolver prevents the furniture catalog from accidentally inheriting the
 * shell's draft-preview flag.
 */
export function resolveBlumiUniversalCoreQaEnabled(
  input: BlumiRoomV3DraftPreviewInput
): boolean {
  return resolveBlumiRoomV3DraftPreviewEnabled(input)
}

const isDevelopmentRuntime =
  typeof __DEV__ === "boolean" && __DEV__

export const BLUMI_ONBOARDING_RUN_V3_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ONBOARDING_RUN_V3_QA
export const BLUMI_ONBOARDING_RUN_V3_REVIEW_APPROVED_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ONBOARDING_RUN_V3_REVIEW_APPROVED
export const BLUMI_ONBOARDING_RUN_V3_USER_APPROVED_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ONBOARDING_RUN_V3_USER_APPROVED

export const ONBOARDING_RUN_ASSET_MODE = resolveOnboardingRunAssetMode({
  isDevelopmentRuntime,
  buildProfile: BLUMI_BUILD_PROFILE,
  rawQaFlag: BLUMI_ONBOARDING_RUN_V3_QA_FLAG,
  independentReviewApproved:
    BLUMI_ONBOARDING_RUN_V3_REVIEW_APPROVED_FLAG?.trim() === "1",
  finalUserApproval:
    BLUMI_ONBOARDING_RUN_V3_USER_APPROVED_FLAG?.trim() === "1",
  productionApproved: ONBOARDING_ASSET_PRODUCTION_PROMOTION.run
})

export const ONBOARDING_WELCOME_HOME_ASSET_MODE =
  resolveOnboardingWelcomeHomeAssetMode({
    isDevelopmentRuntime,
    buildProfile: BLUMI_BUILD_PROFILE,
    rawQaFlag: process.env.EXPO_PUBLIC_BLUMI_ONBOARDING_WELCOME_HOME_QA,
    independentReviewApproved:
      process.env.EXPO_PUBLIC_BLUMI_ONBOARDING_WELCOME_HOME_REVIEW_APPROVED?.trim() === "1",
    finalUserApproval:
      process.env.EXPO_PUBLIC_BLUMI_ONBOARDING_WELCOME_HOME_USER_APPROVED?.trim() === "1",
    productionApproved: ONBOARDING_ASSET_PRODUCTION_PROMOTION.welcomeHome
  })

export const PROFILE_CHARACTER_REACTION_ASSET_MODE =
  resolveProfileCharacterReactionAssetMode({
    isDevelopmentRuntime,
    buildProfile: BLUMI_BUILD_PROFILE,
    rawQaFlag: process.env.EXPO_PUBLIC_BLUMI_PROFILE_CHARACTER_REACTION_QA,
    independentReviewApproved:
      process.env.EXPO_PUBLIC_BLUMI_PROFILE_CHARACTER_REACTION_REVIEW_APPROVED?.trim() === "1",
    finalUserApproval:
      process.env.EXPO_PUBLIC_BLUMI_PROFILE_CHARACTER_REACTION_USER_APPROVED?.trim() === "1",
    productionApproved:
      ONBOARDING_ASSET_PRODUCTION_PROMOTION.profileCharacterReaction
  })

export const IS_BLUMI_ROOM_V3_DRAFT_PREVIEW =
  resolveBlumiRoomV3DraftPreviewEnabled({
    isDevelopmentRuntime,
    buildProfile: BLUMI_BUILD_PROFILE,
    rawPreviewFlag: process.env.EXPO_PUBLIC_BLUMI_ROOM_V3_DRAFT_PREVIEW
  })

export const BLUMI_ROOM_V3_DRAFT_PREVIEW_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ROOM_V3_DRAFT_PREVIEW

export const BLUMI_UNIVERSAL_CORE_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_UNIVERSAL_CORE_QA

/** Separate development-only gate for the three Focus 12 candidate products. */
export const BLUMI_FOCUS_12_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_FOCUS_12_QA

/** Development-only Room Cohesion VNext renderer proof flag. */
export const BLUMI_ROOM_VNEXT_RUNTIME_PROOF_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ROOM_VNEXT_RUNTIME_PROOF

/** Isolated Home Studio Scene Kit preview flag; never a production feature flag. */
export const BLUMI_HOME_STUDIO_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_HOME_STUDIO_QA

/** Candidate-only visual gate; native proof and user approval remain separate. */
export const BLUMI_HOME_STUDIO_VISUAL_REVIEW_APPROVED_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_HOME_STUDIO_VISUAL_REVIEW_APPROVED

/** Development-only 45-piece Room VNext full-wave QA flag. */
export const BLUMI_ROOM_VNEXT_FULL_WAVE_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ROOM_VNEXT_FULL_WAVE_QA

/** Candidate-only visual polish overlay for the bounded full-wave QA packet. */
export const BLUMI_ROOM_VNEXT_FULL_WAVE_POLISH_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ROOM_VNEXT_FULL_WAVE_POLISH_QA

/** Candidate-only full 45-SKU v2 art packet for bounded Simulator QA. */
export const BLUMI_ROOM_VNEXT_FULL_WAVE_POLISH_FULL_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ROOM_VNEXT_FULL_WAVE_POLISH_FULL_QA

/** Candidate-only cute v3 art packet; requires the full-wave QA flag too. */
export const BLUMI_ROOM_VNEXT_FULL_WAVE_CUTE_V3_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ROOM_VNEXT_FULL_WAVE_CUTE_V3_QA

/** Explicit promotion approvals; both remain fail-closed unless supplied by
 * the release evidence workflow. They cannot enable a release build because
 * the runtime gate only allow-lists development/native-ui-test profiles. */
export const BLUMI_ROOM_VNEXT_INDEPENDENT_REVIEW_APPROVED_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ROOM_VNEXT_INDEPENDENT_REVIEW_APPROVED
export const BLUMI_ROOM_VNEXT_FINAL_USER_APPROVAL_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ROOM_VNEXT_FINAL_USER_APPROVAL

export interface BlumiRoomVNextRuntimeProofInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawProofFlag: string | undefined
}

export interface BlumiRoomVNextFullWaveQaInput {
  isDevelopmentRuntime: boolean
  buildProfile: string
  rawQaFlag: string | undefined
}

/**
 * Candidate Room VNext may run in the interactive development app or in the
 * isolated native-ui-test build. It remains closed for every release profile;
 * the native test profile is explicitly allow-listed so Simulator evidence
 * exercises the same candidate renderer instead of silently testing legacy.
 */
export function resolveBlumiRoomVNextRuntimeProofEnabled(
  input: BlumiRoomVNextRuntimeProofInput
): boolean {
  const allowedBuild =
    (input.isDevelopmentRuntime && input.buildProfile === "development") ||
    input.buildProfile === "native-ui-test"
  return allowedBuild && input.rawProofFlag?.trim() === "1"
}

export const IS_BLUMI_ROOM_VNEXT_RUNTIME_PROOF =
  resolveBlumiRoomVNextRuntimeProofEnabled({
    isDevelopmentRuntime,
    buildProfile: BLUMI_BUILD_PROFILE,
    rawProofFlag: BLUMI_ROOM_VNEXT_RUNTIME_PROOF_FLAG
  })

/**
 * The full-wave 45-piece candidate catalog stays behind its own explicit QA
 * gate so it can reuse the Room editor and QA namespace without replacing the
 * smaller eight-piece proof or affecting production catalogs.
 */
export function resolveBlumiRoomVNextFullWaveQaEnabled(
  input: BlumiRoomVNextFullWaveQaInput
): boolean {
  const allowedBuild =
    (input.isDevelopmentRuntime && input.buildProfile === "development") ||
    input.buildProfile === "native-ui-test"
  return allowedBuild && input.rawQaFlag?.trim() === "1"
}

export const IS_BLUMI_ROOM_VNEXT_FULL_WAVE_QA =
  resolveBlumiRoomVNextFullWaveQaEnabled({
    isDevelopmentRuntime,
    buildProfile: BLUMI_BUILD_PROFILE,
    rawQaFlag: BLUMI_ROOM_VNEXT_FULL_WAVE_QA_FLAG
  })

export const ROOM_VNEXT_RUNTIME_GATE = resolveRoomVNextRuntimeGate({
  isDevelopmentRuntime,
  buildProfile: BLUMI_BUILD_PROFILE,
  rawFlag:
    IS_BLUMI_ROOM_VNEXT_RUNTIME_PROOF ||
    IS_BLUMI_ROOM_VNEXT_FULL_WAVE_QA
      ? "1"
      : undefined,
  independentReviewApproved:
    BLUMI_ROOM_VNEXT_INDEPENDENT_REVIEW_APPROVED_FLAG?.trim() === "1",
  finalUserApproval:
    BLUMI_ROOM_VNEXT_FINAL_USER_APPROVAL_FLAG?.trim() === "1"
})

export const ROOM_VNEXT_RUNTIME_MODE = ROOM_VNEXT_RUNTIME_GATE.mode

export const BLUMI_QA_UNLOCK_AVATAR_ITEMS_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS

export const BLUMI_SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || undefined

export const BLUMI_POSTHOG_API_KEY =
  process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || undefined

export const BLUMI_POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || undefined

/**
 * RevenueCat platform API keys are publishable SDK identifiers, not provider
 * secrets. Release validation still requires them so a signed build cannot
 * silently fall back to a local or mock purchase flow.
 */
export const BLUMI_REVENUECAT_IOS_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || undefined

export const BLUMI_REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || undefined

export type BlumiDevEntryRoute =
  | "myroom"
  | "mini-room-rig-preview"
  | "home-studio-pilot"

const rawDevEntryRoute = process.env.EXPO_PUBLIC_BLUMI_DEV_ENTRY_ROUTE
  ?.trim()
  .toLowerCase()

export const BLUMI_DEV_ENTRY_ROUTE: BlumiDevEntryRoute | undefined =
  rawDevEntryRoute === "myroom" ||
  rawDevEntryRoute === "mini-room-rig-preview" ||
  rawDevEntryRoute === "home-studio-pilot"
    ? rawDevEntryRoute
    : undefined
