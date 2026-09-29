import Ionicons from "@expo/vector-icons/Ionicons"
import { BlurView } from "expo-blur"
import type { RefObject } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import type { MiniRoomConnectionStatus, MiniRoomLocalMediaState } from "../miniRoomMediaState"
import type { MiniRoomCopy } from "../miniRoomCopy"
import { uiTheme } from "../../../ui/theme"

interface MiniRoomHudProps {
  copy: MiniRoomCopy
  partnerFirstName: string
  connectionStatus: MiniRoomConnectionStatus
  voiceAvailable: boolean
  localMedia: MiniRoomLocalMediaState
  leaveDisabled: boolean
  horizontalInset: number
  gap: number
  topInset: number
  blurTarget: RefObject<View | null>
  onLeave: () => void
  onOpenSafety: () => void
  onRetryConnect: () => void
  onToggleMic: () => void
}

export function MiniRoomHud(props: MiniRoomHudProps) {
  const {
    connectionStatus,
    voiceAvailable,
    localMedia,
    copy,
    partnerFirstName,
    leaveDisabled,
    horizontalInset,
    gap,
    topInset,
    blurTarget,
    onLeave,
    onOpenSafety,
    onRetryConnect,
    onToggleMic
  } = props

  const mediaDisabled = connectionStatus !== "connected" || !voiceAvailable
  const voiceLabel = localMedia.micEnabled ? copy.voiceOn : copy.voiceOff

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={[
          styles.topHud,
          {
            paddingHorizontal: horizontalInset,
            paddingTop: topInset + uiTheme.spacing.sm,
            gap
          }
        ]}
        pointerEvents="box-none"
      >
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
          <GlassBackdrop blurTarget={blurTarget} />
          <Ionicons name="arrow-back" size={24} color={uiTheme.colors.textPrimary} />
        </Pressable>

        <View style={styles.headerRail}>
          <GlassBackdrop blurTarget={blurTarget} />
          <View style={styles.titleBlock}>
            <Text style={styles.roomTitle} numberOfLines={1}>
              {copy.roomTitle}
            </Text>
            <Text style={styles.roomSubtitle} numberOfLines={1}>
              {copy.roomSubtitle(partnerFirstName)}
            </Text>
          </View>

          {connectionStatus === "error" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.retryRoomConnection}
              onPress={onRetryConnect}
              style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}
            >
              <Ionicons name="refresh" size={17} color={uiTheme.colors.primaryDeep} />
              <Text style={styles.retryText}>{copy.retry}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={localMedia.micEnabled ? copy.muteMicrophone : copy.turnOnMicrophone}
              accessibilityState={{ disabled: mediaDisabled, selected: localMedia.micEnabled }}
              onPress={onToggleMic}
              disabled={mediaDisabled}
              style={({ pressed }) => [
                styles.statusAction,
                localMedia.micEnabled ? styles.statusActionActive : null,
                mediaDisabled ? styles.statusActionUnavailable : null,
                pressed ? styles.pressed : null
              ]}
            >
              <Ionicons
                name={localMedia.micEnabled ? "mic" : "mic-off"}
                size={17}
                color={localMedia.micEnabled ? "#FFFFFF" : uiTheme.colors.brandPlum}
              />
              <Text
                style={[
                  styles.statusText,
                  localMedia.micEnabled ? styles.statusTextActive : null
                ]}
                numberOfLines={1}
              >
                {voiceLabel}
              </Text>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.openSafetyOptions}
            onPress={onOpenSafety}
            style={({ pressed }) => [styles.safetyButton, pressed ? styles.pressed : null]}
          >
            <Ionicons name="shield-outline" size={20} color={uiTheme.colors.brandPlum} />
            <Text style={styles.safetyText} numberOfLines={1}>{copy.safety}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function GlassBackdrop(props: { blurTarget: RefObject<View | null> }) {
  return (
    <>
      <BlurView
        blurTarget={props.blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={68}
        tint="systemUltraThinMaterialLight"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.glassTint} />
      <View pointerEvents="none" style={styles.glassHighlight} />
    </>
  )
}

const styles = StyleSheet.create({
  topHud: {
    flexDirection: "row",
    alignItems: "center"
  },
  circleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    ...uiTheme.shadow.float
  },
  headerRail: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    borderRadius: 30,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    paddingLeft: 14,
    paddingRight: 6,
    gap: 4,
    ...uiTheme.shadow.float
  },
  glassTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 247, 252, 0.78)"
  },
  glassHighlight: {
    position: "absolute",
    top: 1,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.96)"
  },
  titleBlock: {
    flex: 1,
    minWidth: 88,
    paddingRight: 4
  },
  roomTitle: {
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    fontSize: 16,
    color: uiTheme.colors.textPrimary,
    lineHeight: 19
  },
  roomSubtitle: {
    ...uiTheme.font.caption,
    color: "#826C8A",
    lineHeight: 16
  },
  statusAction: {
    minHeight: 42,
    maxWidth: 92,
    paddingHorizontal: 6,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "rgba(255, 255, 255, 0.30)"
  },
  statusActionActive: {
    backgroundColor: uiTheme.colors.primary
  },
  statusActionUnavailable: {
    opacity: 0.78
  },
  statusText: {
    color: uiTheme.colors.brandPlum,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_700Bold",
    fontWeight: "700"
  },
  statusTextActive: {
    color: "#FFFFFF"
  },
  retryButton: {
    minHeight: 42,
    paddingHorizontal: 8,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.34)"
  },
  retryText: {
    color: uiTheme.colors.primaryDeep,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    fontWeight: "700"
  },
  safetyButton: {
    minWidth: 68,
    minHeight: 42,
    paddingHorizontal: 7,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255, 234, 246, 0.46)"
  },
  safetyText: {
    color: uiTheme.colors.brandPlum,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800"
  },
  disabled: {
    opacity: 0.42
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }]
  }
})
