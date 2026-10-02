import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { memo, useCallback, useEffect, useRef } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated"
import { areChatParticipantAvatarsEquivalent } from "../chat/chatParticipantAvatar"
import type { InboxCopy } from "../chat/inboxCopy"
import { hapticMedium } from "../../ui/haptics"
import { LinearGradient } from "../../ui/linearGradient"
import { ParticipantAvatar } from "../../ui/participantAvatar"
import { PressableScale } from "../../ui/PressableScale"
import { uiTheme } from "../../ui/theme"
import type { InboxConversationActionsCopy } from "./inboxConversationActionsCopy"

/** Height of a row with a one-line preview; the skeleton uses it. Rows are measured, not assumed. */
export const INBOX_ROW_ESTIMATED_HEIGHT = 88

export interface ConversationCardProps {
  threadId: string
  copy: InboxCopy
  partnerName: string
  partnerUserId: string
  partnerAvatar?: AvatarSelection
  previewPrefix: string | undefined
  lastBody: string | undefined
  lastTime: string
  unreadBadge: string | null
  accessibilityLabel: string
  /** The screen's shared UI-thread pulse for the unread glow (scale). */
  unreadPulse: SharedValue<number>
  onPress: (threadId: string) => void
  onWarm: (threadId: string) => void
  /** Pinned rows stay above the others and show a pin. */
  isPinned: boolean
  actionsCopy: InboxConversationActionsCopy
  /** Touch and hold (or the VoiceOver action): pin, unpin or delete. */
  onLongPress: (threadId: string) => void
}

/**
 * One inbox conversation. Unread rows show a bold name, a bold preview, a
 * pink time and a count badge; VoiceOver reads one label (name, unread count,
 * preview, time) and a hint.
 */
function UnreadGlow({ pulse }: { pulse: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))
  return <Animated.View style={[cardStyles.unreadGlow, style]} />
}

/**
 * A touch warms its thread only once it has stayed a touch this long. A
 * finger that starts a main-page swipe on a row is released (press out) by
 * the pager's pan well before, so a swipe never starts a thread request; a
 * tap opens the thread, which warms it anyway.
 */
export const INBOX_ROW_WARM_DELAY_MS = 140

export const ConversationCard = memo(function ConversationCard(props: ConversationCardProps) {
  const { threadId, onPress: pressThread, onWarm: warmThread } = props
  const onPress = useCallback(() => pressThread(threadId), [pressThread, threadId])
  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelWarm = useCallback(() => {
    if (warmTimerRef.current === null) return
    clearTimeout(warmTimerRef.current)
    warmTimerRef.current = null
  }, [])
  const onWarm = useCallback(() => {
    cancelWarm()
    warmTimerRef.current = setTimeout(() => {
      warmTimerRef.current = null
      warmThread(threadId)
    }, INBOX_ROW_WARM_DELAY_MS)
  }, [cancelWarm, warmThread, threadId])
  useEffect(() => cancelWarm, [cancelWarm])
  const { onLongPress: openActions } = props
  const onLongPress = useCallback(() => {
    hapticMedium()
    openActions(threadId)
  }, [openActions, threadId])
  const onAccessibilityAction = useCallback((event: { nativeEvent: { actionName: string } }) => {
    if (event.nativeEvent.actionName === "longpress") openActions(threadId)
  }, [openActions, threadId])
  const hasUnread = props.unreadBadge !== null

  return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={props.accessibilityLabel}
        accessibilityHint={props.copy.openChatHint}
        accessibilityActions={[{ name: "longpress", label: props.actionsCopy.actions }]}
        onAccessibilityAction={onAccessibilityAction}
        style={cardStyles.card}
        onPress={onPress}
        onLongPress={onLongPress}
        pressedScale={0.98}
        onPressIn={onWarm}
        onPressOut={cancelWarm}
      >
        <LinearGradient
          colors={uiTheme.gradients.primary}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={cardStyles.leftAccent}
        />

        {/* The chat thread carries no verified presence state. */}
        <View style={cardStyles.avatarWrap}>
          <ParticipantAvatar
            name={props.partnerName}
            seed={props.partnerUserId}
            avatar={props.partnerAvatar}
            size={56}
            ring="soft"
          />
        </View>

        <View style={cardStyles.body}>
          <View style={cardStyles.nameRow}>
            <Text style={[cardStyles.name, hasUnread ? cardStyles.nameUnread : null]} numberOfLines={1}>
              {props.partnerName}
            </Text>
            {props.isPinned ? (
              <Ionicons name="pin" size={14} color={uiTheme.colors.primaryDeep} style={cardStyles.pin} />
            ) : null}
            {props.lastTime ? (
              <Text style={[cardStyles.time, hasUnread ? cardStyles.timeUnread : null]} numberOfLines={1}>
                {props.lastTime}
              </Text>
            ) : null}
          </View>
          {props.lastBody ? (
            <Text style={[cardStyles.preview, hasUnread ? cardStyles.previewUnread : null]} numberOfLines={2}>
              {props.previewPrefix ? <Text style={cardStyles.previewPrefix}>{props.previewPrefix}</Text> : null}
              {props.lastBody}
            </Text>
          ) : (
            <Text style={cardStyles.previewEmpty}>{props.copy.startWithSpark}</Text>
          )}
        </View>

        <View style={cardStyles.trailing}>
          {hasUnread ? (
            <View style={cardStyles.unreadWrap}>
              <UnreadGlow pulse={props.unreadPulse} />
              <LinearGradient
                colors={uiTheme.gradients.primary}
                style={cardStyles.unreadBadge}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={cardStyles.unreadBadgeText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                  {props.unreadBadge}
                </Text>
              </LinearGradient>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={20} color={uiTheme.colors.textMuted} />
          )}
        </View>
      </PressableScale>
  )
}, (previous, next) =>
  previous.threadId === next.threadId &&
  previous.copy === next.copy &&
  previous.partnerName === next.partnerName &&
  previous.partnerUserId === next.partnerUserId &&
  areChatParticipantAvatarsEquivalent(previous.partnerAvatar, next.partnerAvatar) &&
  previous.previewPrefix === next.previewPrefix &&
  previous.lastBody === next.lastBody &&
  previous.lastTime === next.lastTime &&
  previous.unreadBadge === next.unreadBadge &&
  previous.accessibilityLabel === next.accessibilityLabel &&
  previous.unreadPulse === next.unreadPulse &&
  previous.onWarm === next.onWarm &&
  previous.onPress === next.onPress &&
  previous.isPinned === next.isPinned &&
  previous.actionsCopy === next.actionsCopy &&
  previous.onLongPress === next.onLongPress
)

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.md,
    padding: uiTheme.spacing.md,
    paddingLeft: uiTheme.spacing.md + 4,
    borderRadius: uiTheme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    overflow: "hidden",
    position: "relative",
    ...uiTheme.shadow.float
  },
  leftAccent: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 2.5,
    borderRadius: 2
  },
  avatarWrap: {
    position: "relative"
  },
  body: {
    flex: 1,
    gap: 3
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.xs
  },
  name: {
    flex: 1,
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.subheading,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600"
  },
  nameUnread: {
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800"
  },
  pin: {
    marginLeft: -2
  },
  // textSecondary keeps the small time label above 4.5:1 on the white card.
  time: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.caption
  },
  timeUnread: {
    color: uiTheme.colors.primaryDeep,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800"
  },
  preview: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.bodySmall
  },
  previewUnread: {
    color: uiTheme.colors.textPrimary,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600"
  },
  previewPrefix: {
    color: uiTheme.colors.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600"
  },
  previewEmpty: {
    color: uiTheme.colors.textSecondary,
    ...uiTheme.font.bodySmall,
    fontStyle: "italic"
  },
  trailing: {
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  unreadWrap: {
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  unreadGlow: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: uiTheme.colors.accentGlow
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  unreadBadgeText: {
    color: uiTheme.colors.textInverted,
    ...uiTheme.font.captionBold,
    letterSpacing: 0
  }
})
