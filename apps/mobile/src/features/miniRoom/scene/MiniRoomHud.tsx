import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, StyleSheet, Text, View } from "react-native"
import type { MiniRoomConnectionStatus, MiniRoomLocalMediaState } from "../miniRoomMediaState"
import type { MiniRoomCopy } from "../miniRoomCopy"
import { ConnectionPill } from "../../../ui/connectionPill"
import { uiTheme } from "../../../ui/theme"

interface MiniRoomHudProps {
  copy: MiniRoomCopy
  connectionStatus: MiniRoomConnectionStatus
  localMedia: MiniRoomLocalMediaState
  leaveDisabled: boolean
  onLeave: () => void
  onOpenSafety: () => void
  onRetryConnect: () => void
  onToggleMic: () => void
}

export function MiniRoomHud(props: MiniRoomHudProps) {
  const {
    connectionStatus,
    localMedia,
    copy,
    leaveDisabled,
    onLeave,
    onOpenSafety,
    onRetryConnect,
    onToggleMic
  } = props

  const mediaDisabled = connectionStatus !== "connected"

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={styles.topHud} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.leaveRoom}
          accessibilityState={{ disabled: leaveDisabled }}
          onPress={onLeave}
          disabled={leaveDisabled}
          style={({ pressed }) => [
            styles.circleButton,
            leaveDisabled ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </Pressable>

        <ConnectionPill status={connectionStatus} tone="dark" />

        <View style={styles.topRightDock}>
          {connectionStatus === "error" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.retryRoomConnection}
              onPress={onRetryConnect}
              style={({ pressed }) => [
                styles.retryButton,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.retryText}>{copy.retry}</Text>
            </Pressable>
          ) : null}
          <View style={styles.mediaDock}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                localMedia.micEnabled
                  ? copy.muteMicrophone
                  : copy.turnOnMicrophone
              }
              accessibilityState={{
                disabled: mediaDisabled,
                selected: localMedia.micEnabled
              }}
              onPress={onToggleMic}
              disabled={mediaDisabled}
              style={({ pressed }) => [
                styles.mediaButton,
                localMedia.micEnabled ? styles.mediaButtonActive : null,
                mediaDisabled ? styles.disabled : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Text style={styles.mediaText}>
                {localMedia.micEnabled ? copy.voiceOn : copy.voiceOff}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.openSafetyOptions}
            onPress={onOpenSafety}
            style={({ pressed }) => [
              styles.safetyButton,
              pressed ? styles.pressed : null
            ]}
          >
            <Text style={styles.safetyText}>{copy.safety}</Text>
          </Pressable>
        </View>
      </View>

    </View>
  )
}

const styles = StyleSheet.create({
  topHud: {
    paddingTop: uiTheme.spacing.md,
    paddingHorizontal: uiTheme.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30, 15, 24, 0.55)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  topRightDock: {
    minWidth: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: uiTheme.spacing.xs,
  },
  retryButton: {
    minHeight: 38,
    paddingHorizontal: uiTheme.spacing.md,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.94)",
  },
  retryText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primary,
  },
  mediaDock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: "rgba(30, 15, 24, 0.52)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  mediaButton: {
    minWidth: 48,
    minHeight: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  mediaButtonActive: {
    backgroundColor: uiTheme.colors.primary,
  },
  safetyButton: {
    minHeight: 38,
    paddingHorizontal: uiTheme.spacing.md,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255, 200, 220, 0.5)",
  },
  safetyText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.dangerInk,
  },
  mediaText: {
    ...uiTheme.font.captionBold,
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.75,
  },
})
