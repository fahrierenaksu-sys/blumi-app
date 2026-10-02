import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ParticipantAvatar } from "../../ui/participantAvatar"
import { ModalBottomSheet } from "../../ui/ModalBottomSheet"
import { useSheetPresentation } from "../../ui/sheetPresentation"
import { useNativeSheet } from "../../navigation/nativeSheets/useNativeSheet"
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

export interface InboxConversationActionsSheetContentProps {
  target: InboxConversationActionsTarget
  copy: InboxConversationActionsCopy
  onTogglePin: (threadId: string) => void
  onDelete: (threadId: string) => void
}

/**
 * Long-press options for one conversation in the Chats list: pin or unpin,
 * and delete for me (with a confirmation step in the same sheet). A native
 * form sheet on iOS, the app's swipe-down sheet elsewhere
 * (navigation/nativeSheets): swipe down, tap outside and VoiceOver escape
 * close it.
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
  const presentsNatively = useNativeSheet(
    "inboxConversationActions",
    target ? { target, copy, onTogglePin, onDelete } : null,
    onClose
  )
  if (presentsNatively) return null
  return (
    <ModalBottomSheet
      visible={target !== null}
      onClose={onClose}
      backdrop={{ style: styles.backdrop, onPress: onClose, accessibilityLabel: copy.close }}
      testID="inbox-conversation-actions"
      sheetStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, uiTheme.spacing.md) }]}
    >
      {target ? (
        <InboxConversationActionsSheetContent
          target={target}
          copy={copy}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
        />
      ) : null}
    </ModalBottomSheet>
  )
}

export function InboxConversationActionsSheetContent(props: InboxConversationActionsSheetContentProps) {
  const { target, copy, onTogglePin, onDelete } = props
  const { close } = useSheetPresentation()
  const [confirming, setConfirming] = useState(false)
  const targetThreadId = target.threadId
  useEffect(() => { setConfirming(false) }, [targetThreadId])

  return (
    <View style={styles.content}>
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
          onPress={() => close()}
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
    </View>
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
    paddingTop: uiTheme.spacing.xs,
    ...uiTheme.shadow.card
  },
  content: {
    paddingHorizontal: uiTheme.spacing.lg,
    gap: uiTheme.spacing.md
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
