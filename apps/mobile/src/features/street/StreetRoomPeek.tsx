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
import type { StreetWindowSnapshot } from "./streetModel"
import { normalizeStreetNote } from "./streetNoteModel"
import { StreetRoomScene } from "./StreetRoomScene"

/** Side inset of the sheet's content. */
const SIDE = 16
/** The room card: about half the room across, a little wider than tall, in a white frame. */
const PEEK = { roomScale: 2.3, heightRatio: 0.8, radius: 30, frame: 4 } as const
const TEXT_SCALE_CAP = 1.6

export interface StreetRoomPeekContentProps {
  window: StreetWindow
  previous: StreetWindowSnapshot | null
  copy: StreetCopy
  fallbackName: string
  /** Notes prototype: their note, said by the chibi over its head. */
  note: string | null
  /** Opens the chat with this message as a draft (quoting the note when there is one). */
  onReply: (threadId: string, note: string | null, reply: string) => void
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

/** Their room with the note over the chibi's head, their name, and one message field into the chat. */
export function StreetRoomPeekContent(props: StreetRoomPeekContentProps) {
  const { window, previous, copy, note } = props
  const { width } = useWindowDimensions()
  const { close } = useSheetPresentation()
  const [showYesterday, setShowYesterday] = useState(false)
  const [message, setMessage] = useState("")
  const text = normalizeStreetNote(message)
  const send = () => {
    if (!text) return
    setMessage("")
    close(() => props.onReply(window.threadId, note, text))
  }
  const name = window.displayName ?? props.fallbackName
  const shown = showYesterday && previous ? previous : window
  const sceneWidth = width - SIDE * 2 - PEEK.frame * 2
  const sceneHeight = Math.round(sceneWidth * PEEK.heightRatio)
  const placeholder = note ? copy.replyPlaceholder : copy.messagePlaceholder
  return (
    <View style={styles.content}>
      <View style={styles.frame}>
        <View style={[styles.scene, { height: sceneHeight }]}>
          <Reanimated.View
            key={showYesterday ? "yesterday" : "today"}
            entering={FadeIn.duration(220)}
            accessible={note !== null}
            accessibilityLabel={note ? copy.noteLabel(name, note) : undefined}
          >
            <StreetRoomScene
              room={shown.room}
              avatar={shown.avatar}
              width={sceneWidth}
              height={sceneHeight}
              roomWidth={sceneWidth * PEEK.roomScale}
              greet={note !== null}
              overHead={note ? <NoteBubble note={note} /> : undefined}
            />
          </Reanimated.View>
          {previous ? (
            <View style={styles.segment} accessibilityRole="tablist">
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
      </View>
      <Text accessibilityRole="header" maxFontSizeMultiplier={TEXT_SCALE_CAP} numberOfLines={1} style={styles.name}>
        {name}
      </Text>
      <View style={styles.composer}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={placeholder}
          accessibilityLabel={placeholder}
          placeholderTextColor={uiTheme.colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={send}
          maxFontSizeMultiplier={TEXT_SCALE_CAP}
          style={styles.input}
        />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={copy.send}
          accessibilityState={{ disabled: text === null }}
          disabled={text === null}
          onPress={send}
          style={[styles.send, text === null && styles.sendDisabled]}
        >
          <Ionicons name="arrow-up" size={19} color={uiTheme.colors.onPrimary} />
        </PressableScale>
      </View>
    </View>
  )
}

/** The note as a speech bubble with its tail pointing down at the chibi. */
function NoteBubble({ note }: { note: string }) {
  return (
    <View style={styles.bubbleWrap}>
      <View style={styles.bubble}>
        <Text maxFontSizeMultiplier={TEXT_SCALE_CAP} numberOfLines={3} style={styles.bubbleText}>{note}</Text>
      </View>
      <View style={styles.bubbleTail} />
    </View>
  )
}

const BUBBLE = "rgba(255, 255, 255, 0.96)"

const styles = StyleSheet.create({
  backdrop: { backgroundColor: uiTheme.colors.overlaySoft },
  fallbackSheet: { backgroundColor: uiTheme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, paddingBottom: 28 },
  content: { paddingHorizontal: SIDE, paddingTop: 10, gap: 14 },
  frame: {
    padding: PEEK.frame,
    borderRadius: PEEK.radius,
    borderCurve: "continuous",
    backgroundColor: BUBBLE,
    shadowColor: uiTheme.colors.primaryDeep,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }
  },
  scene: {
    borderRadius: PEEK.radius - PEEK.frame,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: uiTheme.colors.surfaceMuted
  },
  bubbleWrap: { alignItems: "center", maxWidth: "88%" },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    borderCurve: "continuous",
    backgroundColor: BUBBLE,
    shadowColor: uiTheme.colors.textPrimary,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  bubbleText: { color: uiTheme.colors.textPrimary, fontSize: 15, lineHeight: 20, fontWeight: "600", textAlign: "center" },
  bubbleTail: {
    width: 12,
    height: 12,
    marginTop: -7,
    borderBottomRightRadius: 3,
    backgroundColor: BUBBLE,
    transform: [{ rotate: "45deg" }]
  },
  segment: {
    position: "absolute",
    left: 10,
    bottom: 10,
    flexDirection: "row",
    padding: 3,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: BUBBLE
  },
  segmentItem: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 13 },
  segmentOn: { backgroundColor: uiTheme.colors.primarySoft },
  segmentText: { color: uiTheme.colors.textPrimary, fontSize: 13, fontWeight: "600" },
  name: { paddingHorizontal: 4, color: uiTheme.colors.textPrimary, fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 50,
    paddingLeft: 18,
    paddingRight: 6,
    marginBottom: 4,
    borderRadius: 25,
    borderCurve: "continuous",
    backgroundColor: uiTheme.colors.surfaceSoft
  },
  input: { flex: 1, color: uiTheme.colors.textPrimary, fontSize: 16, paddingVertical: 12 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: uiTheme.colors.primary },
  sendDisabled: { opacity: 0.4 }
})
