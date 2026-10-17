import type { StreetWindow } from "@blumi/contracts"
import { useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native"
import Reanimated, { FadeIn } from "react-native-reanimated"
import { useMotion } from "../../ui/motion"
import { PressableScale } from "../../ui/PressableScale"
import { uiTheme } from "../../ui/theme"
import type { StreetCopy } from "./streetCopy"
import { streetChangeLabel, streetStarters, type StreetWindowSnapshot } from "./streetModel"
import { StreetRoomScene } from "./StreetRoomScene"

/** Room framing in the peek: about 1.9× the screen width, centred on the chibi (spec §4). */
const PEEK_ROOM_SCALE = 1.9
const PEEK_HEIGHT_RATIO = 0.62

/**
 * The zoomed room of one window: Dün / Bugün when this device kept yesterday's state, and two one-tap conversation
 * starters that open the chat with a draft. Native shared-element zoom from the window is Open (needs a device check).
 */
export function StreetRoomPeek(props: {
  window: StreetWindow | null
  previous: StreetWindowSnapshot | null
  copy: StreetCopy
  fallbackName: string
  onClose: () => void
  onStarter: (threadId: string, draft: string | null) => void
}) {
  const { window, previous, copy } = props
  const { width } = useWindowDimensions()
  const motion = useMotion()
  const [showYesterday, setShowYesterday] = useState(false)
  if (!window) return null
  const shown = showYesterday && previous ? previous : window
  const label = streetChangeLabel(window.change, copy)
  const starters = streetStarters(window.change, copy)
  const sceneHeight = width * PEEK_HEIGHT_RATIO
  return (
    <Modal visible transparent animationType={motion.reduceMotion ? "fade" : "slide"} onRequestClose={props.onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Reanimated.View key={showYesterday ? "yesterday" : "today"} entering={FadeIn.duration(220)}>
            <StreetRoomScene
              room={shown.room}
              avatar={shown.avatar}
              width={width - 32}
              height={sceneHeight}
              roomWidth={(width - 32) * PEEK_ROOM_SCALE}
              chibiHeight={sceneHeight * 0.7}
            />
          </Reanimated.View>
          <Text accessibilityRole="header" style={styles.title}>{window.displayName ?? props.fallbackName}</Text>
          {label ? <Text style={styles.label}>{`${copy.thisMorning} ${label}`}</Text> : null}
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
          <View style={styles.chips}>
            {starters.map((starter) => (
              <PressableScale
                key={starter}
                accessibilityRole="button"
                accessibilityLabel={starter}
                onPress={() => props.onStarter(window.threadId, starter)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{starter}</Text>
              </PressableScale>
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={props.onClose} style={styles.close}>
            <Text style={styles.closeText}>{copy.close}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: uiTheme.colors.overlaySoft },
  card: { backgroundColor: uiTheme.colors.surface, padding: 16, paddingBottom: 32, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 10 },
  title: { color: uiTheme.colors.textPrimary, fontSize: 20, fontWeight: "700" },
  label: { color: uiTheme.colors.chipText, fontSize: 14, fontWeight: "600" },
  segment: { flexDirection: "row", alignSelf: "flex-start", borderRadius: 14, backgroundColor: uiTheme.colors.secondary, padding: 3 },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 11 },
  segmentOn: { backgroundColor: uiTheme.colors.surface },
  segmentText: { color: uiTheme.colors.secondaryText, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: uiTheme.colors.chipBackground },
  chipText: { color: uiTheme.colors.chipText, fontWeight: "600" },
  close: { alignSelf: "center", padding: 8 },
  closeText: { color: uiTheme.colors.textSecondary, fontWeight: "600" }
})
