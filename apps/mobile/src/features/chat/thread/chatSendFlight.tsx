import { StyleSheet, Text, View, type View as ViewType } from "react-native"
import { launchFlight } from "../../../ui/flight/FlightLayer"
import type { FlightSurface } from "../../../ui/flight/flightStore"
import { uiTheme } from "../../../ui/theme"
import { bubbleStyles, styles as threadStyles } from "./chatThreadStyles"

/**
 * Chat send flight (MOTION_PLAN §D.4): the words leave the composer and fly
 * into the new bubble's place while the composer pill morphs into the bubble.
 * The message is already sent and its optimistic row already published when
 * this runs; the flight only decorates it and never waits for anything.
 */

/** Flights for one conversation; the new own row claims by its body. */
export function getChatSendFlightChannel(threadId: string | undefined): string {
  return `chat-send:${threadId ?? "pending"}`
}

const COMPOSER_SURFACE: FlightSurface = {
  backgroundColor: uiTheme.colors.glassStrong,
  borderColor: uiTheme.colors.glassBorder,
  borderWidth: 1,
  radius: uiTheme.radius.xl
}

const OWN_BUBBLE_SURFACE: FlightSurface = {
  backgroundColor: String(StyleSheet.flatten(bubbleStyles.bubbleMe).backgroundColor),
  borderColor: String(StyleSheet.flatten(bubbleStyles.bubbleMe).borderColor),
  borderWidth: 1,
  radius: Number(StyleSheet.flatten(bubbleStyles.bubble).borderRadius)
}

/**
 * Launches the flight from the composer's input surface. Skipped (the row
 * just appears with its usual entrance) when the composer cannot be measured
 * synchronously, so a clone never waits for a row that already claimed
 * nothing.
 */
export function launchChatSendFlight(input: {
  composerSurface: ViewType | null
  channel: string
  /** The normalized body the optimistic row carries. */
  match: string
  /** The text as it looked in the composer. */
  text: string
}): boolean {
  const { composerSurface, channel, match, text } = input
  if (!composerSurface || typeof composerSurface.measureInWindow !== "function") return false
  let launched = false
  let measuredSynchronously = true
  composerSurface.measureInWindow((x, y, width, height) => {
    if (!measuredSynchronously) return
    launched = launchFlight({
      channel,
      match,
      source: { x, y, width, height },
      sourceSurface: COMPOSER_SURFACE,
      targetSurface: OWN_BUBBLE_SURFACE,
      content: (
        <View style={flightStyles.textBox}>
          <Text style={flightStyles.text}>{text}</Text>
        </View>
      )
    }) !== null
  })
  measuredSynchronously = false
  return launched
}

const flightStyles = StyleSheet.create({
  textBox: {
    paddingHorizontal: StyleSheet.flatten(threadStyles.input).paddingHorizontal,
    paddingVertical: StyleSheet.flatten(threadStyles.input).paddingVertical
  },
  text: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textPrimary
  }
})
