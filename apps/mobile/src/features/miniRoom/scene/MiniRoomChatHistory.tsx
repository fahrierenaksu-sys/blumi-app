import { memo, useCallback } from "react"
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo
} from "react-native"
import { wardrobeTheme } from "../../avatarV2/wardrobe/wardrobeV2Styles"
import type { MiniRoomCopy } from "../miniRoomCopy"
import type { RoomChatHistoryItem, RoomChatHistoryStatus } from "../roomChatHistoryModel"

interface MiniRoomChatHistoryProps {
  copy: MiniRoomCopy
  items: readonly RoomChatHistoryItem[]
  status: RoomChatHistoryStatus
  partnerName: string
  height: number
}

/**
 * The room's recent conversation in a fixed-height area that scrolls on its
 * own: more messages never make the panel taller. Newest message sits at the
 * bottom (inverted list), next to the composer.
 */
export function MiniRoomChatHistory(props: MiniRoomChatHistoryProps) {
  const { copy, items, status, partnerName, height } = props
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RoomChatHistoryItem>) => (
      <HistoryRow item={item} copy={copy} partnerName={partnerName} />
    ),
    [copy, partnerName]
  )

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
        inverted
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </View>
  )
}

const keyOf = (item: RoomChatHistoryItem): string => item.id

function Separator() {
  return <View style={styles.separator} />
}

const HistoryRow = memo(function HistoryRow(props: {
  item: RoomChatHistoryItem
  copy: MiniRoomCopy
  partnerName: string
}) {
  const { item, copy, partnerName } = props
  const sender = item.mine ? copy.youLabel : partnerName
  const status = item.delivery === "failed"
    ? copy.messageNotSent
    : item.delivery === "sending" ? copy.messageSending : null
  const label = copy.messageFrom(sender, item.body) + (status ? `, ${status}` : "")
  return (
    <View accessible accessibilityLabel={label} style={[styles.row, item.mine ? styles.rowMine : null]}>
      <View
        style={[
          styles.bubble,
          item.mine ? styles.bubbleMine : null,
          item.delivery === "failed" ? styles.bubbleFailed : null,
          item.delivery === "sending" ? styles.bubbleSending : null
        ]}
      >
        <Text maxFontSizeMultiplier={1.6} style={styles.bubbleText}>{item.body}</Text>
      </View>
      {item.showMeta ? (
        <Text
          maxFontSizeMultiplier={1.4}
          style={[styles.meta, item.mine ? styles.metaMine : null, item.delivery === "failed" ? styles.metaFailed : null]}
        >
          {status ?? sender}
        </Text>
      ) : null}
    </View>
  )
})

const META_INK = "#857385"

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
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 2
  },
  separator: {
    height: 8
  },
  row: {
    maxWidth: "86%",
    alignSelf: "flex-start"
  },
  rowMine: {
    alignSelf: "flex-end"
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    backgroundColor: "#F1EBF3"
  },
  bubbleMine: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 5,
    backgroundColor: "#F4E1EE",
    experimental_backgroundImage: "linear-gradient(135deg, #F8E2ED 0%, #EFDFEF 100%)"
  },
  bubbleSending: {
    opacity: 0.72
  },
  bubbleFailed: {
    borderWidth: 1,
    borderColor: "#E7A9C2"
  },
  bubbleText: {
    color: wardrobeTheme.ink,
    fontFamily: "Inter_400Regular",
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 20
  },
  meta: {
    marginTop: 4,
    marginHorizontal: 3,
    color: META_INK,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    fontSize: 11,
    lineHeight: 14
  },
  metaMine: {
    textAlign: "right"
  },
  metaFailed: {
    color: "#B4486E"
  }
})
