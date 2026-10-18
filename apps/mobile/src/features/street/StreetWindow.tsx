import Ionicons from "@expo/vector-icons/Ionicons"
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

/** A round window (68 pt glass in a 78 pt slot) with room above it for the change bubble, like a notes row. */
export const STREET_WINDOW = { width: 78, wideWidth: 92, glass: 68, bubble: 20, gap: 10 } as const
/** From AX1 up the window grows and the name may wrap (spec §3). */
const LARGE_TEXT_SCALE = 1.35
/** A round window frames the chibi's head and shoulders, like a profile photo; the room stays behind as colour. */
const BUST_FRAMING = { chibiScale: 1.9, feetRatio: 1.98, roomScale: 13.4 } as const
const NIGHT_GLASS_OPACITY = 0.88
const WAKE_STAGGER_MS = 110
const WAKE_MAX_WINDOWS = 7

export type StreetWindowKind =
  | { kind: "window"; window: StreetWindowData; isNew: boolean }
  | { kind: "self"; closed: boolean; room: StreetRoom | null; avatar: { loadout?: unknown } | null }
  | { kind: "empty" }

/** One round window: glass (room + chibi), a change bubble above it, an optional unread badge and the name. */
export const StreetWindowView = memo(function StreetWindowView(props: {
  item: StreetWindowKind
  index: number
  copy: StreetCopy
  fallbackName: string
  wakeUp: boolean
  onPress: () => void
  onOpenChat?: () => void
}) {
  const { item, index, copy, wakeUp } = props
  const motion = useMotion()
  const { fontScale } = useWindowDimensions()
  const width = fontScale >= LARGE_TEXT_SCALE ? STREET_WINDOW.wideWidth : STREET_WINDOW.width
  const glassSize = STREET_WINDOW.glass
  const nightGlass = useSharedValue(wakeUp ? NIGHT_GLASS_OPACITY : 0)
  useEffect(() => {
    if (!wakeUp) return
    nightGlass.value = animateToAfter(Math.min(index, WAKE_MAX_WINDOWS) * WAKE_STAGGER_MS, 0, motion.fadeIn)
  }, [index, motion.fadeIn, nightGlass, wakeUp])
  const nightStyle = useAnimatedStyle(() => ({ opacity: nightGlass.value }))

  if (item.kind === "empty") {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={copy.emptyWindow}
        accessibilityHint={copy.buildingStreet}
        onPress={props.onPress}
        style={[styles.slot, { width }]}
      >
        <View style={styles.bubbleSpace} />
        <View style={[styles.glass, styles.emptyGlass]}>
          <Ionicons name="add" size={28} color={uiTheme.colors.primaryDeep} />
        </View>
        <Text style={[styles.name, styles.inviteName]} numberOfLines={1}>{copy.emptyWindow}</Text>
      </PressableScale>
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
      <View style={styles.bubbleSpace}>
        {label ? <View style={styles.pill}><Text style={styles.pillText} numberOfLines={1}>{label}</Text></View> : null}
      </View>
      <View style={styles.glass}>
        {closed ? (
          <View style={styles.curtains}><View style={styles.curtain} /><View style={styles.curtain} /></View>
        ) : (
          <StreetRoomScene
            room={isSelf ? item.room : window!.room}
            avatar={isSelf ? item.avatar : window!.avatar}
            width={glassSize}
            height={glassSize}
            roomWidth={glassSize * BUST_FRAMING.roomScale}
            chibiHeight={glassSize * BUST_FRAMING.chibiScale}
            feetRatio={BUST_FRAMING.feetRatio}
          />
        )}
        <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.night, nightStyle]} />
      </View>
      {window && window.unread > 0 ? (
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.badgeText}>{window.unread > 99 ? "99+" : window.unread}</Text>
        </View>
      ) : null}
      <Text style={styles.name} numberOfLines={fontScale >= LARGE_TEXT_SCALE ? 2 : 1}>{name}</Text>
    </PressableScale>
  )
})

const styles = StyleSheet.create({
  slot: { alignItems: "center", gap: 4 },
  bubbleSpace: { height: STREET_WINDOW.bubble, justifyContent: "flex-end", alignItems: "center", marginBottom: -10, zIndex: 1 },
  glass: {
    width: STREET_WINDOW.glass,
    height: STREET_WINDOW.glass,
    overflow: "hidden",
    borderRadius: STREET_WINDOW.glass / 2,
    borderWidth: 2.5,
    borderColor: uiTheme.colors.surface,
    backgroundColor: uiTheme.colors.avatarBackground
  },
  emptyGlass: { borderStyle: "dashed", borderColor: uiTheme.colors.primarySoft, backgroundColor: uiTheme.colors.surface, alignItems: "center", justifyContent: "center" },
  inviteName: { color: uiTheme.colors.primaryDeep },
  night: { backgroundColor: "#2B2140" },
  curtains: { flex: 1, flexDirection: "row" },
  curtain: { flex: 1, backgroundColor: uiTheme.colors.primarySoft, borderWidth: 1, borderColor: uiTheme.colors.surface },
  badge: {
    position: "absolute",
    top: STREET_WINDOW.bubble - 6,
    right: 0,
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
  pill: { maxWidth: STREET_WINDOW.wideWidth, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: uiTheme.colors.surface, ...uiTheme.shadow.float },
  pillText: { color: uiTheme.colors.chipText, fontSize: 11, fontWeight: "600", textAlign: "center" },
  name: { color: uiTheme.colors.textSecondary, fontSize: 12, fontWeight: "600", textAlign: "center" }
})
