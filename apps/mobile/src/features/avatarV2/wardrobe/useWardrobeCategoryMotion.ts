import { useEffect, useRef } from "react"
import { Animated, type ScrollView } from "react-native"
import type { AvatarStudioSectionId, WardrobeCategoryId } from "../wardrobeCategoryModel"

/** Keeps the active category tab in view; honours Reduce Motion. */
export function useWardrobeCategoryTabScroll(input: {
  activeCategory: WardrobeCategoryId
  activeSection: AvatarStudioSectionId
  reduceMotion: boolean
}) {
  const { activeCategory, activeSection, reduceMotion } = input
  const categoryScrollRef = useRef<ScrollView>(null)
  const categoryOffsetsRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const offset = categoryOffsetsRef.current[activeCategory]
    if (offset === undefined) return
    const frame = requestAnimationFrame(() => {
      categoryScrollRef.current?.scrollTo({ x: Math.max(0, offset - 16), animated: !reduceMotion })
    })
    return () => cancelAnimationFrame(frame)
  }, [activeCategory, activeSection, reduceMotion])

  return { categoryScrollRef, categoryOffsetsRef }
}

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
