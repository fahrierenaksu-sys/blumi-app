import { memo } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { uiTheme } from "../../ui/theme"

const BUBBLE_MAX_WIDTH = 96
const TAIL_SIZE = 7

/**
 * A speech bubble over a street window, its tail pointing down at the chibi, so the note reads as said by them.
 * `placeholder` is the muted "leave a note" bubble over your own window.
 */
export const StreetNoteBubble = memo(function StreetNoteBubble(props: {
  text: string
  placeholder?: boolean
  onPress?: () => void
  accessibilityLabel?: string
}) {
  const body = (
    <View style={styles.wrap}>
      <View style={[styles.bubble, props.placeholder && styles.placeholderBubble]}>
        <Text style={[styles.text, props.placeholder && styles.placeholderText]} numberOfLines={2}>{props.text}</Text>
      </View>
      <View style={[styles.tail, props.placeholder && styles.placeholderTail]} />
    </View>
  )
  if (!props.onPress) return body
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={props.accessibilityLabel ?? props.text} onPress={props.onPress} hitSlop={6}>
      {body}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  bubble: {
    maxWidth: BUBBLE_MAX_WIDTH,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: uiTheme.colors.surface,
    ...uiTheme.shadow.float
  },
  placeholderBubble: { backgroundColor: uiTheme.colors.surfaceSoft, shadowOpacity: 0 },
  text: { color: uiTheme.colors.textPrimary, fontSize: 11, lineHeight: 14, fontWeight: "600", textAlign: "center" },
  placeholderText: { color: uiTheme.colors.textMuted, fontWeight: "500" },
  tail: {
    width: TAIL_SIZE,
    height: TAIL_SIZE,
    marginTop: -TAIL_SIZE / 2,
    backgroundColor: uiTheme.colors.surface,
    transform: [{ rotate: "45deg" }]
  },
  placeholderTail: { backgroundColor: uiTheme.colors.surfaceSoft }
})
