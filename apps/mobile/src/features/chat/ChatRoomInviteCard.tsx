import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import {
  getRoomInviteActions,
  getRoomInvitePresentation,
  type ChatLocale,
  type ChatRoomInviteAction,
  type ChatRoomInviteTimelineItem
} from "./chatRoomInviteModel"

interface ChatRoomInviteCardProps {
  invite: ChatRoomInviteTimelineItem
  currentUserId: string
  locale: ChatLocale
  isBusy?: boolean
  onAction?: (action: ChatRoomInviteAction) => void
}

export function ChatRoomInviteCard(props: ChatRoomInviteCardProps) {
  const { invite, currentUserId, locale, isBusy = false, onAction } = props
  const presentation = getRoomInvitePresentation(invite, currentUserId, locale)
  const actions = getRoomInviteActions(invite, currentUserId)
  const primaryAction = actions[0]
  const secondaryAction = actions[1]

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${presentation.title}. ${presentation.detail}. ${presentation.statusLabel}`}
      style={styles.card}
    >
      <LinearGradient
        colors={["#FFF9FB", "#FFFDFC"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGradient}
      >
        <View style={styles.headerRow}>
          <View style={styles.iconCircle}>
            <Ionicons accessible={false} name="home" size={18} color="#C4537C" />
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.title}>{presentation.title}</Text>
            <Text style={styles.detail}>{presentation.detail}</Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.status}>{presentation.statusLabel}</Text>
        </View>

        {primaryAction && onAction ? (
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={presentation.primaryActionLabel}
              accessibilityState={{ busy: isBusy, disabled: isBusy }}
              disabled={isBusy}
              onPress={() => onAction(primaryAction)}
              style={({ pressed }) => [
                styles.primaryAction,
                pressed ? styles.primaryActionPressed : null,
                isBusy ? styles.actionDisabled : null
              ]}
            >
              <LinearGradient
                colors={uiTheme.gradients.primary as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryActionGradient}
              >
                <Text style={styles.primaryActionText}>
                  {presentation.primaryActionLabel}
                </Text>
              </LinearGradient>
            </Pressable>

            {secondaryAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={presentation.secondaryActionLabel}
                accessibilityState={{ busy: isBusy, disabled: isBusy }}
                disabled={isBusy}
                onPress={() => onAction(secondaryAction)}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  pressed ? styles.secondaryActionPressed : null,
                  isBusy ? styles.actionDisabled : null
                ]}
              >
                <Text style={styles.secondaryActionText}>
                  {presentation.secondaryActionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "center",
    maxWidth: "86%",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EBCDD7"
  },
  cardGradient: {
    gap: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 12
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: uiTheme.spacing.sm
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: "#F8EEF2",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  copyWrap: {
    flex: 1,
    gap: 2
  },
  title: {
    ...uiTheme.font.bodySmall,
    color: "#351B32",
    fontWeight: "800"
  },
  detail: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: uiTheme.spacing.xs
  },
  statusDot: {
    backgroundColor: "#C4537C",
    borderRadius: 4,
    height: 8,
    width: 8
  },
  status: {
    ...uiTheme.font.captionBold,
    color: "#8A6D78"
  },
  actionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.sm
  },
  primaryAction: {
    borderRadius: uiTheme.radius.full,
    minHeight: 44,
    overflow: "hidden"
  },
  primaryActionGradient: {
    alignItems: "center",
    borderRadius: uiTheme.radius.full,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: uiTheme.spacing.md
  },
  primaryActionText: {
    ...uiTheme.font.label,
    color: "#FFFFFF"
  },
  secondaryAction: {
    alignItems: "center",
    borderRadius: uiTheme.radius.full,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: uiTheme.spacing.sm
  },
  secondaryActionText: {
    ...uiTheme.font.label,
    color: "#6D4258"
  },
  primaryActionPressed: {
    opacity: 0.92
  },
  secondaryActionPressed: {
    backgroundColor: uiTheme.colors.secondaryPressed
  },
  actionDisabled: {
    opacity: uiTheme.opacity.disabled
  }
})
