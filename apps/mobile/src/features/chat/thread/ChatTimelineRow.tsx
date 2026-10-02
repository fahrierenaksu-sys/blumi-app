import { memo, useState, type ReactNode } from "react"
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native"
import Animated from "react-native-reanimated"
import { ChatRoomInviteCard } from "../ChatRoomInviteCard"
import type { RoomInviteSceneParticipant } from "../ChatRoomInviteScene"
import { ChatDeliveryTicks } from "./ChatDeliveryTicks"
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
import { claimFlight, FlightTargetView } from "../../../ui/flight/FlightLayer"

/**
 * One timeline row: an optional day separator, then either a room invitation
 * card or a text bubble with its delivery state and retry affordance.
 *
 * A row that just appeared at the newest edge (`isEntering`) plays a short
 * UI-thread entrance on mount; history, pagination and Reduce Motion never do.
 * My just-sent message (`isArrival`) instead claims its send flight when one
 * is in the air: the bubble stays hidden until the flying words land on it.
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
  you,
  partner,
  isEntering,
  isArrival,
  sendFlightChannel,
  isInviteBusy,
  onRoomInviteAction,
  onRetry
}: {
  item: ChatTimelineItem
  row: ChatTimelineRowModel
  chatCopy: ChatThreadCopy
  chatLocale: ChatLocale
  currentUserId: string
  partnerName: string
  you: RoomInviteSceneParticipant
  partner: RoomInviteSceneParticipant
  isEntering: boolean
  /** Arrived at the newest edge on this render (also under Reduce Motion). */
  isArrival: boolean
  sendFlightChannel: string
  /** Only an invitation row whose action is running is busy; other rows keep equal props. */
  isInviteBusy: boolean
  onRoomInviteAction:
    | ((action: ChatRoomInviteAction, onError?: (error: unknown) => void) => void)
    | undefined
  onRetry: (messageId: string) => void
}) {
  const { isMe, deliveryState, groupPosition, closesGroup, dateLabel } = row
  // Decided once, at mount: a claimed row is the flight's landing spot.
  const [sendFlightId] = useState(() =>
    isArrival && isMe && item.kind === "message"
      ? claimFlight(sendFlightChannel, item.message.body)
      : null
  )
  const entering = isEntering && sendFlightId === null
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
          you={you}
          partner={partner}
          isBusy={isInviteBusy}
          onAction={onRoomInviteAction}
        />
      ) : (
        <BubbleFrame
          flightId={sendFlightId}
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
              {isMe ? <ChatDeliveryTicks state={deliveryState} /> : null}
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
        </BubbleFrame>
      )}
      </View>
    </Animated.View>
  )
}

/** The bubble's box; the landing spot of a claimed send flight. */
function BubbleFrame({
  flightId,
  style,
  children
}: {
  flightId: string | null
  style: StyleProp<ViewStyle>
  children: ReactNode
}) {
  return flightId === null
    ? <View style={style}>{children}</View>
    : <FlightTargetView flightId={flightId} style={style}>{children}</FlightTargetView>
}

/**
 * Rows re-render only when their item/row models, their own invitation busy
 * state, or a callback changes; `buildChatTimelineRowModels` keeps unchanged
 * models referentially stable so the shallow comparison holds.
 */
const MemoizedChatTimelineRow = memo(ChatTimelineRow)
export { MemoizedChatTimelineRow as ChatTimelineRow }
