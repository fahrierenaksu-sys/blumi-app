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
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"
import { animateToAfter, MOTION_STAGGER, useMotion } from "../../../ui/motion"
import { createFirstAppearanceStagger } from "./miniRoomFirstAppearance"
import { MINI_ROOM_DESIGN_EASING, MINI_ROOM_DOCK_STEP_MS } from "./miniRoomReducedMotion"
import type { MiniRoomCopy } from "../miniRoomCopy"
import { formatRoomChatTime, type RoomChatHistoryItem, type RoomChatHistoryStatus } from "../roomChatHistoryModel"

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
  const { reduceMotion } = useMotion()
  const animatedHeight = useSharedValue(height)
  // The viewport rides the dock's step (MINI_ROOM_DOCK_STEP_MS), so the
  // transcript and its dock resize together; Reduce Motion lands at once.
  useEffect(() => {
    animatedHeight.value = reduceMotion ? height : withTiming(height, {
      duration: MINI_ROOM_DOCK_STEP_MS, easing: Easing.bezier(...MINI_ROOM_DESIGN_EASING), reduceMotion: ReduceMotion.Never
    })
  }, [animatedHeight, height, reduceMotion])
  const heightStyle = useAnimatedStyle(() => ({ height: animatedHeight.value }))
  const listRef = useRef<FlatList<RoomChatHistoryItem>>(null)
  const measuredHeights = useRef(new Map<string, number>())
  const lastReportedHeight = useRef<number | null>(null)
  const reportRecentHeight = useCallback(() => {
    const recent = items.slice(0, 2)
    const heights = recent.map((item) => measuredHeights.current.get(item.id))
    if (heights.some((rowHeight) => rowHeight === undefined)) return
    const total = heights.reduce<number>((sum, rowHeight) => sum + (rowHeight ?? 0), 0)
      + (recent.length > 1 ? RECENT_ROW_GAP : 0)
    if (total !== lastReportedHeight.current) {
      lastReportedHeight.current = total
      onRecentRowsHeightChange?.(total)
    }
  }, [items, onRecentRowsHeightChange])
  useEffect(() => {
    const currentKeys = new Set(items.map(keyOf))
    for (const key of measuredHeights.current.keys()) {
      if (!currentKeys.has(key)) measuredHeights.current.delete(key)
    }
    reportRecentHeight()
  }, [items, reportRecentHeight])
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
  stagger.arm(items.slice(0, MOTION_STAGGER.maxItems).map(keyOf))
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RoomChatHistoryItem>) => (
      <HistoryRow item={item} copy={copy} partnerName={partnerName} onMeasure={measureRow}
        enterSlot={stagger.slotOf(item.id)} onEntered={stagger.markEntered} />
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
    <Animated.View style={heightStyle} accessibilityLabel={copy.chatHistory}>
      <FlatList
        ref={listRef}
        inverted
        data={items}
        keyExtractor={keyOf}
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
    </Animated.View>
  )
}

const keyOf = (item: RoomChatHistoryItem): string => item.id

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
  useLayoutEffect(() => {
    if (slot === null) return
    onEntered(id)
    progress.value = animateToAfter(motion.staggerDelay(slot), 1, reduceMotion ? motion.crossfade : motion.smooth)
  }, [id, motion, onEntered, progress, reduceMotion, slot])
  // The list is inverted (each cell is flipped), so a negative offset sits below.
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : (progress.value - 1) * ROW_ENTER_RISE }]
  }))
}

const HistoryRow = memo(function HistoryRow(props: {
  item: RoomChatHistoryItem
  copy: MiniRoomCopy
  partnerName: string
  onMeasure: (id: string, height: number) => void
  /** This row's first-appearance stagger slot, or null to appear at rest. */
  enterSlot: number | null
  onEntered: (id: string) => void
}) {
  const { item, copy, partnerName, onMeasure, enterSlot, onEntered } = props
  const entranceStyle = useHistoryRowEntrance(item.id, enterSlot, onEntered)
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
    onMeasure(item.id, event.nativeEvent.layout.height)
  }, [item.id, onMeasure])
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
                style={[styles.meta, item.mine ? styles.metaMine : null, item.delivery === "failed" ? styles.metaFailed : null]}
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

const META_INK = "#947E9A"
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
  metaMine: {
    color: "#98677F"
  },
  metaFailed: {
    color: "#B4486E"
  }
})
