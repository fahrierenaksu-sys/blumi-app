import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming
} from "react-native-reanimated"
import { useReducedMotion } from "../../ui/animations"
import { PressableScale } from "../../ui/PressableScale"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import type { OwnProfileCopy } from "./profileCopy"
import type { ProfileCompleteness } from "./profileViewModel"

const FILL_DURATION_MS = 760

/**
 * The "how ready is my profile" card. Its bar fills on the UI thread when the
 * page opens (at once under Reduce Motion) and its line names the next empty
 * step; a tap opens Edit profile. A complete profile gets a quiet celebration
 * instead.
 */
export function ProfileCompletenessCard(props: {
  copy: OwnProfileCopy
  completeness: ProfileCompleteness
  onPress: () => void
}) {
  const { copy, completeness } = props
  const reduceMotion = useReducedMotion()
  const fill = useSharedValue(reduceMotion ? completeness.percent / 100 : 0)

  useEffect(() => {
    const target = completeness.percent / 100
    fill.value = reduceMotion
      ? target
      : withDelay(260, withTiming(target, { duration: FILL_DURATION_MS, easing: Easing.out(Easing.cubic) }))
  }, [completeness.percent, fill, reduceMotion])

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }))
  const title = completeness.complete
    ? copy.completenessDone
    : copy.completenessTitle(completeness.percent)
  const body = completeness.nextStep
    ? copy.completenessNext[completeness.nextStep]
    : copy.completenessDoneBody

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityValue={{ min: 0, max: completeness.total, now: completeness.done, text: copy.completenessAccessibility(completeness.done, completeness.total) }}
      onPress={props.onPress}
      style={styles.card}
    >
      <LinearGradient
        colors={completeness.complete ? ["#FFF7D8", "#FFE9F4"] : ["#FFFFFF", "#FFF2F8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.headerRow}>
        <View style={[styles.badge, completeness.complete ? styles.badgeComplete : null]}>
          <Ionicons
            accessible={false}
            name={completeness.complete ? "sparkles" : "flower-outline"}
            size={18}
            color={completeness.complete ? uiTheme.colors.goldInk : uiTheme.colors.primaryDeep}
          />
        </View>
        <View style={styles.textStack}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
        <Ionicons accessible={false} name="chevron-forward" size={18} color={uiTheme.colors.textMuted} />
      </View>
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.fill, fillStyle]}>
          <LinearGradient
            colors={uiTheme.gradients.match}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        {Array.from({ length: completeness.total - 1 }, (_, index) => (
          <View
            key={index}
            style={[styles.tick, { left: `${((index + 1) / completeness.total) * 100}%` }]}
          />
        ))}
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: uiTheme.spacing.md,
    padding: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    ...uiTheme.shadow.soft
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primarySoft
  },
  badgeComplete: {
    backgroundColor: uiTheme.colors.goldSoft
  },
  textStack: {
    flex: 1,
    gap: 2
  },
  title: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary
  },
  body: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: uiTheme.colors.surfaceMuted
  },
  fill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 5,
    overflow: "hidden",
    transformOrigin: "left center"
  },
  tick: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: "rgba(255, 255, 255, 0.9)"
  }
})
