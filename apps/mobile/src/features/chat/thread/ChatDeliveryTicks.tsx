import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import { uiTheme } from "../../../ui/theme"
import type { ChatMessageDeliveryState } from "../chatReceiptModel"
import { CHAT_TICK_ADVANCE_DURATION_MS, getChatDeliveryTickVisual } from "./chatDeliveryTickModel"

/**
 * Reduce Motion is decided from the shared store before the icon mounts, so
 * Reanimated's own reduce-motion switch is pinned off (one source of truth).
 */
const CHAT_TICK_ADVANCE_ENTERING = FadeIn.duration(CHAT_TICK_ADVANCE_DURATION_MS)
  .reduceMotion(ReduceMotion.Never)

/**
 * The delivery state of my message. The bubble's accessibility label speaks
 * the state, so the icon itself is not a separate element. When the state
 * advances after the row mounted (✓ → ✓✓ → read) the new icon fades in on the
 * UI thread; history rows and Reduce Motion show it at once.
 */
export function ChatDeliveryTicks({ state }: { state: ChatMessageDeliveryState }) {
  const reduceMotion = useReducedMotion()
  const [mountedState] = useState(state)
  const visual = getChatDeliveryTickVisual(state)
  if (!visual) return null
  const animate = !reduceMotion && state !== mountedState
  return (
    <Animated.View
      key={state}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      entering={animate ? CHAT_TICK_ADVANCE_ENTERING : undefined}
    >
      <Ionicons name={visual.icon} size={14} color={uiTheme.colors[visual.colorToken]} />
    </Animated.View>
  )
}
