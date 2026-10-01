import { Pressable, StyleSheet, Text, View } from "react-native"
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import { uiTheme } from "../../../ui/theme"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { formatScrollToLatestCount } from "./chatScrollToLatestModel"

const PILL_ENTERING = FadeIn.duration(160).reduceMotion(ReduceMotion.Never)
const PILL_EXITING = FadeOut.duration(140).reduceMotion(ReduceMotion.Never)

/**
 * The "↓" button over the timeline: returns to the newest message and shows
 * how many messages arrived while the reader was scrolled up. It fades on the
 * UI thread; Reduce Motion shows and hides it at once.
 */
export function ChatScrollToLatestPill({
  visible,
  count,
  chatCopy,
  onPress
}: {
  visible: boolean
  count: number
  chatCopy: ChatThreadCopy
  onPress: () => void
}) {
  const reduceMotion = useReducedMotion()
  if (!visible) return null
  return (
    <Animated.View
      pointerEvents="box-none"
      style={styles.anchor}
      entering={reduceMotion ? undefined : PILL_ENTERING}
      exiting={reduceMotion ? undefined : PILL_EXITING}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chatCopy.scrollToLatestLabel(count)}
        hitSlop={8}
        onPress={onPress}
        style={styles.pill}
      >
        <Text style={styles.arrow}>↓</Text>
        {count > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{formatScrollToLatestCount(count)}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    right: 16,
    bottom: 12,
    zIndex: 5
  },
  pill: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255, 201, 224, 0.9)",
    shadowColor: "#5B263B",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  arrow: {
    fontSize: 18,
    fontWeight: "800",
    color: uiTheme.colors.textPrimary
  },
  badge: {
    marginLeft: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primary
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800"
  }
})
