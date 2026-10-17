import type { StreetRoom, StreetWindow as StreetWindowData } from "@blumi/contracts"
import { memo, useEffect } from "react"
import { StyleSheet, Text, View, useWindowDimensions } from "react-native"
import Reanimated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { animateToAfter, useMotion } from "../../ui/motion"
import { PressableScale } from "../../ui/PressableScale"
import { uiTheme } from "../../ui/theme"
import type { StreetCopy } from "./streetCopy"
import { streetChangeLabel, streetWindowAccessibilityLabel } from "./streetModel"
import { StreetRoomScene } from "./StreetRoomScene"

export const STREET_WINDOW = { width: 92, height: 112, wideWidth: 104, porthole: 64, gap: 14 } as const
/** From AX1 up the window grows and the name may wrap (spec §3). */
const LARGE_TEXT_SCALE = 1.35
const NIGHT_GLASS_OPACITY = 0.88
const WAKE_STAGGER_MS = 110
const WAKE_MAX_WINDOWS = 7

export type StreetWindowKind =
  | { kind: "window"; window: StreetWindowData; isNew: boolean }
  | { kind: "self"; closed: boolean; room: StreetRoom | null; avatar: { loadout?: unknown } | null }
  | { kind: "empty" }

/** One arched window: glass (room + chibi), optional unread badge, the one-word pill and the name. */
export const StreetWindowView = memo(function StreetWindowView(props: {
  item: StreetWindowKind
  index: number
  copy: StreetCopy
  fallbackName: string
  porthole: boolean
  wakeUp: boolean
  onPress: () => void
  onOpenChat?: () => void
}) {
  const { item, index, copy, porthole, wakeUp } = props
  const motion = useMotion()
  const { fontScale } = useWindowDimensions()
  const width = porthole ? STREET_WINDOW.porthole : fontScale >= LARGE_TEXT_SCALE ? STREET_WINDOW.wideWidth : STREET_WINDOW.width
  const glassHeight = porthole ? STREET_WINDOW.porthole : STREET_WINDOW.height
  const nightGlass = useSharedValue(wakeUp ? NIGHT_GLASS_OPACITY : 0)
  useEffect(() => {
    if (!wakeUp) return
    nightGlass.value = animateToAfter(Math.min(index, WAKE_MAX_WINDOWS) * WAKE_STAGGER_MS, 0, motion.fadeIn)
  }, [index, motion.fadeIn, nightGlass, wakeUp])
  const nightStyle = useAnimatedStyle(() => ({ opacity: nightGlass.value }))

  if (item.kind === "empty") {
    return (
      <View style={[styles.slot, { width }]} accessible accessibilityLabel={copy.emptyWindow}>
        <View style={[styles.glass, styles.emptyGlass, { height: glassHeight }, porthole && styles.porthole]} />
        {porthole ? null : <Text style={styles.name} numberOfLines={1}>{copy.emptyWindow}</Text>}
      </View>
    )
  }
  const isSelf = item.kind === "self"
  const window = item.kind === "window" ? item.window : null
  const closed = isSelf ? item.closed : window!.closed
  const name = isSelf ? copy.self : window!.displayName ?? props.fallbackName
  const label = window ? streetChangeLabel(window.change, copy) : null
  const accessibilityLabel = window ? streetWindowAccessibilityLabel(window, copy, props.fallbackName) : copy.self
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={closed ? copy.closedHint : copy.windowHint}
      accessibilityActions={props.onOpenChat ? [{ name: "openChat", label: copy.openChatAction }] : undefined}
      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "openChat") props.onOpenChat?.() }}
      onPress={props.onPress}
      style={[styles.slot, { width }]}
    >
      <View style={[styles.glass, { height: glassHeight }, porthole && styles.porthole]}>
        {closed ? (
          <View style={styles.curtains}><View style={styles.curtain} /><View style={styles.curtain} /></View>
        ) : (
          <StreetRoomScene
            room={isSelf ? item.room : window!.room}
            avatar={isSelf ? item.avatar : window!.avatar}
            width={width}
            height={glassHeight}
            roomWidth={width * 5.2}
            chibiHeight={glassHeight * 0.74}
          />
        )}
        <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.night, nightStyle]} />
      </View>
      {window && window.unread > 0 ? (
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.badgeText}>{window.unread > 99 ? "99+" : window.unread}</Text>
        </View>
      ) : null}
      {porthole ? null : (
        <>
          {label ? <View style={styles.pill}><Text style={styles.pillText} numberOfLines={2}>{label}</Text></View> : null}
          <Text style={styles.name} numberOfLines={fontScale >= LARGE_TEXT_SCALE ? 2 : 1}>{name}</Text>
        </>
      )}
    </PressableScale>
  )
})

const styles = StyleSheet.create({
  slot: { alignItems: "center", gap: 4 },
  glass: {
    width: "100%",
    overflow: "hidden",
    borderTopLeftRadius: 46,
    borderTopRightRadius: 46,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 3,
    borderColor: uiTheme.colors.surface,
    backgroundColor: uiTheme.colors.avatarBackground
  },
  porthole: { borderRadius: 999 },
  emptyGlass: { borderStyle: "dashed", borderColor: uiTheme.colors.borderStrong, backgroundColor: "transparent" },
  night: { backgroundColor: "#2B2140" },
  curtains: { flex: 1, flexDirection: "row" },
  curtain: { flex: 1, backgroundColor: uiTheme.colors.primarySoft, borderWidth: 1, borderColor: uiTheme.colors.surface },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    borderWidth: 2.5,
    borderColor: uiTheme.colors.background,
    backgroundColor: uiTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: { color: uiTheme.colors.onPrimary, fontSize: 11, fontWeight: "700" },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: uiTheme.colors.chipBackground },
  pillText: { color: uiTheme.colors.chipText, fontSize: 11, fontWeight: "600", textAlign: "center" },
  name: { color: uiTheme.colors.textSecondary, fontSize: 12, fontWeight: "600", textAlign: "center" }
})
