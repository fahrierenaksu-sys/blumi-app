import Ionicons from "@expo/vector-icons/Ionicons"
import { memo } from "react"
import { Pressable, Text, View } from "react-native"
import Animated from "react-native-reanimated"
import { uiTheme } from "../../../ui/theme"
import { ChatRoomInviteCard } from "../ChatRoomInviteCard"
import type {
  ChatLocale,
  ChatRoomInviteAction,
  ChatTimelineItem
} from "../chatRoomInviteModel"
import { getChatBubbleAccessibilityLabel } from "./chatBubbleAccessibility"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { formatMessageTime, type ChatTimelineRowModel } from "./chatThreadModel"
import { bubbleGroupStyles, bubbleStyles } from "./chatThreadStyles"
import { CHAT_INCOMING_ROW_ENTERING, CHAT_OWN_ROW_ENTERING } from "./useChatTimelineEntrances"

/**
 * One timeline row: an optional day separator, then either a room invitation
 * card or a text bubble with its delivery state and retry affordance.
 *
 * A row that just appeared at the newest edge (`isEntering`) plays a short
 * UI-thread entrance on mount; history, pagination and Reduce Motion never do.
 * The bubble's words, time and delivery state are one accessibility element;
 * the retry button stays separately focusable.
 */
function ChatTimelineRow({
  item,
  row,
  chatCopy,
  chatLocale,
  currentUserId,
  partnerName,
  isEntering,
  activeRoomInviteAction,
  onRoomInviteAction,
  onRetry
}: {
  item: ChatTimelineItem
  row: ChatTimelineRowModel
  chatCopy: ChatThreadCopy
  chatLocale: ChatLocale
  currentUserId: string
  partnerName: string
  isEntering: boolean
  activeRoomInviteAction: string | null
  onRoomInviteAction:
    | ((action: ChatRoomInviteAction, onError?: (error: unknown) => void) => void)
    | undefined
  onRetry: (messageId: string) => void
}) {
  const { isMe, deliveryState, groupPosition, closesGroup, dateLabel } = row
  const entering = isEntering
    ? isMe ? CHAT_OWN_ROW_ENTERING : CHAT_INCOMING_ROW_ENTERING
    : undefined
  const messageTime = item.kind === "message" ? formatMessageTime(item.message.sentAt) : ""
  const bubbleAccessibilityLabel = item.kind === "message"
    ? getChatBubbleAccessibilityLabel({
        body: item.message.body,
        time: messageTime,
        isMe,
        deliveryState,
        partnerName,
        copy: chatCopy
      })
    : undefined

  return (
    <Animated.View entering={entering}>
      {dateLabel ? (
        <View style={bubbleStyles.dateSep}>
          <View style={bubbleStyles.dateSepPill}>
            <Text style={bubbleStyles.dateSepText}>{dateLabel}</Text>
          </View>
        </View>
      ) : null}
      <View
        style={[
          bubbleStyles.row,
          isMe ? bubbleStyles.rowMe : bubbleStyles.rowThem,
          closesGroup ? bubbleStyles.rowGroupEnd : bubbleStyles.rowGroupInner
        ]}
      >
      {item.kind === "room_invite" ? (
        <ChatRoomInviteCard
          invite={item}
          currentUserId={currentUserId}
          locale={chatLocale}
          isBusy={
            activeRoomInviteAction !== null &&
            activeRoomInviteAction.includes(item.inviteId)
          }
          onAction={onRoomInviteAction}
        />
      ) : (
        <View
          style={[
            bubbleStyles.bubble,
            isMe ? bubbleStyles.bubbleMe : bubbleStyles.bubbleThem,
            isMe
              ? bubbleGroupStyles.me[groupPosition]
              : bubbleGroupStyles.them[groupPosition]
          ]}
        >
          {closesGroup ? (
            <View
              pointerEvents="none"
              style={[
                bubbleStyles.tail,
                isMe ? bubbleStyles.tailMe : bubbleStyles.tailThem
              ]}
            />
          ) : null}
          <View
            accessible
            accessibilityLabel={bubbleAccessibilityLabel}
            style={bubbleStyles.contentRow}
          >
            {/* Only the user's own words are selectable (native copy menu),
                never the time, delivery state, or retry label. */}
            <Text
              selectable
              style={[
                bubbleStyles.body,
                isMe ? bubbleStyles.bodyMe : null
              ]}
            >
              {item.message.body}
            </Text>
            <View style={bubbleStyles.metadataRow}>
              <Text
                style={[
                  bubbleStyles.time,
                  isMe ? bubbleStyles.timeMe : null
                ]}
              >
                {messageTime}
              </Text>
              {isMe && deliveryState === "sending" ? (
                <Ionicons
                  accessibilityLabel={chatCopy.sending}
                  name="time-outline"
                  size={14}
                  color={uiTheme.colors.textMuted}
                />
              ) : null}
              {isMe && deliveryState === "sent" ? (
                <Ionicons name="checkmark" size={14} color="#C4537C" />
              ) : null}
            </View>
          </View>
          {isMe && deliveryState === "failed" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={chatCopy.tryAgain}
              onPress={() => onRetry(item.message.messageId)}
            >
              <Text style={[bubbleStyles.time, bubbleStyles.timeMe, { marginTop: 3, textDecorationLine: "underline" }]}>
                {chatCopy.notSent} · {chatCopy.tryAgain}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      </View>
    </Animated.View>
  )
}

/**
 * Rows re-render only when their item/row models, the active invitation
 * action, or a callback changes; `buildChatTimelineRowModels` keeps unchanged
 * models referentially stable so the shallow comparison holds.
 */
const MemoizedChatTimelineRow = memo(ChatTimelineRow)
export { MemoizedChatTimelineRow as ChatTimelineRow }
