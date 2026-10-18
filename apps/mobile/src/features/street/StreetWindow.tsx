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
import { CatSprite } from "../catTrips/CatSprite"
import { StreetNoteBubble } from "./StreetNoteBubble"
import type { StreetLight } from "./streetNoteModel"
import { StreetRoomScene } from "./StreetRoomScene"

/** A round window (68 pt glass in an 84 pt slot) with room above it for a two-line note bubble, like a notes row. */
export const STREET_WINDOW = { width: 84, wideWidth: 96, glass: 68, bubble: 40, gap: 6 } as const
/** From AX1 up the window grows and the name may wrap (spec §3). */
const LARGE_TEXT_SCALE = 1.35
/** A window shows the whole chibi standing in a fifth of their room, so a new rug or bed shows too (spec §1). */
const ROOM_FRAMING = { roomScale: 5.2 } as const
const NIGHT_GLASS_OPACITY = 0.88
const WAKE_STAGGER_MS = 110
const WAKE_MAX_WINDOWS = 7
/** The guest cat sits on the window's floor, left of the chibi. */
const GUEST_CAT = { size: 34, left: 2, bottom: 2 } as const
/**
 * One sky for the whole street: a barely-there warm tint in the morning and evening, never an effect. Night has none:
 * a dark wash over a pink room only read as a faded window (owner, 2026-10-18).
 */
const LIGHT_TINT: Readonly<Record<StreetLight, string | null>> = {
  morning: "rgba(255, 240, 214, 0.1)",
  day: null,
  evening: "rgba(255, 168, 92, 0.1)",
  night: null
}

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
  /** Notes prototype: this window's note, the light of the hour and, on your own window, the note editor. */
  note?: string | null
  light?: StreetLight
  onEditNote?: () => void
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
  const baseLabel = window ? streetWindowAccessibilityLabel(window, copy, props.fallbackName) : copy.self
  const accessibilityLabel = props.note && !closed ? `${baseLabel}. ${copy.noteLabel(name, props.note)}` : baseLabel
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
        {props.note && !closed ? (
          <StreetNoteBubble text={props.note} onPress={isSelf ? props.onEditNote : undefined} />
        ) : isSelf && props.onEditNote ? (
          <StreetNoteBubble text={copy.leaveNote} placeholder onPress={props.onEditNote} />
        ) : label && window?.change !== "guest" ? (
          <View style={styles.pill}><Text style={styles.pillText} numberOfLines={1}>{label}</Text></View>
        ) : null}
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
            roomWidth={glassSize * ROOM_FRAMING.roomScale}
            greet={Boolean(props.note) && !isSelf}
          />
        )}
        {window?.change === "guest" && !closed ? (
          <View style={styles.guestCat} accessible accessibilityLabel={copy.guestCat}>
            <CatSprite clip="sit" size={GUEST_CAT.size} />
          </View>
        ) : null}
        {props.light && LIGHT_TINT[props.light] ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: LIGHT_TINT[props.light] ?? undefined }]} />
        ) : null}
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
  bubbleSpace: { height: STREET_WINDOW.bubble, justifyContent: "flex-end", alignItems: "center", marginBottom: -8, zIndex: 1 },
  guestCat: { position: "absolute", left: GUEST_CAT.left, bottom: GUEST_CAT.bottom },
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
