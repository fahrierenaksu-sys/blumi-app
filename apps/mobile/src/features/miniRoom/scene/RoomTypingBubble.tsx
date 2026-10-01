import { StyleSheet, View } from "react-native"
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import { TypingDots } from "../../../ui/typingDots"

const ENTERING = FadeIn.duration(160).reduceMotion(ReduceMotion.Never)
const EXITING = FadeOut.duration(120).reduceMotion(ReduceMotion.Never)

/**
 * A small speech-bubble pill with three dots over the partner's chibi while
 * they type. It sits where a spoken line would and follows the avatar anchor;
 * the avatar art and its transforms are untouched. Decorative: the screen
 * announces "… yazıyor" once (usePartnerTyping).
 */
export function RoomTypingBubble() {
  const reduceMotion = useReducedMotion()
  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      entering={reduceMotion ? undefined : ENTERING}
      exiting={reduceMotion ? undefined : EXITING}
      style={styles.anchor}
    >
      <TypingDots size={6} color="#D06A9A" />
      <View style={styles.tail} />
    </Animated.View>
  )
}

// Matches the speech bubble's white glass and pink rim (AvatarLayer).
const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    left: "50%",
    bottom: 132,
    width: 48,
    height: 26,
    marginLeft: -24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255, 201, 224, 0.9)",
    shadowColor: "#5B263B",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  tail: {
    position: "absolute",
    left: "50%",
    bottom: -4,
    width: 8,
    height: 8,
    marginLeft: -4,
    transform: [{ rotate: "45deg" }],
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 201, 224, 0.9)"
  }
})
