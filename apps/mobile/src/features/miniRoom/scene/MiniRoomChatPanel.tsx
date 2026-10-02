import Ionicons from "@expo/vector-icons/Ionicons"
import type { ReactNode } from "react"
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native"
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated"
import type { MiniRoomCopy } from "../miniRoomCopy"
import type { RoomChatHistoryItem, RoomChatHistoryStatus } from "../roomChatHistoryModel"
import { MiniRoomChatHistory } from "./MiniRoomChatHistory"
import type { MiniRoomPanelMode } from "./miniRoomLayout"
import { resolveMiniRoomContentOpacity, resolveMiniRoomTextWidths, type MiniRoomTransitionFrame } from "./miniRoomTransitionModel"

interface MiniRoomChatPanelProps {
  copy: MiniRoomCopy
  mode: MiniRoomPanelMode
  transition: SharedValue<MiniRoomTransitionFrame>
  /** What the content opacities follow (crossfades alone under Reduce Motion). */
  contentProgress: SharedValue<number>
  windowWidth: number
  historyHeight: number
  composerHeight: number
  historyItems: readonly RoomChatHistoryItem[]
  historyStatus: RoomChatHistoryStatus
  partnerName: string
  recentMessage?: RoomChatHistoryItem
  onRecentHeightChange: (height: number) => void
  onRecentRowsHeightChange: (height: number) => void
  onCloseKeyboard: () => void
  scrollToLatestRequest: number
  children: ReactNode
}
export function MiniRoomChatPanel(props: MiniRoomChatPanelProps) {
  const { copy, mode, transition, contentProgress, windowWidth, historyHeight, composerHeight, historyItems, historyStatus, partnerName,
    recentMessage, onRecentHeightChange, onRecentRowsHeightChange, onCloseKeyboard, scrollToLatestRequest, children } = props
  const typing = mode === "typing"
  const historyDay = copy.historyDay(historyItems[0]?.sentAt)
  const textWidths = resolveMiniRoomTextWidths(windowWidth)
  // Switch once at the confirmed mode, rather than wrapping the draft at every
  // animated width. Endpoint sizing/padding stays identical to the chosen design.
  const composerWidth = typing ? textWidths.typingComposer : textWidths.historyComposer
  const dockStyle = useAnimatedStyle(() => {
    const pose = transition.value
    return { left: pose.margin, right: pose.margin, bottom: pose.bottom, height: pose.height,
      borderTopLeftRadius: 26 - 4 * pose.progress, borderTopRightRadius: 26 - 4 * pose.progress,
      borderBottomLeftRadius: 26 * (1 - pose.progress), borderBottomRightRadius: 26 * (1 - pose.progress) }
  })
  const historyStyle = useAnimatedStyle(() => ({
    opacity: resolveMiniRoomContentOpacity(contentProgress.value).history
  }))
  const recentStyle = useAnimatedStyle(() => ({
    opacity: resolveMiniRoomContentOpacity(contentProgress.value).recent
  }))
  const composerStyle = useAnimatedStyle(() => ({
    bottom: 9 - transition.value.progress,
    width: composerWidth,
    left: (windowWidth - 2 * transition.value.margin - 2 - composerWidth) / 2
  }))
  const measureRecent = (event: LayoutChangeEvent) => onRecentHeightChange(event.nativeEvent.layout.height)
  return (
    <Animated.View style={[styles.dock, dockStyle]}>
      <View style={styles.clip}>
        <Animated.View style={[styles.recent, { width: textWidths.recent }, recentStyle]} onLayout={measureRecent}
          pointerEvents={typing ? "auto" : "none"} accessibilityElementsHidden={!typing}
          importantForAccessibility={typing ? "auto" : "no-hide-descendants"}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.35} style={styles.recentName}>
            {recentMessage?.mine ? copy.youLabel : partnerName}
          </Text>
          <Text numberOfLines={2} ellipsizeMode="tail" maxFontSizeMultiplier={1.35} style={styles.recentText}>
            {recentMessage?.body ?? copy.historyEmpty}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.closeKeyboard} hitSlop={6}
            onPress={onCloseKeyboard} style={styles.closeKeyboard}>
            <Ionicons name="chevron-down" size={18} color="#70596E" />
          </Pressable>
        </Animated.View>
        <Animated.View style={[styles.historyContent, { width: textWidths.history, bottom: composerHeight + 18 }, historyStyle]}
          pointerEvents={typing ? "none" : "auto"} accessibilityElementsHidden={typing}
          importantForAccessibility={typing ? "no-hide-descendants" : "auto"}>
          <View style={styles.heading}>
            <Text maxFontSizeMultiplier={1.35} style={styles.headingText}>{copy.historyHeading}</Text>
            {historyDay ? <Text maxFontSizeMultiplier={1.35} style={styles.dayText}>{historyDay}</Text> : null}
          </View>
          <MiniRoomChatHistory copy={copy} items={historyItems} status={historyStatus}
            partnerName={partnerName} height={historyHeight}
            onRecentRowsHeightChange={onRecentRowsHeightChange} scrollToLatestRequest={scrollToLatestRequest} />
        </Animated.View>
        <Animated.View style={[styles.composer, composerStyle]}>{children}</Animated.View>
      </View>
    </Animated.View>
  )
}
const styles = StyleSheet.create({
  dock: {
    position: "absolute", zIndex: 20, backgroundColor: "#FFFCFF",
    borderWidth: 1, borderColor: "#FFFFFF",
    shadowColor: "#865078", shadowOpacity: 0.07, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }
  },
  clip: { flex: 1, overflow: "hidden" },
  composer: { position: "absolute" },
  historyContent: { position: "absolute", top: 9, left: 16, overflow: "hidden" },
  heading: { height: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headingText: { color: "#8C7892", fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 14 },
  dayText: { color: "#8C7892", fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 14 },
  recent: { position: "absolute", top: 6, left: 17, minHeight: 39,
    flexDirection: "row", alignItems: "center", gap: 8 },
  recentName: { maxWidth: 74, color: "#9B5477", fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 16 },
  recentText: { flex: 1, color: "#86718C", fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginVertical: 11.5 },
  closeKeyboard: { width: 32, height: 32, alignItems: "center", justifyContent: "center" }
})
