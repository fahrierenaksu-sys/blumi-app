import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
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
}

const RADIUS: Record<MiniRoomPanelMode, number> = { history: 26, compact: 29, typing: 24 }

/**
 * The light glass chat panel under the room: history above the composer, the
 * composer alone when collapsed, and only the composer on top of the keyboard.
 */
export function MiniRoomChatPanel(props: MiniRoomChatPanelProps) {
  const { copy, mode, margin, bottom, historyHeight, historyItems, historyStatus, partnerName, children } = props
  const radius = RADIUS[mode]
  // While typing the panel continues under the keyboard by its corner radius,
  // so it reads as attached to the keyboard with square lower corners.
  const tuck = mode === "typing" ? radius : 0
  const padding = mode === "history"
    ? styles.historyPadding
    : mode === "compact" ? styles.compactPadding : styles.typingPadding

  return (
    <View pointerEvents="box-none" style={[styles.dock, { left: margin, right: margin, bottom: bottom - tuck }]}>
      <WardrobeGlass
        tone="panel"
        radius={radius}
        contentStyle={[padding, tuck > 0 ? { paddingBottom: 9 + tuck } : null]}
      >
        {mode === "history" ? (
          <MiniRoomChatHistory
            copy={copy}
            items={historyItems}
            status={historyStatus}
            partnerName={partnerName}
            height={historyHeight}
          />
        ) : null}
        {children}
      </WardrobeGlass>
    </View>
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
