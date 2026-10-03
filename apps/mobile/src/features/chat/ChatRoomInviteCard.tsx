import Ionicons from "@expo/vector-icons/Ionicons"
import { useLayoutEffect, useRef } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import { ChatRoomInviteScene, type RoomInviteSceneParticipant } from "./ChatRoomInviteScene"
import { getRoomInviteCardState } from "./chatRoomInviteCardModel"
import type { ChatLocale, ChatRoomInviteAction, ChatRoomInviteTimelineItem } from "./chatRoomInviteModel"
import { getRoomDoorKey, roomDoorSources } from "./roomDoorFlight"
import { measureViewInWindow } from "../../ui/flight/flightSources"

interface ChatRoomInviteCardProps {
  invite: ChatRoomInviteTimelineItem
  currentUserId: string
  locale: ChatLocale
  you: RoomInviteSceneParticipant
  partner: RoomInviteSceneParticipant
  /** A lightweight history presentation; existing actions remain available. */
  compact?: boolean
  isBusy?: boolean
  onAction?: (action: ChatRoomInviteAction) => void
}

export function ChatRoomInviteCard({ invite, currentUserId, locale, you, partner, compact = false, isBusy = false, onAction }: ChatRoomInviteCardProps) {
  const card = getRoomInviteCardState(invite, currentUserId, locale)
  const disabled = isBusy || !card.primaryAction || !onAction
  const primaryIcon = card.primaryAction?.type === "accept" ? "checkmark" : card.doorOpen ? "arrow-forward" : "lock-closed-outline"
  // An open door is where the room opens from (roomDoorFlight).
  const cardRef = useRef<View>(null)
  const doorKey = !compact && card.doorOpen && invite.roomSessionId ? getRoomDoorKey(invite.threadId) : null
  useLayoutEffect(() => {
    if (!doorKey) return
    return roomDoorSources.attach(doorKey, () => measureViewInWindow(cardRef.current))
  }, [doorKey])
  if (compact) {
    const sender = card.isSender ? you : partner
    return (
      <View style={styles.compactCard}>
        <View accessible accessibilityRole="text" accessibilityLiveRegion="polite"
          accessibilityLabel={`${sender.name}. ${card.label}. ${card.senderLabel} ${card.statusLabel}.`}
          style={styles.compactSummary}>
          <Ionicons accessible={false} name="home-outline" size={15} color={uiTheme.colors.textMuted} />
          <View style={styles.compactText}>
            <Text style={styles.compactTitle}>{sender.name} · {card.label}</Text>
            <Text style={styles.status}>{card.senderLabel}</Text>
            <Text style={[styles.status, card.doorOpen && styles.acceptedStatus]}>{card.statusLabel}</Text>
          </View>
        </View>
        {card.showPrimary || (card.secondaryAction && onAction) ? (
          <View style={styles.compactActions}>
            {card.showPrimary ? (
              <Pressable accessibilityRole="button" accessibilityLabel={card.primaryLabel}
                accessibilityState={{ busy: isBusy, disabled }} disabled={disabled}
                onPress={() => { if (card.primaryAction) onAction?.(card.primaryAction) }}
                style={({ pressed }) => [styles.compactAction, pressed && styles.secondaryPressed, disabled && styles.busy]}>
                {isBusy ? <ActivityIndicator size="small" color={uiTheme.colors.primaryDeep} /> : null}
                <Text style={[styles.compactActionText, disabled && styles.disabledText]}>{card.primaryLabel}</Text>
                {!isBusy ? <Ionicons accessible={false} name={primaryIcon} size={14} color={disabled ? uiTheme.colors.textMuted : uiTheme.colors.primaryDeep} /> : null}
              </Pressable>
            ) : null}
            {card.secondaryAction && onAction ? (
              <Pressable accessibilityRole="button" accessibilityLabel={card.secondaryLabel}
                accessibilityState={{ busy: isBusy, disabled: isBusy }} disabled={isBusy}
                onPress={() => { if (card.secondaryAction) onAction(card.secondaryAction) }}
                style={({ pressed }) => [styles.compactAction, pressed && styles.secondaryPressed, isBusy && styles.busy]}>
                <Text style={styles.secondaryText}>{card.secondaryLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    )
  }
  return (
    <View ref={cardRef} collapsable={false} style={styles.card}>
      <ChatRoomInviteScene open={card.doorOpen} label={card.label} note={card.note}
        sender={card.isSender ? you : partner} recipient={card.isSender ? partner : you} />
      <View style={styles.content}>
        <Text style={styles.title}>{card.title}</Text>
        <Text style={styles.detail}>{card.detail}</Text>
        <View accessibilityLiveRegion="polite" style={styles.statusRow}>
          <Ionicons accessible={false} name={card.doorOpen ? "checkmark-circle" : invite.status === "pending" ? "time-outline" : "close-circle-outline"}
            size={14} color={card.doorOpen ? uiTheme.colors.successInk : uiTheme.colors.textMuted} />
          <Text style={[styles.status, card.doorOpen && styles.acceptedStatus]}>{card.statusLabel}</Text>
        </View>
        {card.showPrimary ? (
          <Pressable accessibilityRole="button" accessibilityLabel={card.primaryLabel}
            accessibilityState={{ busy: isBusy, disabled }} disabled={disabled}
            onPress={() => { if (card.primaryAction) onAction?.(card.primaryAction) }}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <LinearGradient colors={disabled ? [uiTheme.colors.secondary, uiTheme.colors.secondary] : uiTheme.gradients.primary}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryFill}>
              {isBusy ? <ActivityIndicator size="small" color={uiTheme.colors.primaryDeep} /> : null}
              <Text style={[styles.primaryText, disabled && styles.disabledText]}>{card.primaryLabel}</Text>
              {!isBusy ? <Ionicons name={primaryIcon} size={16} color={disabled ? uiTheme.colors.textMuted : uiTheme.colors.textInverted} /> : null}
            </LinearGradient>
          </Pressable>
        ) : null}
        {card.secondaryAction && onAction ? (
          <Pressable accessibilityRole="button" accessibilityLabel={card.secondaryLabel}
            accessibilityState={{ busy: isBusy, disabled: isBusy }} disabled={isBusy}
            onPress={() => { if (card.secondaryAction) onAction(card.secondaryAction) }}
            style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed, isBusy && styles.busy]}>
            <Text style={styles.secondaryText}>{card.secondaryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  compactCard: {
    width: "86%", maxWidth: 320, borderRadius: uiTheme.radius.md,
    backgroundColor: uiTheme.colors.surfaceSoft, borderWidth: 1, borderColor: uiTheme.colors.border,
    paddingHorizontal: uiTheme.spacing.sm, paddingVertical: uiTheme.spacing.xs
  },
  compactSummary: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: uiTheme.spacing.xs },
  compactText: { flex: 1, gap: uiTheme.spacing.xxs },
  compactTitle: { ...uiTheme.font.micro, color: uiTheme.colors.textPrimary },
  compactActions: { flexDirection: "row", flexWrap: "wrap", gap: uiTheme.spacing.xs },
  compactAction: {
    minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center",
    flexShrink: 1, gap: uiTheme.spacing.xs, paddingHorizontal: uiTheme.spacing.xs,
    paddingVertical: uiTheme.spacing.xs, borderRadius: uiTheme.radius.sm
  },
  compactActionText: { ...uiTheme.font.micro, color: uiTheme.colors.primaryDeep, flexShrink: 1 },
  card: {
    width: "86%",
    maxWidth: 320,
    borderRadius: uiTheme.radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: uiTheme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong,
    ...uiTheme.shadow.soft
  },
  content: { paddingHorizontal: uiTheme.spacing.md, paddingTop: uiTheme.spacing.md, paddingBottom: uiTheme.spacing.sm },
  title: { ...uiTheme.font.subheading, color: uiTheme.colors.textPrimary },
  detail: { ...uiTheme.font.caption, color: uiTheme.colors.textSecondary, marginTop: uiTheme.spacing.xxs },
  statusRow: { flexDirection: "row", alignItems: "center", gap: uiTheme.spacing.xs, marginVertical: uiTheme.spacing.sm },
  status: { ...uiTheme.font.micro, color: uiTheme.colors.textSecondary, flexShrink: 1 },
  acceptedStatus: { color: uiTheme.colors.successInk },
  primary: { minHeight: 44, borderRadius: uiTheme.radius.md, overflow: "hidden" },
  primaryFill: { minHeight: 44, paddingHorizontal: uiTheme.spacing.sm, paddingVertical: uiTheme.spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: uiTheme.spacing.xs },
  primaryText: { ...uiTheme.font.label, color: uiTheme.colors.textInverted, flexShrink: 1, textAlign: "center" },
  disabledText: { color: uiTheme.colors.textMuted },
  pressed: { opacity: 0.92 },
  secondary: { minHeight: 44, borderRadius: uiTheme.radius.md, paddingHorizontal: uiTheme.spacing.sm, paddingVertical: uiTheme.spacing.sm, alignItems: "center", justifyContent: "center" },
  secondaryPressed: { backgroundColor: uiTheme.colors.secondaryPressed },
  secondaryText: { ...uiTheme.font.micro, color: uiTheme.colors.textSecondary },
  busy: { opacity: uiTheme.opacity.disabled }
})
