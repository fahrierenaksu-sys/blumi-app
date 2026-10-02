import { memo } from "react"
import { StyleSheet, Text, View } from "react-native"
import Reanimated, { FadeOut, LinearTransition, ReduceMotion, ZoomIn } from "react-native-reanimated"
import { hapticSelection } from "../../../ui/haptics"
import { PressableScale } from "../../../ui/PressableScale"
import type { SpeechBubble } from "./miniRoomSceneTypes"

export type RoomSpeechBubblePlacement = "center" | "left" | "right"

// Reanimated layout animations run on the UI thread: a new line pops in at the
// bottom, the lines above glide up to make room, and each line fades out on
// its own when its lifetime ends. Reduce Motion (from the shared store, via
// `animate`) passes none of them, so lines just appear and disappear.
const ENTERING = ZoomIn.springify().damping(16).stiffness(240).reduceMotion(ReduceMotion.Never)
const EXITING = FadeOut.duration(220).reduceMotion(ReduceMotion.Never)
const LAYOUT = LinearTransition.duration(180).reduceMotion(ReduceMotion.Never)

export interface RoomSpeechBubbleStackProps {
  /** One speaker's lines, oldest first; the newest is drawn at the bottom. */
  bubbles: readonly SpeechBubble[]
  placement: RoomSpeechBubblePlacement
  /** Lifted above the partner's stack when the two chibis stand close. */
  raised: boolean
  animate: boolean
  onDismissBubble: (bubbleId: string) => void
  dismissBubbleLabel: string
}

/**
 * A speaker's speech bubbles, stacked above the chibi (2026-10-02). Each line
 * keeps its own lifetime (miniRoomSpeechStack); the stack never overlaps
 * itself because the lines are laid out in one column.
 */
export const RoomSpeechBubbleStack = memo(function RoomSpeechBubbleStack(props: RoomSpeechBubbleStackProps) {
  const { bubbles, placement, raised, animate, onDismissBubble, dismissBubbleLabel } = props
  if (bubbles.length === 0) return null
  const newestId = bubbles[bubbles.length - 1]?.id
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.stack,
        placement === "left" ? styles.stackLeft : null,
        placement === "right" ? styles.stackRight : null,
        raised ? styles.stackRaised : null
      ]}
    >
      {bubbles.map((bubble) => {
        const newest = bubble.id === newestId
        return (
          <Reanimated.View
            key={bubble.id}
            entering={animate ? ENTERING : undefined}
            exiting={animate ? EXITING : undefined}
            layout={animate ? LAYOUT : undefined}
            style={styles.line}
          >
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={dismissBubbleLabel}
              onPress={() => {
                hapticSelection()
                onDismissBubble(bubble.id)
              }}
              hitSlop={4}
              style={styles.bubbleWrap}
            >
              <Text style={styles.bubbleText} numberOfLines={newest ? 3 : 2} ellipsizeMode="tail">
                {bubble.body}
              </Text>
              {newest ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.bubbleTail,
                    placement === "left" ? styles.bubbleTailLeft : null,
                    placement === "right" ? styles.bubbleTailRight : null
                  ]}
                />
              ) : null}
            </PressableScale>
          </Reanimated.View>
        )
      })}
    </View>
  )
})

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    left: "50%",
    bottom: 130,
    width: 174,
    marginLeft: -87,
    flexDirection: "column",
    justifyContent: "flex-end",
    gap: 6
  },
  stackLeft: {
    marginLeft: -140
  },
  stackRight: {
    marginLeft: -34
  },
  stackRaised: {
    bottom: 168
  },
  line: {
    width: "100%"
  },
  bubbleWrap: {
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255, 201, 224, 0.9)",
    shadowColor: "#5B263B",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  bubbleText: {
    color: "#3A2430",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center"
  },
  bubbleTail: {
    position: "absolute",
    left: "50%",
    bottom: -5,
    width: 10,
    height: 10,
    marginLeft: -5,
    transform: [{ rotate: "45deg" }],
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 201, 224, 0.9)"
  },
  bubbleTailLeft: {
    left: "76%"
  },
  bubbleTailRight: {
    left: "24%"
  }
})
