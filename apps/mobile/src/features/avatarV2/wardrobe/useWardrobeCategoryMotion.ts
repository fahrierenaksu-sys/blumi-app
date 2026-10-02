import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import type { WardrobeCategoryId } from "../wardrobeCategoryModel"
import {
  resolveWardrobeCatalogFrame,
  WARDROBE_CATALOG_FADE_IN_MS,
  WARDROBE_CATALOG_FADE_OUT_MS
} from "./wardrobeCatalogTransitionModel"

/**
 * WRD-1: a category change fades the current products out on the UI thread,
 * swaps the list data only once they are invisible, then fades the new
 * products in, so a new product never paints for a frame before its fade.
 * The list is never remounted. Reduce Motion swaps at once.
 */
export function useWardrobeCatalogTransition<TCard>(input: {
  activeCategory: WardrobeCategoryId
  cards: readonly TCard[]
  reduceMotion: boolean
}) {
  const { activeCategory, cards, reduceMotion } = input
  const [shownCategory, setShownCategory] = useState(activeCategory)
  const [lastShownCards, setLastShownCards] = useState(cards)
  const frame = resolveWardrobeCatalogFrame({
    requestedCategory: activeCategory,
    shownCategory,
    cards,
    lastShownCards,
    reduceMotion
  })
  if (!frame.switching && lastShownCards !== cards) setLastShownCards(cards)
  if (reduceMotion && shownCategory !== activeCategory) setShownCategory(activeCategory)

  const opacity = useSharedValue(1)
  // The category the running fade-out will swap to, or null when none runs.
  const fadingToRef = useRef<WardrobeCategoryId | null>(null)
  useEffect(() => {
    if (reduceMotion) return
    if (activeCategory === shownCategory) {
      // Tapped back to the shown category mid fade-out: stop the fade (its
      // swap never runs) and bring the products back.
      if (fadingToRef.current === null) return
      fadingToRef.current = null
      cancelAnimation(opacity)
      opacity.value = withTiming(1, { duration: WARDROBE_CATALOG_FADE_IN_MS })
      return
    }
    const target = activeCategory
    fadingToRef.current = target
    const commitSwap = (): void => {
      // A swap that finished on the UI thread just as the request changed
      // is stale; the newer request runs its own fade.
      if (fadingToRef.current !== target) return
      setShownCategory(target)
    }
    opacity.value = withTiming(0, { duration: WARDROBE_CATALOG_FADE_OUT_MS }, (finished) => {
      if (finished) scheduleOnRN(commitSwap)
    })
  }, [activeCategory, opacity, reduceMotion, shownCategory])

  // After the swap commits, the new products start invisible and fade in.
  useLayoutEffect(() => {
    fadingToRef.current = null
    if (reduceMotion) {
      cancelAnimation(opacity)
      opacity.value = 1
      return
    }
    opacity.value = withTiming(1, { duration: WARDROBE_CATALOG_FADE_IN_MS })
  }, [opacity, reduceMotion, shownCategory])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return {
    /** The category whose products the list draws (lags during the swap). */
    shownCategory: reduceMotion ? activeCategory : shownCategory,
    cards: frame.cards,
    switching: frame.switching,
    style
  }
}
