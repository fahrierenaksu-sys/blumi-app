import type { AppLocale } from "../../session/appLocale"
import { formatCoins } from "../shopFormatters"

/** Count-up/down length for a server-confirmed balance change (MICRO-1). */
export const COIN_COUNT_DURATION_MS = 500
/** Coin icon pulse: 1 -> peak -> 1, split evenly across the two halves. */
export const COIN_PULSE_PEAK_SCALE = 1.15
export const COIN_PULSE_HALF_MS = 150

const GROUP_SIZE = 3
export const UNVERIFIED_BALANCE_TEXT = "—"

export type CoinGroupSeparator = "." | ","

/** Same grouping as `formatCoins` (tr-TR ".", en-US ","), without Intl. */
export function getCoinGroupSeparator(locale: AppLocale): CoinGroupSeparator {
  return locale === "tr" ? "." : ","
}

/**
 * Formats a coin count on the UI thread. Intl is not guaranteed on the
 * Worklets runtime, so grouping is done by hand and must match `formatCoins`.
 */
export function formatCoinCount(value: number, separator: string): string {
  "worklet"
  const whole = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  const digits = String(whole)
  let grouped = ""
  for (let index = 0; index < digits.length; index += 1) {
    const remaining = digits.length - index
    if (index > 0 && remaining % GROUP_SIZE === 0) grouped += separator
    grouped += digits[index]
  }
  return grouped
}

export interface CoinBalanceTransitionInput {
  previous: number | null
  next: number
  isFirstVerified: boolean
  reduceMotion: boolean
}

export interface CoinBalanceTransition {
  durationMs: number
  animate: boolean
}

const NO_TRANSITION: CoinBalanceTransition = { durationMs: 0, animate: false }

/**
 * Only a change from one server-confirmed balance to another counts. The
 * first verified balance and Reduce Motion show the value immediately.
 */
export function getCoinBalanceTransition(input: CoinBalanceTransitionInput): CoinBalanceTransition {
  if (input.isFirstVerified || input.previous === null) return NO_TRANSITION
  if (input.previous === input.next || input.reduceMotion) return NO_TRANSITION
  return { durationMs: COIN_COUNT_DURATION_MS, animate: true }
}

export interface VerifiedCoinBalance {
  /** The server-confirmed balance shown before `current`; null until one exists. */
  previous: number | null
  /** The latest server-confirmed balance; null until inventory is verified. */
  current: number | null
  /** How the display moves from `previous` to `current`. */
  transition: CoinBalanceTransition
}

export interface CoinBalanceInput {
  coins: number
  verified: boolean
  reduceMotion: boolean
}

/**
 * Next displayed balance, or null when nothing changes. Unverified values
 * (loading, reconcile after a purchase) never enter the counter, so a purchase
 * counts from the last confirmed balance to the new confirmed one.
 */
export function getNextCoinBalance(
  balance: VerifiedCoinBalance,
  input: CoinBalanceInput
): VerifiedCoinBalance | null {
  if (!input.verified || balance.current === input.coins) return null
  return {
    previous: balance.current,
    current: input.coins,
    transition: getCoinBalanceTransition({
      previous: balance.current,
      next: input.coins,
      isFirstVerified: balance.current === null,
      reduceMotion: input.reduceMotion
    })
  }
}

/** Ends the count for `target`; a newer balance that arrived meanwhile is kept. */
export function settleCoinBalance(balance: VerifiedCoinBalance, target: number): VerifiedCoinBalance {
  if (balance.current !== target || !balance.transition.animate) return balance
  return { ...balance, transition: NO_TRANSITION }
}

/** Invisible sizing text: the wider balance while counting, so digits never clip. */
export function getCoinBalanceLayoutText(balance: VerifiedCoinBalance, locale: AppLocale): string {
  if (balance.current === null) return UNVERIFIED_BALANCE_TEXT
  const current = formatCoins(balance.current, locale)
  if (balance.previous === null || !balance.transition.animate) return current
  const previous = formatCoins(balance.previous, locale)
  return previous.length > current.length ? previous : current
}

export const INITIAL_COIN_BALANCE: VerifiedCoinBalance = {
  previous: null,
  current: null,
  transition: NO_TRANSITION
}
