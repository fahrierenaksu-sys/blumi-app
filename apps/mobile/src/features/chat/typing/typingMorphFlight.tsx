import { StyleSheet, View } from "react-native"
import { claimFlight, launchFlight } from "../../../ui/flight/FlightLayer"
import type { FlightSurface } from "../../../ui/flight/flightStore"
import { TypingDots } from "../../../ui/typingDots"
import { uiTheme } from "../../../ui/theme"
import { bubbleStyles } from "../thread/chatThreadStyles"
import { typingMorphSources } from "./typingMorphSource"

/**
 * Typing dots become the bubble (MOTION_PLAN §C, journey 5): when the
 * partner's message arrives while their typing dots are (or were just) on
 * screen, the dots' bubble grows into the new incoming bubble and the dots
 * fade as the words appear under them. Like every flight it only decorates:
 * the message is already in the list, and without dots there is no morph
 * (the row keeps its usual fade). Reduce Motion crossfades in place.
 */

const BUBBLE_SURFACE: FlightSurface = {
  backgroundColor: String(StyleSheet.flatten(bubbleStyles.bubbleThem).backgroundColor),
  borderColor: String(StyleSheet.flatten(bubbleStyles.bubbleThem).borderColor),
  borderWidth: 1,
  radius: Number(StyleSheet.flatten(bubbleStyles.bubble).borderRadius)
}

function getTypingMorphChannel(conversationKey: string): string {
  return `typing-morph:${conversationKey}`
}

/**
 * Called once, while the arriving row first renders: launches the morph from
 * the dots and returns the flight id the row's bubble lands, or null.
 */
export function claimTypingMorph(conversationKey: string, messageId: string): string | null {
  const source = typingMorphSources.take(conversationKey)
  if (!source) return null
  const channel = getTypingMorphChannel(conversationKey)
  const launched = launchFlight({
    channel,
    match: messageId,
    source,
    sourceSurface: BUBBLE_SURFACE,
    targetSurface: BUBBLE_SURFACE,
    content: (
      <View style={[styles.dots, { width: source.width, height: source.height }]}>
        <TypingDots size={6} color={uiTheme.colors.primary} />
      </View>
    )
  })
  return launched ? claimFlight(channel, messageId) : null
}

const styles = StyleSheet.create({
  dots: {
    justifyContent: "center",
    paddingHorizontal: 12
  }
})
