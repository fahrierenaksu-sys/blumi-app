import type { AppLocale } from "./appLocale"

/**
 * "You did it" (MOTION_PLAN §C, journey 14): right after a new account
 * finishes setting up, the person's own chibi appears for a beat with a short
 * congratulation, then dissolves into Discover. It plays once, only for the
 * transition into the app that completes onboarding (never for a restored
 * session, a returning sign-in, or demo mode).
 */

/** Onboarding completed longer ago than this is a returning account. */
export const ONBOARDING_DONE_RECENT_MS = 10 * 60_000

/** How long the moment holds once the chibi has landed (tap skips it). */
export const ONBOARDING_DONE_HOLD_MS = 1_100

export function shouldCelebrateOnboardingDone(input: {
  /** The entry route before this change; undefined on the first decision of a launch. */
  previousRoute: string | undefined
  nextRoute: string
  mode: string | undefined
  /** OnboardingStatus.completedAt of the signed-in account. */
  completedAt: string | undefined
  now: number
  alreadyCelebrated: boolean
}): boolean {
  if (input.alreadyCelebrated || input.nextRoute !== "Main" || input.mode !== "production") return false
  // A cold start restores straight into Main: not a moment.
  if (!input.previousRoute || input.previousRoute === "Main" || input.previousRoute === "Splash") return false
  const completedAt = input.completedAt ? Date.parse(input.completedAt) : Number.NaN
  if (!Number.isFinite(completedAt)) return false
  const age = input.now - completedAt
  return age >= -60_000 && age <= ONBOARDING_DONE_RECENT_MS
}

export function getOnboardingDoneCopy(locale: AppLocale, displayName: string): {
  headline: string
  body: string
  skipLabel: string
} {
  const name = displayName.trim()
  return locale === "tr"
    ? {
        headline: "Başardın!",
        body: name ? `Blumi'ye hoş geldin, ${name}.` : "Blumi'ye hoş geldin.",
        skipLabel: "Keşfet'e geç"
      }
    : {
        headline: "You did it!",
        body: name ? `Welcome to Blumi, ${name}.` : "Welcome to Blumi.",
        skipLabel: "Go to Discover"
      }
}
