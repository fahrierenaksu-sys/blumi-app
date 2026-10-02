import Ionicons from "@expo/vector-icons/Ionicons"
import { SymbolView } from "expo-symbols"
import { useCallback, useState, type ComponentProps } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { WardrobeGlass } from "../../avatarV2/wardrobe/WardrobeGlass"
import { wardrobeTheme } from "../../avatarV2/wardrobe/wardrobeV2Styles"
import type { MiniRoomConnectionStatus, MiniRoomLocalMediaState } from "../miniRoomMediaState"
import type { MiniRoomCopy } from "../miniRoomCopy"
import { resolveMiniRoomStatusNotice } from "./miniRoomStatusNotice"

type IconName = ComponentProps<typeof Ionicons>["name"]

interface MiniRoomHudProps {
  copy: MiniRoomCopy
  partnerFirstName: string
  connectionStatus: MiniRoomConnectionStatus
  voiceAvailable: boolean
  localMedia: MiniRoomLocalMediaState
  leaveDisabled: boolean
  horizontalInset: number
  headerTop: number
  headerBottom: number
  /** Screen-level alerts (refresh, legacy decor, presence, failed send). */
  notices: readonly string[]
  onLeave: () => void
  onOpenSafety: () => void
  onRetryConnect: () => void
  onToggleMic: () => void
  suggestionsEnabled: boolean
  onToggleSuggestions: () => void
  /** The scene's close: starts the dock's return before UIKit dismisses the keyboard. */
  onCloseKeyboard: () => void
}

/** Small glass header: leave on the left, microphone and room menu on the right. */
export function MiniRoomHud(props: MiniRoomHudProps) {
  const {
    copy,
    partnerFirstName,
    connectionStatus,
    voiceAvailable,
    localMedia,
    leaveDisabled,
    horizontalInset,
    headerTop,
    headerBottom,
    notices,
    onLeave,
    onOpenSafety,
    onRetryConnect,
    onToggleMic,
    suggestionsEnabled,
    onToggleSuggestions,
    onCloseKeyboard
  } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const statusNotice = resolveMiniRoomStatusNotice(connectionStatus)
  const statusText = statusNotice === "connecting"
    ? copy.connecting
    : statusNotice === "reconnecting"
      ? copy.reconnecting
      : statusNotice === "failed" ? copy.connectionFailed : null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={[styles.header, { top: headerTop, left: horizontalInset, right: horizontalInset }]}
        pointerEvents="box-none"
      >
        <View style={styles.side} pointerEvents="box-none">
          <GlassIconButton
            size={44}
            icon="arrow-back"
            accessibilityLabel={copy.leaveRoom}
            disabled={leaveDisabled}
            onPress={onLeave}
          />
        </View>
        <Text
          accessibilityRole="header"
          accessibilityLabel={`${copy.roomTitle}. ${copy.roomSubtitle(partnerFirstName)}`}
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={styles.title}
        >
          {copy.roomTitle}
        </Text>
        <View style={[styles.side, styles.sideEnd]} pointerEvents="box-none">
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={copy.keyboardSuggestions}
            accessibilityHint={copy.keyboardSuggestionsHint}
            accessibilityState={{ checked: suggestionsEnabled }}
            accessibilityValue={{ text: suggestionsEnabled ? copy.keyboardSuggestionsOn : copy.keyboardSuggestionsOff }}
            hitSlop={3}
            onPress={onToggleSuggestions}
            style={({ pressed }) => pressed ? styles.pressed : null}
          >
            <View style={[styles.headerControl, styles.center, suggestionsEnabled ? styles.suggestionsSelected : null]}>
              <SymbolView name={{ ios: "keyboard", android: "keyboard", web: "keyboard" }} size={28} tintColor={suggestionsEnabled ? MIC_SELECTED_INK : "#645269"} />
              <View pointerEvents="none" style={[styles.suggestionsMark, { backgroundColor: suggestionsEnabled ? MIC_SELECTED_INK : "#B8A9BD" }]} />
            </View>
          </Pressable>
          {voiceAvailable ? <MicrophoneButton
            copy={copy}
            micEnabled={localMedia.micEnabled}
            voiceAvailable={voiceAvailable}
            connected={connectionStatus === "connected"}
            onToggleMic={onToggleMic}
          /> : null}
          <GlassIconButton
            size={44}
            icon="ellipsis-horizontal"
            accessibilityLabel={copy.roomOptions}
            expanded={menuOpen}
            onPress={() => {
              onCloseKeyboard()
              setMenuOpen((open) => !open)
            }}
          />
        </View>
      </View>

      {statusText || notices.length > 0 ? (
        <View
          style={[styles.notices, { top: headerBottom + 8, left: horizontalInset, right: horizontalInset }]}
          pointerEvents="box-none"
          accessibilityLiveRegion="polite"
        >
          {statusText ? (
            <NoticePill
              text={statusText}
              icon={statusNotice === "failed" ? "cloud-offline-outline" : "sync-outline"}
              action={statusNotice === "failed"
                ? { label: copy.retry, accessibilityLabel: copy.retryRoomConnection, onPress: onRetryConnect }
                : undefined}
            />
          ) : null}
          {notices.map((notice) => (
            <NoticePill key={notice} text={notice} icon="alert-circle-outline" />
          ))}
        </View>
      ) : null}

      {menuOpen ? (
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.closeRoomOptions}
            onPress={closeMenu}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.menu, { top: headerBottom + 6, right: horizontalInset }]}>
            <MenuItem
              icon="shield-checkmark-outline"
              label={copy.safetyOptions}
              accessibilityLabel={copy.openSafetyOptions}
              onPress={() => {
                closeMenu()
                onOpenSafety()
              }}
            />
            <MenuItem
              icon="exit-outline"
              label={copy.leaveRoom}
              accessibilityLabel={copy.leaveRoom}
              disabled={leaveDisabled}
              onPress={() => {
                closeMenu()
                onLeave()
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

function GlassIconButton(props: {
  size: number
  icon: IconName
  accessibilityLabel: string
  disabled?: boolean
  expanded?: boolean
  onPress: () => void
}) {
  const { size, icon, accessibilityLabel, disabled = false, expanded, onPress } = props
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      hitSlop={(44 - size) / 2 + 2}
      onPress={onPress}
      style={({ pressed }) => [disabled ? styles.disabled : null, pressed ? styles.pressed : null]}
    >
      <View style={[styles.headerControl, styles.center, { width: size, height: size }]}>
        <Ionicons name={icon} size={20} color="#645269" />
      </View>
    </Pressable>
  )
}

function MicrophoneButton(props: {
  copy: MiniRoomCopy
  micEnabled: boolean
  voiceAvailable: boolean
  connected: boolean
  onToggleMic: () => void
}) {
  const { copy, micEnabled, voiceAvailable, connected, onToggleMic } = props
  const disabled = !connected || !voiceAvailable
  const hint = !voiceAvailable
    ? copy.voiceUnavailableHint
    : connected ? undefined : copy.voiceWaitsForConnectionHint
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={micEnabled ? copy.muteMicrophone : copy.turnOnMicrophone}
      accessibilityHint={hint}
      accessibilityValue={{ text: micEnabled ? copy.voiceOn : copy.voiceOff }}
      accessibilityState={{ disabled, selected: micEnabled }}
      disabled={disabled}
      hitSlop={5}
      onPress={onToggleMic}
      style={({ pressed }) => [disabled ? styles.micUnavailable : null, pressed ? styles.pressed : null]}
    >
      <WardrobeGlass tone="control" radius={19} style={styles.round38} contentStyle={styles.center}>
        {micEnabled ? <View pointerEvents="none" style={styles.micSelected} /> : null}
        <Ionicons
          name={micEnabled ? "mic" : "mic-off-outline"}
          size={18}
          color={micEnabled ? MIC_SELECTED_INK : wardrobeTheme.ink}
        />
      </WardrobeGlass>
    </Pressable>
  )
}

function NoticePill(props: {
  text: string
  icon: IconName
  action?: { label: string; accessibilityLabel: string; onPress: () => void }
}) {
  const { text, icon, action } = props
  return (
    <WardrobeGlass tone="control" radius={18} contentStyle={styles.notice}>
      <Ionicons name={icon} size={15} color={NOTICE_INK} />
      <Text accessibilityRole="alert" maxFontSizeMultiplier={1.4} style={styles.noticeText}>
        {text}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          hitSlop={8}
          onPress={action.onPress}
          style={({ pressed }) => [styles.noticeAction, pressed ? styles.pressed : null]}
        >
          <Text maxFontSizeMultiplier={1.3} style={styles.noticeActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </WardrobeGlass>
  )
}

function MenuItem(props: {
  icon: IconName
  label: string
  accessibilityLabel: string
  disabled?: boolean
  onPress: () => void
}) {
  const { icon, label, accessibilityLabel, disabled = false, onPress } = props
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed ? styles.menuItemPressed : null,
        disabled ? styles.disabled : null
      ]}
    >
      <Ionicons name={icon} size={18} color={MENU_ICON} />
      <Text maxFontSizeMultiplier={1.4} style={styles.menuText}>{label}</Text>
    </Pressable>
  )
}

const MIC_SELECTED_INK = "#9E365B"
const NOTICE_INK = "#806780"
const MENU_ICON = "#7D677C"

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    height: 44,
    flexDirection: "row",
    alignItems: "center"
  },
  side: {
    width: 94,
    flexDirection: "row",
    alignItems: "center"
  },
  sideEnd: {
    flexShrink: 0,
    width: 94,
    justifyContent: "flex-end",
    gap: 6
  },
  title: {
    flex: 1,
    textAlign: "center",
    color: wardrobeTheme.ink,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.55
  },
  center: {
    alignItems: "center",
    justifyContent: "center"
  },
  round38: {
    width: 38,
    height: 38
  },
  headerControl: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.75)" },
  suggestionsSelected: { backgroundColor: "#F2E1EA" },
  suggestionsMark: {
    position: "absolute",
    right: 9,
    bottom: 9,
    width: 5,
    height: 5,
    borderRadius: 3
  },
  micSelected: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#F2E1EA"
  },
  micUnavailable: {
    opacity: 0.62
  },
  notices: {
    position: "absolute",
    alignItems: "center",
    gap: 6
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 7,
    paddingLeft: 12,
    paddingRight: 12
  },
  noticeText: {
    flexShrink: 1,
    color: "#6A596A",
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    fontSize: 12,
    lineHeight: 16
  },
  noticeAction: {
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#F2E1EA"
  },
  noticeActionText: {
    color: MIC_SELECTED_INK,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: 12
  },
  menu: {
    position: "absolute",
    minWidth: 196,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(255, 250, 253, 0.97)",
    shadowColor: wardrobeTheme.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
  },
  menuItem: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 12
  },
  menuItemPressed: {
    backgroundColor: "#F4EAF2"
  },
  menuText: {
    color: wardrobeTheme.ink,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    fontSize: 14
  },
  disabled: {
    opacity: 0.42
  },
  pressed: {
    opacity: 0.72
  }
})
