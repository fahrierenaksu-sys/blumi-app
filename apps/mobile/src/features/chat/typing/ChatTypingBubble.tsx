import { useLayoutEffect, useRef } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import { TypingDots } from "../../../ui/typingDots"
import { uiTheme } from "../../../ui/theme"
import { getChatTypingCopy } from "./chatTypingCopy"
import { usePartnerTyping } from "./usePartnerTyping"
import { typingMorphSources } from "./typingMorphSource"
import { getChatSendFlightChannel } from "../thread/chatSendFlight"

/** Reduce Motion is decided from the shared store; Reanimated's own switch stays off. */
const TYPING_ENTERING = FadeIn.duration(160).reduceMotion(ReduceMotion.Never)
const TYPING_EXITING = FadeOut.duration(120).reduceMotion(ReduceMotion.Never)

/**
 * The partner's "typing…" bubble at the foot of the conversation, styled as
 * an incoming bubble. Driven only by the server's `chat.typing_updated`
 * (chatTypingStore); renders nothing otherwise. Spoken once per session.
 * While it shows, the partner's next message can grow out of it
 * (typingMorphFlight).
 */
export function ChatTypingBubble({ threadId, partnerUserId, partnerName, locale }: {
  threadId: string | undefined
  partnerUserId: string | undefined
  partnerName: string
  locale: string
}) {
  const copy = getChatTypingCopy(locale)
  const label = copy.partnerTyping(partnerName)
  const typing = usePartnerTyping(threadId, partnerUserId, label)
  const reduceMotion = useReducedMotion()
  const bubbleRef = useRef<View>(null)
  const conversationKey = getChatSendFlightChannel(threadId)
  useLayoutEffect(() => {
    if (!typing) return
    return typingMorphSources.attach(conversationKey, () => {
      // Fabric measures synchronously; anything else simply skips the morph.
      let frame: { x: number; y: number; width: number; height: number } | null = null
      bubbleRef.current?.measureInWindow((x, y, width, height) => {
        frame = { x, y, width, height }
      })
      return frame
    })
  }, [conversationKey, typing])
  if (!typing) return null
  return (
    <Animated.View
      accessible
      accessibilityLabel={label}
      entering={reduceMotion ? undefined : TYPING_ENTERING}
      exiting={reduceMotion ? undefined : TYPING_EXITING}
      style={styles.row}
    >
      <View ref={bubbleRef} collapsable={false} style={styles.bubble}>
        <TypingDots size={6} color={uiTheme.colors.primary} />
      </View>
      <Text style={styles.caption} numberOfLines={1} maxFontSizeMultiplier={1.6}>
        {copy.typing}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.xs,
    paddingHorizontal: 4,
    paddingBottom: uiTheme.spacing.xs
  },
  bubble: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 17,
    borderBottomLeftRadius: 5,
    borderCurve: "continuous",
    borderWidth: 1,
    backgroundColor: "#FFFDFC",
    borderColor: "#EEE5E8"
  },
  caption: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textMuted
  }
})
