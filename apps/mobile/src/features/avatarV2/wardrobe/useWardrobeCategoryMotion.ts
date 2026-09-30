import { useEffect, useRef } from "react"
import { Animated } from "react-native"
import type { WardrobeCategoryId } from "../wardrobeCategoryModel"

/** Fades the catalog in when the category changes; skipped under Reduce Motion. */
export function useWardrobeCatalogFade(input: {
  activeCategory: WardrobeCategoryId
  reduceMotion: boolean
}): Animated.Value {
  const { activeCategory, reduceMotion } = input
  const catalogOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    catalogOpacity.stopAnimation()
    if (reduceMotion) {
      catalogOpacity.setValue(1)
      return
    }
    catalogOpacity.setValue(0)
    const animation = Animated.timing(catalogOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true
    })
    animation.start()
    return () => animation.stop()
  }, [activeCategory, catalogOpacity, reduceMotion])

  return catalogOpacity
}
