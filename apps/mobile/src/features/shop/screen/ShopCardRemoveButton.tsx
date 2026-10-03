import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect } from "react"
import { Pressable, type GestureResponderEvent } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue
} from "react-native-reanimated"
import { animateTo, useMotion } from "../../../ui/motion"
import { uiTheme } from "../../../ui/theme"
import { shopScreenStyles as styles } from "./shopScreenStyles"

const HIDDEN_SCALE = 0.6

/**
 * The small X at a Shop card's top-right corner. The visible dot is small;
 * the touch target is the full 44 pt corner. It pops in on mount, and
 * appears without motion under Reduce Motion.
 */
export function ShopCardRemoveButton(props: {
  accessibilityLabel: string
  testID?: string
  onPress: (event: GestureResponderEvent) => void
}) {
  const motion = useMotion()
  const { reduceMotion } = motion
  const progress = useSharedValue(reduceMotion ? 1 : 0)
  useEffect(() => {
    progress.value = animateTo(1, motion.snappy)
  }, [motion, progress])
  const dotStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value),
    transform: [{ scale: HIDDEN_SCALE + (1 - HIDDEN_SCALE) * progress.value }]
  }))
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      style={styles.productRemoveHitArea}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.productRemoveDot, pressed ? styles.productRemoveDotPressed : null, dotStyle]}>
          <Ionicons name="close" size={12} color={uiTheme.colors.primary} />
        </Animated.View>
      )}
    </Pressable>
  )
}
