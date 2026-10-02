import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, Text, View } from "react-native"
import { PressableScale } from "../../ui/PressableScale"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import { getAppLocale } from "../session/appLocale"
import { getProfilePreviewCopy } from "../discovery/profilePreviewCopy"

/**
 * A match's profile, opened from the chat: go back to the conversation, or
 * invite them to your room. The invitation itself is sent by the chat's own
 * invite action, so it behaves exactly like the composer's room button.
 */
export function ProfileMatchedActions(props: {
  displayName: string
  canInvite: boolean
  onBackToChat: () => void
  onInviteToRoom: () => void
}) {
  const copy = getProfilePreviewCopy(getAppLocale())
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={copy.backToChat}
        onPress={props.onBackToChat}
        style={[styles.button, styles.secondary]}
      >
        <Ionicons accessible={false} name="chatbubble-ellipses-outline" size={18} color={uiTheme.colors.textPrimary} />
        <Text style={styles.secondaryText} numberOfLines={2}>{copy.backToChat}</Text>
      </PressableScale>
      {props.canInvite ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={copy.inviteToRoom}
          accessibilityHint={copy.inviteToRoomHint(props.displayName)}
          onPress={props.onInviteToRoom}
          style={[styles.button, styles.primary]}
        >
          <LinearGradient
            colors={uiTheme.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons accessible={false} name="home" size={18} color="#FFFFFF" />
          <Text style={styles.primaryText} numberOfLines={2}>{copy.inviteToRoom}</Text>
        </PressableScale>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    marginTop: uiTheme.spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.sm
  },
  button: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.lg,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.full,
    overflow: "hidden"
  },
  secondary: {
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong,
    ...uiTheme.shadow.soft
  },
  primary: {
    ...uiTheme.shadow.glow
  },
  secondaryText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
    flexShrink: 1
  },
  primaryText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
    flexShrink: 1
  }
})
