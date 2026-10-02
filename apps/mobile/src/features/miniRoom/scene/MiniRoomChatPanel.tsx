import type { ReactNode } from "react"
import { StyleSheet } from "react-native"
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated"
import { MOTION_DURATIONS, MOTION_SPRINGS } from "../../../ui/motion"
import { WardrobeGlass } from "../../avatarV2/wardrobe/WardrobeGlass"
import type { MiniRoomCopy } from "../miniRoomCopy"
import type { RoomChatHistoryItem, RoomChatHistoryStatus } from "../roomChatHistoryModel"
import { MiniRoomChatHistory } from "./MiniRoomChatHistory"
import type { MiniRoomPanelMode } from "./miniRoomLayout"

interface MiniRoomChatPanelProps {
  copy: MiniRoomCopy
  mode: MiniRoomPanelMode
  margin: number
  /** Keyboard overlap while typing, otherwise the bottom safe area. */
  bottom: number
  historyHeight: number
  historyItems: readonly RoomChatHistoryItem[]
  historyStatus: RoomChatHistoryStatus
  partnerName: string
  /** The composer row. */
  children: ReactNode
  /** From getMiniRoomPanelTransition; undefined lays out without motion. */
  layoutTransition?: ReturnType<typeof getMiniRoomPanelTransition>
}

const RADIUS: Record<MiniRoomPanelMode, number> = { history: 26, compact: 29, typing: 24 }

/**
 * The light glass chat panel under the room: history above the composer, the
 * composer alone when collapsed, and only the composer on top of the keyboard.
 */
const HISTORY_ENTERING = FadeIn.duration(MOTION_DURATIONS.fadeIn).reduceMotion(ReduceMotion.Never)
const HISTORY_EXITING = FadeOut.duration(MOTION_DURATIONS.fadeOut).reduceMotion(ReduceMotion.Never)

/**
 * The dock's frame (keyboard lift, history open/close, composer growth)
 * animates as a UI-thread layout transition: with the keyboard's own
 * duration when the keyboard moved it, otherwise the smooth settle. None
 * under Reduce Motion.
 */
export function getMiniRoomPanelTransition(reduceMotion: boolean, keyboardDurationMs: number) {
  if (reduceMotion) return undefined
  return LinearTransition
    .duration(keyboardDurationMs > 0 ? keyboardDurationMs : MOTION_SPRINGS.smooth.duration)
    .easing(Easing.out(Easing.cubic))
    .reduceMotion(ReduceMotion.Never)
}

export function MiniRoomChatPanel(props: MiniRoomChatPanelProps) {
  const { copy, mode, margin, bottom, historyHeight, historyItems, historyStatus, partnerName, children, layoutTransition } = props
  const radius = RADIUS[mode]
  // While typing the panel continues under the keyboard by its corner radius,
  // so it reads as attached to the keyboard with square lower corners.
  const tuck = mode === "typing" ? radius : 0
  const padding = mode === "history"
    ? styles.historyPadding
    : mode === "compact" ? styles.compactPadding : styles.typingPadding

  return (
    <Animated.View
      layout={layoutTransition}
      pointerEvents="box-none"
      style={[styles.dock, { left: margin, right: margin, bottom: bottom - tuck }]}
    >
      <WardrobeGlass
        tone="panel"
        radius={radius}
        contentStyle={[padding, tuck > 0 ? { paddingBottom: 9 + tuck } : null]}
      >
        {mode === "history" ? (
          <Animated.View
            entering={layoutTransition ? HISTORY_ENTERING : undefined}
            exiting={layoutTransition ? HISTORY_EXITING : undefined}
          >
            <MiniRoomChatHistory
              copy={copy}
              items={historyItems}
              status={historyStatus}
              partnerName={partnerName}
              height={historyHeight}
            />
          </Animated.View>
        ) : null}
        {children}
      </WardrobeGlass>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    zIndex: 20
  },
  historyPadding: {
    paddingTop: 11,
    paddingBottom: 9,
    paddingHorizontal: 10
  },
  compactPadding: {
    padding: 7
  },
  typingPadding: {
    paddingTop: 7,
    paddingBottom: 9,
    paddingHorizontal: 9
  }
})
