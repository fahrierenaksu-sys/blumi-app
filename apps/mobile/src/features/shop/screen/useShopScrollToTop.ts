import { useCallback, useRef, type RefObject } from "react"
import type { ScrollView } from "react-native"
import { useReducedMotion } from "../../../ui/animations"
import { useMainTabReselect } from "../../../ui/layout/useMainTabReselect"

/** Re-tapping the selected Shop tab returns the page to its top (iOS convention). */
export function useShopScrollToTop(): RefObject<ScrollView | null> {
  const reduceMotion = useReducedMotion()
  const scrollRef = useRef<ScrollView>(null)
  const scrollToTop = useCallback((): void => {
    scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion })
  }, [reduceMotion])
  useMainTabReselect("shop", scrollToTop)
  return scrollRef
}
