import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useState } from "react"
import Animated, {
  useAnimatedStyle,
  useSharedValue
} from "react-native-reanimated"
import { animateTo, useMotion } from "../../../ui/motion"
import { shopScreenStyles as styles } from "./shopScreenStyles"

/** Badge scale while hidden; it springs to 1 when the card is selected. */
const BADGE_HIDDEN_SCALE = 0.6

/** Remember the first committed visit without subscribing hidden cards to motion. */
function useSelectionInitialVisibility(visible: boolean): boolean | null {
  const [initialVisible, setInitialVisible] = useState<boolean | null>(() => visible ? true : null)
  // Own-state render retry mounts the child with its original hidden starting
  // point. It remains mounted afterward so fade-out/reselection can reverse.
  if (initialVisible === null && visible) setInitialVisible(false)
  return initialVisible
}

/**
 * SHOP-3: the selected card's rose ring fades in instead of jumping.
 * Drawn over the card's own border and never takes touches.
 */
export function ShopCardSelectionRing({ selected }: { selected: boolean }) {
  const initialSelected = useSelectionInitialVisibility(selected)
  return initialSelected === null ? null : <AnimatedShopCardSelectionRing selected={selected} initialSelected={initialSelected} />
}

function AnimatedShopCardSelectionRing({ selected, initialSelected }: { selected: boolean; initialSelected: boolean }) {
  const motion = useMotion()
  const opacity = useSharedValue(initialSelected ? 1 : 0)
  useEffect(() => {
    opacity.value = animateTo(selected ? 1 : 0, selected ? motion.fadeIn : motion.fadeOut)
  }, [motion, opacity, selected])
  const ringStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View pointerEvents="none" style={[styles.productSelectionRing, ringStyle]} />
}

/**
 * SHOP-3: the "viewing" eye badge springs in and fades out with the
 * selection. Under Reduce Motion it only crossfades, at full size.
 */
export function ShopCardViewingBadge({ visible }: { visible: boolean }) {
  const initialVisible = useSelectionInitialVisibility(visible)
  return initialVisible === null ? null : <AnimatedShopCardViewingBadge visible={visible} initialVisible={initialVisible} />
}

function AnimatedShopCardViewingBadge({ visible, initialVisible }: { visible: boolean; initialVisible: boolean }) {
  const motion = useMotion()
  const { reduceMotion } = motion
  const progress = useSharedValue(initialVisible ? 1 : 0)
  useEffect(() => {
    progress.value = animateTo(
      visible ? 1 : 0,
      reduceMotion ? motion.crossfade : visible ? motion.snappy : motion.fadeOut
    )
  }, [motion, progress, reduceMotion, visible])
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [{ scale: reduceMotion ? 1 : BADGE_HIDDEN_SCALE + (1 - BADGE_HIDDEN_SCALE) * progress.value }]
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
