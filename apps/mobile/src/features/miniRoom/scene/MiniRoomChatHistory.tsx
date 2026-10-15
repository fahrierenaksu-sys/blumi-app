import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type LayoutChangeEvent
} from "react-native"
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { animateToAfter, MOTION_STAGGER, useMotion } from "../../../ui/motion"
import { useCommittedReveal } from "../../../ui/committedReveal"
import { createFirstAppearanceStagger, type FirstAppearanceStagger } from "./miniRoomFirstAppearance"
import type { MiniRoomCopy } from "../miniRoomCopy"
import { formatRoomChatTime, roomChatHistoryKeyOf, type RoomChatHistoryItem, type RoomChatHistoryStatus } from "../roomChatHistoryModel"

interface MiniRoomChatHistoryProps {
  copy: MiniRoomCopy
  items: readonly RoomChatHistoryItem[]
  status: RoomChatHistoryStatus
  partnerName: string
  height: number
  onRecentRowsHeightChange?: (height: number) => void
  scrollToLatestRequest?: number
}

/**
 * Newest message sits at the bottom (inverted list), next to the composer.
 * The parent bounds the viewport using native measurements of the newest rows.
 */
export function MiniRoomChatHistory(props: MiniRoomChatHistoryProps) {
  const { copy, items, status, partnerName, height, onRecentRowsHeightChange, scrollToLatestRequest } = props
  // The viewport is laid out at its final height at once (never animated: that
  // would re-lay out the list every frame). The paper settles around it with
  // transforms, and the panel keeps the transcript's bottom on the composer.
  const listRef = useRef<FlatList<RoomChatHistoryItem>>(null)
  const measuredHeights = useRef(new Map<string, number>())
  const lastReportedHeight = useRef<number | null>(null)
  const committedPresentation = useRef({ items, onRecentRowsHeightChange })
  const reportRecentHeight = useCallback(() => {
    const recent = committedPresentation.current.items.slice(0, 2)
    const heights = recent.map((item) => measuredHeights.current.get(roomChatHistoryKeyOf(item)))
    if (heights.some((rowHeight) => rowHeight === undefined)) return
    const total = heights.reduce<number>((sum, rowHeight) => sum + (rowHeight ?? 0), 0)
      + (recent.length > 1 ? RECENT_ROW_GAP : 0)
    if (total !== lastReportedHeight.current) {
      lastReportedHeight.current = total
      committedPresentation.current.onRecentRowsHeightChange?.(total)
    }
  }, [])
  useLayoutEffect(() => {
    committedPresentation.current = { items, onRecentRowsHeightChange }
    const currentKeys = new Set(items.map(roomChatHistoryKeyOf))
    for (const key of measuredHeights.current.keys()) {
      if (!currentKeys.has(key)) measuredHeights.current.delete(key)
    }
    reportRecentHeight()
  }, [items, onRecentRowsHeightChange, reportRecentHeight])
  const measureRow = useCallback((id: string, rowHeight: number) => {
    if (!Number.isFinite(rowHeight) || rowHeight <= 0) return
    const measured = Math.ceil(rowHeight)
    if (measuredHeights.current.get(id) === measured) return
    measuredHeights.current.set(id, measured)
    reportRecentHeight()
  }, [reportRecentHeight])
  // The transcript's first appearance staggers its newest rows in (MOTION
  // `stagger`); later messages and remounted rows appear at rest.
  const [stagger] = useState(() => createFirstAppearanceStagger())
  stagger.arm(items.slice(0, MOTION_STAGGER.maxItems).map(roomChatHistoryKeyOf))
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RoomChatHistoryItem>) => (
      <HistoryRow item={item} copy={copy} partnerName={partnerName} onMeasure={measureRow}
        stagger={stagger} />
    ),
    [copy, partnerName, measureRow, stagger]
  )
  useEffect(() => {
    if (scrollToLatestRequest === undefined) return
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [scrollToLatestRequest])

  if (items.length === 0) {
    const text = status === "loading"
      ? copy.historyLoading
      : status === "failed"
        ? copy.historyFailed
        : status === "unavailable" ? copy.historyUnavailable : copy.historyEmpty
    return (
      <View style={[styles.empty, { height }]} accessibilityLabel={copy.chatHistory}>
        {status === "loading" ? <ActivityIndicator size="small" color={META_INK} /> : null}
        <Text
          accessibilityRole={status === "failed" ? "alert" : "text"}
          maxFontSizeMultiplier={1.5}
          style={styles.emptyText}
        >
          {text}
        </Text>
      </View>
    )
  }

  return (
    <View style={{ height }} accessibilityLabel={copy.chatHistory}>
      <FlatList
        ref={listRef}
        inverted
        data={items}
        keyExtractor={roomChatHistoryKeyOf}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 24 }}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </View>
  )
}

function Separator() {
  return <View style={styles.separator} />
}

/**
 * A first-appearance row rises into place on the `smooth` spring after its
 * stagger delay while it fades in; under Reduce Motion it only fades, with no
 * delay. Decided once at mount, so a re-render never replays it.
 */
function useHistoryRowEntrance(id: string, enterSlot: number | null, onEntered: (id: string) => void) {
  const motion = useMotion()
  const { reduceMotion } = motion
  const [slot] = useState(enterSlot)
  const progress = useSharedValue(slot === null ? 1 : 0)
  // A row that mounts hidden also commits its end state once it has entered (useCommittedReveal).
  const { style: committedStyle, onRevealEnd } = useCommittedReveal()
  useLayoutEffect(() => {
    if (slot === null) return
    onEntered(id)
    progress.value = animateToAfter(motion.staggerDelay(slot), 1, reduceMotion ? motion.crossfade : motion.smooth, onRevealEnd)
  }, [id, motion, onEntered, onRevealEnd, progress, reduceMotion, slot])
  // The list is inverted (each cell is flipped), so a negative offset sits below.
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : (progress.value - 1) * ROW_ENTER_RISE }]
  }))
  return [animatedStyle, committedStyle]
}

const HistoryRow = memo(function HistoryRow(props: {
  item: RoomChatHistoryItem
  copy: MiniRoomCopy
  partnerName: string
  onMeasure: (id: string, height: number) => void
  stagger: FirstAppearanceStagger
}) {
  const { item, copy, partnerName, onMeasure, stagger } = props
  const renderKey = roomChatHistoryKeyOf(item)
  const entranceStyle = useHistoryRowEntrance(renderKey, stagger.slotOf(renderKey), stagger.markEntered)
  const sender = item.mine ? copy.youLabel : partnerName
  const status = item.delivery === "failed"
    ? copy.messageNotSent
    : item.delivery === "sending" ? copy.messageSending : null
  const time = formatRoomChatTime(item.sentAt)
  // A sent acknowledgement is the only confirmed state this room model carries.
  const metadata = [time, status].filter(Boolean).join("  ")
  const showSentCheck = item.mine && item.delivery === "sent"
  const hasMetadata = Boolean(metadata) || showSentCheck
  const label = copy.messageFrom(sender, item.body) + (time ? `, ${time}` : "") + (status ? `, ${status}` : "")
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    onMeasure(renderKey, event.nativeEvent.layout.height)
  }, [renderKey, onMeasure])
  return (
    <Animated.View accessible accessibilityLabel={label} onLayout={onLayout}
      style={[styles.row, item.mine ? styles.rowMine : null, entranceStyle]}>
      <View
        style={[
          styles.bubble,
          item.mine ? styles.bubbleMine : null,
          item.delivery === "failed" ? styles.bubbleFailed : null,
          item.delivery === "sending" ? styles.bubbleSending : null
        ]}
      >
        <Text maxFontSizeMultiplier={1.6} style={[styles.bubbleText, item.mine ? styles.bubbleTextMine : null]}>
          {item.body}
          {hasMetadata ? (
            <Text accessible={false} maxFontSizeMultiplier={1.4} style={[styles.meta, styles.metadataSpacer]}>
              {`  ${metadata}`}
              {showSentCheck ? <><Text>{"  "}</Text><Ionicons accessible={false} name="checkmark" size={12} color="transparent" /></> : null}
            </Text>
          ) : null}
        </Text>
        {hasMetadata ? (
          <View
            accessible={false}
            style={styles.metadataPosition}
          >
            {metadata ? (
              <Text
                accessible={false}
                maxFontSizeMultiplier={1.4}
                style={[styles.meta, item.delivery === "failed" ? styles.metaFailed : null]}
              >
                {metadata}
              </Text>
            ) : null}
            {showSentCheck ? <Ionicons accessible={false} name="checkmark" size={12} color="#98677F" /> : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
})

/** Timestamp ink: the app's textSecondary (4.9:1 or better on both bubbles; the hook harness loads this file without the theme module). */
const META_INK = "#675B73"
/** Failed-send ink: the app's dangerInk (6.7:1 or better on both bubbles). */
const META_FAILED_INK = "#8D2634"
const RECENT_ROW_GAP = 10
/** How far a first-appearance row rises into place (points). */
const ROW_ENTER_RISE = 8

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16
  },
  emptyText: {
    color: "#8A7286",
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center"
  },
  listContent: {
    paddingVertical: 2,
    paddingHorizontal: 0
  },
  separator: {
    height: RECENT_ROW_GAP
  },
  row: {
    maxWidth: "85%",
    alignSelf: "flex-start"
  },
  rowMine: {
    alignSelf: "flex-end"
  },
  bubble: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: "#EFE9F4"
  },
  bubbleMine: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
    backgroundColor: "#F7DCE9"
  },
  bubbleSending: {
    opacity: 0.72
  },
  bubbleFailed: {
    borderWidth: 1,
    borderColor: "#E7A9C2"
  },
  bubbleText: {
    color: "#49364A",
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
    fontSize: 13,
    lineHeight: 19
  },
  bubbleTextMine: {
    color: "#642B4C"
  },
  meta: {
    color: META_INK,
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
    fontSize: 9,
    lineHeight: 12
  },
  metadataSpacer: {
    color: "transparent"
  },
  metadataPosition: {
    position: "absolute",
    bottom: 11,
    right: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  metaFailed: {
    color: META_FAILED_INK
  }
})
