import type { ChatThreadCopy } from "./chatThreadCopy"
import type { ChatMessageDeliveryState } from "./chatThreadModel"

export interface ChatBubbleAccessibilityInput {
  body: string
  /** Already formatted (`formatMessageTime`); empty when the date is invalid. */
  time: string
  isMe: boolean
  deliveryState: ChatMessageDeliveryState
  partnerName: string
  copy: ChatThreadCopy
}

function getDeliveryStateLabel(
  deliveryState: ChatMessageDeliveryState,
  copy: ChatThreadCopy
): string {
  switch (deliveryState) {
    case "sending": return copy.bubbleStatusSending
    case "failed": return copy.bubbleStatusFailed
    case "delivered": return copy.bubbleStatusDelivered
    case "read": return copy.bubbleStatusRead
    default: return copy.bubbleStatusSent
  }
}

/**
 * One spoken phrase for a text bubble, so VoiceOver/TalkBack read the sender,
 * the words, the time and (for my messages) the delivery state as one element
 * instead of four fragments. The retry action stays a separate button.
 */
export function getChatBubbleAccessibilityLabel(
  input: ChatBubbleAccessibilityInput
): string {
  const partnerName = input.partnerName.trim() || input.copy.unknownPartner
  const parts = [
    input.isMe ? input.copy.bubbleSelf : partnerName,
    input.body,
    input.time,
    input.isMe ? getDeliveryStateLabel(input.deliveryState, input.copy) : ""
  ]
  return parts.filter((part) => part.length > 0).join(", ")
}
