import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect } from "react"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import { uiTheme } from "../../../ui/theme"
import { shopScreenStyles as styles } from "./shopScreenStyles"

/** Badge scale while hidden; it springs to 1 when the card is selected. */
const BADGE_HIDDEN_SCALE = 0.6

/**
 * SHOP-3: the selected card's rose ring fades in (150 ms) instead of jumping.
 * Drawn over the card's own border and never takes touches.
 */
export function ShopCardSelectionRing({ selected }: { selected: boolean }) {
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(selected ? 1 : 0)
  useEffect(() => {
    const target = selected ? 1 : 0
    opacity.value = reduceMotion
      ? target
      : withTiming(target, { duration: uiTheme.animation.durationFast })
  }, [opacity, reduceMotion, selected])
  const ringStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View pointerEvents="none" style={[styles.productSelectionRing, ringStyle]} />
}

/** SHOP-3: the "viewing" eye badge springs in and fades out with the selection. */
export function ShopCardViewingBadge({ visible }: { visible: boolean }) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(visible ? 1 : 0)
  useEffect(() => {
    const target = visible ? 1 : 0
    progress.value = reduceMotion
      ? target
      : visible
        ? withSpring(target, uiTheme.animation.springSnappy)
        : withTiming(target, { duration: uiTheme.animation.durationFast })
  }, [progress, reduceMotion, visible])
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [{ scale: BADGE_HIDDEN_SCALE + (1 - BADGE_HIDDEN_SCALE) * progress.value }]
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.productDropBadge, styles.productViewingBadge, badgeStyle]}
    >
      <Ionicons name="eye" size={10} color="#FFFFFF" />
    </Animated.View>
  )
}
