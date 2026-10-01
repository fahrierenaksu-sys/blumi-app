import type { ChatMessageDeliveryState } from "../chatReceiptModel"

export interface ChatDeliveryTickVisual {
  icon: "time-outline" | "checkmark" | "checkmark-done"
  /** A `uiTheme.colors` token: no literal colours in the timeline. */
  colorToken: "textMuted" | "primaryDeep"
}

/** The tick crossfade; Reduce Motion skips it (see ChatDeliveryTicks). */
export const CHAT_TICK_ADVANCE_DURATION_MS = 160

/**
 * One icon per state of my message: a clock while sending, ✓ sent, ✓✓
 * delivered (muted) and ✓✓ read in the brand colour. `primaryDeep` rather
 * than `primary`: on the pink outgoing bubble (#F6E7EB) `primary` reaches
 * about 2.5:1, `primaryDeep` about 3.9:1, above the 3:1 WCAG minimum for
 * meaningful icons. The read state is also spoken (chatBubbleAccessibility),
 * so colour is never its only signal. A failed message shows its retry row.
 */
export function getChatDeliveryTickVisual(state: ChatMessageDeliveryState): ChatDeliveryTickVisual | null {
  switch (state) {
    case "sending": return { icon: "time-outline", colorToken: "textMuted" }
    case "sent": return { icon: "checkmark", colorToken: "textMuted" }
    case "delivered": return { icon: "checkmark-done", colorToken: "textMuted" }
    case "read": return { icon: "checkmark-done", colorToken: "primaryDeep" }
    default: return null
  }
}
