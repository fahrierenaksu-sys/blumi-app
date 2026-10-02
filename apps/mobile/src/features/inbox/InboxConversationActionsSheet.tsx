import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { useEffect, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ParticipantAvatar } from "../../ui/participantAvatar"
import { SwipeDismissSheet } from "../../ui/SwipeDismissSheet"
import { uiTheme } from "../../ui/theme"
import type { InboxConversationActionsCopy } from "./inboxConversationActionsCopy"
import { PressableScale } from "../../ui/PressableScale"

const TEXT_SCALE_CAP = 1.6

export interface InboxConversationActionsTarget {
  threadId: string
  partnerName: string
  partnerUserId: string
  partnerAvatar?: AvatarSelection
  isPinned: boolean
}

/**
 * Long-press options for one conversation in the Chats list: pin or unpin,
 * and delete for me (with a confirmation step in the same sheet). The app's
 * one bottom-sheet surface: swipe down, backdrop tap and VoiceOver escape
 * close it; Reduce Motion is handled by the sheet itself.
 */
export function InboxConversationActionsSheet(props: {
  target: InboxConversationActionsTarget | null
  copy: InboxConversationActionsCopy
  onTogglePin: (threadId: string) => void
  onDelete: (threadId: string) => void
  onClose: () => void
}) {
  const { target, copy, onTogglePin, onDelete, onClose } = props
  const insets = useSafeAreaInsets()
  const [confirming, setConfirming] = useState(false)
  const targetThreadId = target?.threadId
  useEffect(() => { setConfirming(false) }, [targetThreadId])

  return (
    <Modal visible={target !== null} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.overlay}>
        {target ? (
          <SwipeDismissSheet
            onDismiss={onClose}
            backdrop={{ style: styles.backdrop, onPress: onClose, accessibilityLabel: copy.close }}
            accessibilityViewIsModal
            grabber
            testID="inbox-conversation-actions"
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, uiTheme.spacing.md) }]}
          >
            <View style={styles.header}>
              <ParticipantAvatar
                name={target.partnerName}
                seed={target.partnerUserId || target.partnerName}
                avatar={target.partnerAvatar}
                size={44}
                ring="soft"
              />
              <Text accessibilityRole="header" maxFontSizeMultiplier={TEXT_SCALE_CAP} numberOfLines={1} style={styles.title}>
                {confirming ? copy.confirmTitle : copy.sheetTitle(target.partnerName)}
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={copy.close}
                onPress={onClose}
                hitSlop={6}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={20} color={uiTheme.colors.textMuted} />
              </PressableScale>
            </View>

            {confirming ? (
              <>
                <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={styles.body}>
                  {copy.confirmBody(target.partnerName)}
                </Text>
                <View style={styles.confirmRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.cancel}
                    onPress={() => setConfirming(false)}
                    style={({ pressed }) => [styles.confirmButton, styles.secondaryButton, pressed ? styles.pressed : null]}
                  >
                    <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={styles.secondaryText}>{copy.cancel}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.confirmDelete}
                    accessibilityHint={copy.deleteHint}
                    onPress={() => onDelete(target.threadId)}
                    style={({ pressed }) => [styles.confirmButton, styles.destructiveButton, pressed ? styles.pressed : null]}
                  >
                    <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={styles.destructiveText}>{copy.confirmDelete}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.actions}>
                <ActionRow
                  icon={target.isPinned ? "pin" : "pin-outline"}
                  label={target.isPinned ? copy.unpin : copy.pin}
                  hint={target.isPinned ? copy.unpinHint : copy.pinHint}
                  onPress={() => onTogglePin(target.threadId)}
                />
                <ActionRow
                  icon="trash-outline"
                  label={copy.delete}
                  hint={copy.deleteHint}
                  destructive
                  onPress={() => setConfirming(true)}
                />
              </View>
            )}
          </SwipeDismissSheet>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  )
}

function ActionRow(props: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  hint: string
  destructive?: boolean
  onPress: () => void
}) {
  const color = props.destructive ? uiTheme.colors.dangerInk : uiTheme.colors.textPrimary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.hint}
      onPress={props.onPress}
      style={({ pressed }) => [styles.actionRow, pressed ? styles.actionRowPressed : null]}
    >
      <View style={[styles.actionIcon, props.destructive ? styles.actionIconDestructive : null]}>
        <Ionicons name={props.icon} size={20} color={props.destructive ? uiTheme.colors.danger : uiTheme.colors.primaryDeep} />
      </View>
      <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={[styles.actionLabel, { color }]}>{props.label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  // Drawn by the sheet so it fades with a swipe-down instead of trailing it.
  backdrop: {
    backgroundColor: "rgba(35, 18, 42, 0.24)"
  },
  sheet: {
    borderTopLeftRadius: uiTheme.radius.xxl,
    borderTopRightRadius: uiTheme.radius.xxl,
    backgroundColor: "rgba(255, 250, 253, 0.97)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.80)",
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.xs,
    gap: uiTheme.spacing.md,
    ...uiTheme.shadow.card
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm
  },
  title: {
    flex: 1,
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    fontWeight: "800"
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  actions: {
    gap: uiTheme.spacing.xs
  },
  actionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.md,
    paddingHorizontal: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.lg,
    borderCurve: "continuous"
  },
  actionRowPressed: {
    backgroundColor: uiTheme.colors.primarySoft
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primarySoft
  },
  actionIconDestructive: {
    backgroundColor: uiTheme.colors.dangerSoft
  },
  actionLabel: {
    flex: 1,
    ...uiTheme.font.body,
    fontWeight: "700"
  },
  body: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary
  },
  confirmRow: {
    flexDirection: "row",
    gap: uiTheme.spacing.sm
  },
  confirmButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.md
  },
  secondaryButton: {
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border
  },
  destructiveButton: {
    backgroundColor: uiTheme.colors.danger
  },
  pressed: {
    opacity: 0.85
  },
  secondaryText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textPrimary,
    fontWeight: "800"
  },
  destructiveText: {
    ...uiTheme.font.bodySmall,
    color: "#FFFFFF",
    fontWeight: "800"
  }
})
