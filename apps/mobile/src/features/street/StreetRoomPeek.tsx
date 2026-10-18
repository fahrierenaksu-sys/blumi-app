import Ionicons from "@expo/vector-icons/Ionicons"
import type { StreetWindow } from "@blumi/contracts"
import { useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native"
import Reanimated, { FadeIn } from "react-native-reanimated"
import { useNativeSheet } from "../../navigation/nativeSheets/useNativeSheet"
import { ModalBottomSheet } from "../../ui/ModalBottomSheet"
import { PressableScale } from "../../ui/PressableScale"
import { useSheetPresentation } from "../../ui/sheetPresentation"
import { uiTheme } from "../../ui/theme"
import type { StreetCopy } from "./streetCopy"
import { streetChangeLabel, streetStarters, type StreetWindowSnapshot } from "./streetModel"
import { normalizeStreetNote } from "./streetNoteModel"
import { StreetRoomScene } from "./StreetRoomScene"

/** Side inset of the sheet's content. */
const SIDE = 16
/** The room card: about half the room across, a little wider than tall. */
const PEEK = { roomScale: 2.3, heightRatio: 0.74, radius: 26 } as const
const TEXT_SCALE_CAP = 1.6

export interface StreetRoomPeekContentProps {
  window: StreetWindow
  previous: StreetWindowSnapshot | null
  copy: StreetCopy
  fallbackName: string
  onStarter: (threadId: string, draft: string | null) => void
  /** Notes prototype: their note, answered from here into the chat. */
  note: string | null
  onReply?: (threadId: string, note: string, reply: string) => void
}

/**
 * One window's room up close. A native form sheet on iOS (Liquid Glass from iOS 26), the app's swipe-down sheet on
 * Android: swipe down or tap outside to close, so it needs no close button.
 */
export function StreetRoomPeek(props: Omit<StreetRoomPeekContentProps, "window" | "note"> & {
  window: StreetWindow | null
  note?: string | null
  onClose: () => void
}) {
  const { window, onClose, ...rest } = props
  const content: StreetRoomPeekContentProps | null = window ? { ...rest, window, note: props.note ?? null } : null
  const presentsNatively = useNativeSheet("streetRoomPeek", content, onClose)
  if (presentsNatively) return null
  return (
    <ModalBottomSheet
      visible={content !== null}
      onClose={onClose}
      backdrop={{ style: styles.backdrop, onPress: onClose, accessibilityLabel: props.copy.close }}
      sheetStyle={styles.fallbackSheet}
    >
      {content ? <StreetRoomPeekContent {...content} /> : null}
    </ModalBottomSheet>
  )
}

/** The room card (Dün / Bugün when this device kept yesterday's), their note with a reply, and two starters. */
export function StreetRoomPeekContent(props: StreetRoomPeekContentProps) {
  const { window, previous, copy, note } = props
  const { width } = useWindowDimensions()
  const { close } = useSheetPresentation()
  const [showYesterday, setShowYesterday] = useState(false)
  const [reply, setReply] = useState("")
  const replyText = normalizeStreetNote(reply)
  const sendReply = () => {
    if (!note || !replyText) return
    setReply("")
    close(() => props.onReply?.(window.threadId, note, replyText))
  }
  const startWith = (starter: string) => close(() => props.onStarter(window.threadId, starter))
  const shown = showYesterday && previous ? previous : window
  const label = streetChangeLabel(window.change, copy)
  const sceneWidth = width - SIDE * 2
  const sceneHeight = Math.round(sceneWidth * PEEK.heightRatio)
  return (
    <View style={styles.content}>
      <View style={[styles.scene, { height: sceneHeight }]}>
        <Reanimated.View key={showYesterday ? "yesterday" : "today"} entering={FadeIn.duration(220)}>
          <StreetRoomScene
            room={shown.room}
            avatar={shown.avatar}
            width={sceneWidth}
            height={sceneHeight}
            roomWidth={sceneWidth * PEEK.roomScale}
          />
        </Reanimated.View>
        {label ? (
          <View style={[styles.floating, styles.labelPill]}>
            <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={styles.labelText}>{`${copy.thisMorning} ${label}`}</Text>
          </View>
        ) : null}
        {previous ? (
          <View style={[styles.floating, styles.segment]} accessibilityRole="tablist">
            {[false, true].map((yesterday) => (
              <Pressable
                key={String(yesterday)}
                accessibilityRole="tab"
                accessibilityLabel={yesterday ? copy.yesterday : copy.today}
                accessibilityState={{ selected: showYesterday === yesterday }}
                onPress={() => setShowYesterday(yesterday)}
                style={[styles.segmentItem, showYesterday === yesterday && styles.segmentOn]}
              >
                <Text style={styles.segmentText}>{yesterday ? copy.yesterday : copy.today}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <Text accessibilityRole="header" maxFontSizeMultiplier={TEXT_SCALE_CAP} numberOfLines={1} style={styles.name}>
        {window.displayName ?? props.fallbackName}
      </Text>
      {note ? (
        <View style={styles.noteBubble}>
          <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={styles.noteText}>{note}</Text>
        </View>
      ) : null}
      {note && props.onReply ? (
        <View style={styles.replyRow}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder={copy.replyPlaceholder}
            accessibilityLabel={copy.replyPlaceholder}
            placeholderTextColor={uiTheme.colors.textMuted}
            returnKeyType="send"
            onSubmitEditing={sendReply}
            maxFontSizeMultiplier={TEXT_SCALE_CAP}
            style={styles.replyInput}
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={copy.send}
            accessibilityState={{ disabled: replyText === null }}
            disabled={replyText === null}
            onPress={sendReply}
            style={[styles.send, replyText === null && styles.sendDisabled]}
          >
            <Ionicons name="arrow-up" size={20} color={uiTheme.colors.onPrimary} />
          </PressableScale>
        </View>
      ) : null}
      <View style={styles.chips}>
        {streetStarters(window.change, copy).map((starter) => (
          <PressableScale
            key={starter}
            accessibilityRole="button"
            accessibilityLabel={starter}
            onPress={() => startWith(starter)}
            style={styles.chip}
          >
            <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} style={styles.chipText}>{starter}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  )
}

/** Light enough for the sheet's glass to read through, solid enough for text. */
const FROST = "rgba(255, 255, 255, 0.62)"
const FROST_STRONG = "rgba(255, 255, 255, 0.86)"

const styles = StyleSheet.create({
  backdrop: { backgroundColor: uiTheme.colors.overlaySoft },
  fallbackSheet: { backgroundColor: uiTheme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, paddingBottom: 28 },
  content: { paddingHorizontal: SIDE, paddingTop: 8, gap: 12 },
  scene: { borderRadius: PEEK.radius, borderCurve: "continuous", overflow: "hidden", backgroundColor: uiTheme.colors.surfaceMuted },
  floating: { position: "absolute", top: 12, borderRadius: 16, borderCurve: "continuous", backgroundColor: FROST_STRONG },
  labelPill: { left: 12, paddingHorizontal: 12, paddingVertical: 6 },
  labelText: { color: uiTheme.colors.chipText, fontSize: 13, fontWeight: "700" },
  segment: { right: 12, flexDirection: "row", padding: 3 },
  segmentItem: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 13 },
  segmentOn: { backgroundColor: uiTheme.colors.primarySoft },
  segmentText: { color: uiTheme.colors.textPrimary, fontSize: 13, fontWeight: "600" },
  name: { color: uiTheme.colors.textPrimary, fontSize: 24, fontWeight: "800", letterSpacing: -0.3, marginTop: 2, paddingHorizontal: 4 },
  noteBubble: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
    borderTopLeftRadius: 6,
    borderCurve: "continuous",
    backgroundColor: FROST_STRONG
  },
  noteText: { color: uiTheme.colors.textPrimary, fontSize: 17, lineHeight: 23, fontWeight: "600" },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  replyInput: {
    flex: 1,
    minHeight: 44,
    color: uiTheme.colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: FROST
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: uiTheme.colors.primary },
  sendDisabled: { opacity: 0.4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderCurve: "continuous", backgroundColor: FROST },
  chipText: { color: uiTheme.colors.chipText, fontSize: 15, fontWeight: "700" }
})
