import { useEffect, useLayoutEffect, useState } from "react"
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
  useEffect(() => {
    if (activeCategory === shownCategory || reduceMotion) return
    const target = activeCategory
    opacity.value = withTiming(0, { duration: WARDROBE_CATALOG_FADE_OUT_MS }, (finished) => {
      if (finished) scheduleOnRN(setShownCategory, target)
    })
  }, [activeCategory, opacity, reduceMotion, shownCategory])

  // After the swap commits, the new products start invisible and fade in.
  useLayoutEffect(() => {
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
