import { memo } from "react"
import { StyleSheet, Text, View } from "react-native"
import Reanimated from "react-native-reanimated"
import { hapticSelection } from "../../../ui/haptics"
import { PressableScale } from "../../../ui/PressableScale"
import type { SpeechBubble } from "./miniRoomSceneTypes"
import { createSpeechBubbleMotion } from "./roomSpeechBubbleMotion"

export type RoomSpeechBubblePlacement = "center" | "left" | "right"

// Built once: Reanimated layout animations on the UI thread. A new line fades
// in while rising a few points, the lines above glide up to make room, and a
// line leaves with a fade; no scale. Reduce Motion (the shared store, via
// `animate`) keeps only the fades.
const FULL_MOTION = createSpeechBubbleMotion(false)
const REDUCED_MOTION = createSpeechBubbleMotion(true)

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
 * itself because the lines are laid out in one column. A short line hugs its
 * text; the newest line's tail always points at the chibi.
 */
export const RoomSpeechBubbleStack = memo(function RoomSpeechBubbleStack(props: RoomSpeechBubbleStackProps) {
  const { bubbles, placement, raised, animate, onDismissBubble, dismissBubbleLabel } = props
  if (bubbles.length === 0) return null
  const newestId = bubbles[bubbles.length - 1]?.id
  const motion = animate ? FULL_MOTION : REDUCED_MOTION
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
            entering={motion.entering}
            exiting={motion.exiting}
            layout={motion.layout}
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
              style={[styles.bubbleWrap, placement === "center" ? null : styles.bubbleWrapSide]}
            >
              <Text
                style={styles.bubbleText}
                numberOfLines={newest ? 3 : 2}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={1.3}
              >
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

const STACK_WIDTH = 174
/** Where the chibi's centre sits from the stack's near edge in a side placement. */
const SIDE_ANCHOR = 34
const TAIL = 10
const PAPER = "rgba(255, 255, 255, 0.96)"
const EDGE = "rgba(255, 201, 224, 0.9)"

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    left: "50%",
    bottom: 130,
    width: STACK_WIDTH,
    marginLeft: -STACK_WIDTH / 2,
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6
  },
  // Beside the chibi: lines hug the edge nearest to it.
  stackLeft: {
    marginLeft: -(STACK_WIDTH - SIDE_ANCHOR),
    alignItems: "flex-end"
  },
  stackRight: {
    marginLeft: -SIDE_ANCHOR,
    alignItems: "flex-start"
  },
  stackRaised: {
    bottom: 168
  },
  line: {
    maxWidth: "100%"
  },
  bubbleWrap: {
    maxWidth: "100%",
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: EDGE,
    shadowColor: "#5B263B",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  // Wide enough that the tail sits on the straight edge, clear of the corner.
  bubbleWrapSide: {
    minWidth: 2 * SIDE_ANCHOR
  },
  bubbleText: {
    color: "#3A2430",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center"
  },
  bubbleTail: {
    position: "absolute",
    left: "50%",
    bottom: -TAIL / 2,
    width: TAIL,
    height: TAIL,
    marginLeft: -TAIL / 2,
    transform: [{ rotate: "45deg" }],
    backgroundColor: PAPER,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: EDGE
  },
  // Side placements: the tail stays over the chibi whatever the line's width.
  bubbleTailLeft: {
    left: undefined,
    right: SIDE_ANCHOR - TAIL / 2,
    marginLeft: 0
  },
  bubbleTailRight: {
    left: SIDE_ANCHOR - TAIL / 2,
    marginLeft: 0
  }
})
