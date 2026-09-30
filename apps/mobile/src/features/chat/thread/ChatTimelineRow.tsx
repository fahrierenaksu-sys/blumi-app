import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import { uiTheme } from "../../../ui/theme"
import { ChatRoomInviteCard } from "../ChatRoomInviteCard"
import type {
  ChatLocale,
  ChatRoomInviteAction,
  ChatTimelineItem
} from "../chatRoomInviteModel"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { formatMessageTime, type ChatTimelineRowModel } from "./chatThreadModel"
import { bubbleGroupStyles, bubbleStyles } from "./chatThreadStyles"

/**
 * One timeline row: an optional day separator, then either a room invitation
 * card or a text bubble with its delivery state and retry affordance.
 */
export function ChatTimelineRow({
  item,
  row,
  chatCopy,
  chatLocale,
  currentUserId,
  activeRoomInviteAction,
  onRoomInviteAction,
  onRetry
}: {
  item: ChatTimelineItem
  row: ChatTimelineRowModel
  chatCopy: ChatThreadCopy
  chatLocale: ChatLocale
  currentUserId: string
  activeRoomInviteAction: string | null
  onRoomInviteAction:
    | ((action: ChatRoomInviteAction, onError?: (error: unknown) => void) => void)
    | undefined
  onRetry: (messageId: string) => void
}) {
  const { isMe, deliveryState, groupPosition, closesGroup, dateLabel } = row

  return (
    <View>
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
          <View style={bubbleStyles.contentRow}>
            <Text
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
                {formatMessageTime(item.message.sentAt)}
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
    </View>
  )
}
