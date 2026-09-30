import { useEffect, useState } from "react"
import type { TextInputProps } from "react-native"
import {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { useReducedMotion } from "../../../ui/animations"
import type { AppLocale } from "../../session/appLocale"
import {
  COIN_PULSE_HALF_MS,
  COIN_PULSE_PEAK_SCALE,
  formatCoinCount,
  getCoinBalanceLayoutText,
  getCoinGroupSeparator,
  getNextCoinBalance,
  INITIAL_COIN_BALANCE,
  settleCoinBalance,
  UNVERIFIED_BALANCE_TEXT,
  type VerifiedCoinBalance
} from "./coinCountModel"

export interface ShopCoinBalanceMotionInput {
  /** Server-authoritative balance from the inventory store. */
  coins: number
  verified: boolean
  locale: AppLocale
}

export interface ShopCoinBalanceMotion {
  /** Animated `text` for a read-only TextInput; written on the UI thread. */
  textProps: Partial<TextInputProps>
  iconStyle: ReturnType<typeof useAnimatedStyle>
  /** First-paint text before the animated props attach; stable after mount. */
  initialText: string
  /** Invisible text that sizes the pill so counting digits never clip. */
  layoutText: string
}

/**
 * MICRO-1: when the server-confirmed balance changes, the number counts to it
 * and the coin icon pulses once. React renders once per confirmed balance and
 * once when the count settles; every frame runs on the UI thread.
 */
export function useShopCoinBalanceMotion(input: ShopCoinBalanceMotionInput): ShopCoinBalanceMotion {
  const { coins, verified, locale } = input
  const reduceMotion = useReducedMotion()
  const [balance, setBalance] = useState<VerifiedCoinBalance>(() =>
    getNextCoinBalance(INITIAL_COIN_BALANCE, { coins, verified, reduceMotion }) ?? INITIAL_COIN_BALANCE
  )
  const nextBalance = getNextCoinBalance(balance, { coins, verified, reduceMotion })
  if (nextBalance) setBalance(nextBalance)

  const count = useSharedValue(balance.current ?? 0)
  const showsPlaceholder = useSharedValue(!verified)
  const iconScale = useSharedValue(1)
  const separator = getCoinGroupSeparator(locale)

  useEffect(() => {
    showsPlaceholder.value = !verified
  }, [showsPlaceholder, verified])

  useEffect(() => {
    const target = balance.current
    if (target === null) return
    if (!balance.transition.animate) {
      cancelAnimation(count)
      cancelAnimation(iconScale)
      count.value = target
      iconScale.value = 1
      return
    }
    const settle = (): void => setBalance((latest) => settleCoinBalance(latest, target))
    count.value = withTiming(
      target,
      { duration: balance.transition.durationMs, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) scheduleOnRN(settle)
      }
    )
    iconScale.value = withSequence(
      withTiming(COIN_PULSE_PEAK_SCALE, { duration: COIN_PULSE_HALF_MS, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: COIN_PULSE_HALF_MS, easing: Easing.in(Easing.quad) })
    )
  }, [balance, count, iconScale])

  const textProps = useAnimatedProps(() => {
    const text = showsPlaceholder.value
      ? UNVERIFIED_BALANCE_TEXT
      : formatCoinCount(Math.round(count.value), separator)
    // `text` is the native TextInput prop; it is not part of TextInputProps.
    return { text } as Partial<TextInputProps>
  })
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }))

  // Frozen at mount: after that the UI thread owns the text, and a changing
  // defaultValue would make React push a competing `text` mid-count.
  const [initialText] = useState(() => verified && balance.current !== null
    ? formatCoinCount(balance.current, separator)
    : UNVERIFIED_BALANCE_TEXT)
  const layoutText = verified ? getCoinBalanceLayoutText(balance, locale) : UNVERIFIED_BALANCE_TEXT
  return { textProps, iconStyle, initialText, layoutText }
}
