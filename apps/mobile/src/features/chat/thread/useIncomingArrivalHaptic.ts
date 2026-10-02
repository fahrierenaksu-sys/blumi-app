import { useEffect, useEffectEvent } from "react"
import { TextInput } from "react-native"
import { hapticSoft } from "../../../ui/haptics"
import { getChatTimelineItemKey, type ChatTimelineItem } from "../chatRoomInviteModel"
import { shouldTapForIncomingArrival } from "./chatArrivalHaptic"

/**
 * Plays the soft tap once per update that brings the partner's message into
 * the open conversation while the composer is not focused (chatArrivalHaptic).
 * `arrivedKeys` changes once per timeline update, so a re-render never taps
 * again.
 */
export function useIncomingArrivalHaptic(input: {
  timeline: readonly ChatTimelineItem[]
  arrivedKeys: ReadonlySet<string>
  currentUserId: string
  screenFocused: boolean
}): void {
  const { arrivedKeys } = input
  const tapIfReading = useEffectEvent((keys: ReadonlySet<string>) => {
    const arrivedItems = input.timeline.filter((item) => keys.has(getChatTimelineItemKey(item)))
    if (shouldTapForIncomingArrival({
      arrivedItems,
      currentUserId: input.currentUserId,
      composerFocused: TextInput.State.currentlyFocusedInput() != null,
      screenFocused: input.screenFocused
    })) {
      hapticSoft()
    }
  })
  useEffect(() => {
    if (arrivedKeys.size > 0) tapIfReading(arrivedKeys)
  }, [arrivedKeys])
}
