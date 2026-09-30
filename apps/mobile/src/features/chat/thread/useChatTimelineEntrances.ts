import { useEffect, useMemo, useRef } from "react"
import { Easing, FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import type { ChatTimelineItem } from "../chatRoomInviteModel"
import {
  EMPTY_CHAT_TIMELINE_ENTRANCE_STATE,
  planChatTimelineEntrances,
  type ChatTimelineEntranceState
} from "./chatTimelineEntranceModel"

const CHAT_ROW_ENTER_DURATION_MS = 200
/** Points the bubble rises from; the stock FadeInDown travels 25. */
const CHAT_OWN_ROW_ENTER_RISE = 10

/**
 * My message rises a few points from the composer while it fades in; a
 * message that arrives only fades. Both run on the UI thread. Reduce Motion is
 * decided before a row mounts (no entering at all), so Reanimated's own
 * reduce-motion switch is pinned off to keep one source of truth.
 */
export const CHAT_OWN_ROW_ENTERING = FadeInDown.duration(CHAT_ROW_ENTER_DURATION_MS)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ transform: [{ translateY: CHAT_OWN_ROW_ENTER_RISE }] })
  .reduceMotion(ReduceMotion.Never)

export const CHAT_INCOMING_ROW_ENTERING = FadeIn.duration(CHAT_ROW_ENTER_DURATION_MS)
  .reduceMotion(ReduceMotion.Never)

const NO_ENTERING_KEYS: ReadonlySet<string> = new Set<string>()

interface CommittedEntranceState {
  entrance: ChatTimelineEntranceState
  hasPresentedList: boolean
}

/**
 * Keys of the timeline rows that should play the entrance on this render.
 *
 * The plan is made once per timeline (pure rules in chatTimelineEntranceModel)
 * and its bookkeeping is committed after render, so a discarded or repeated
 * render never marks a row as already shown. Until the list is on screen
 * nothing is planned; its first presentation absorbs the history silently.
 */
export function useChatTimelineEntrances({
  timeline,
  isListPresented
}: {
  timeline: readonly ChatTimelineItem[]
  isListPresented: boolean
}): ReadonlySet<string> {
  const reduceMotion = useReducedMotion()
  const committedRef = useRef<CommittedEntranceState>({
    entrance: EMPTY_CHAT_TIMELINE_ENTRANCE_STATE,
    hasPresentedList: false
  })
  const plan = useMemo(() => {
    if (!isListPresented) return null
    const committed = committedRef.current
    return planChatTimelineEntrances({
      ...committed.entrance,
      nextItems: timeline,
      isInitialLoad: !committed.hasPresentedList,
      reduceMotion
    })
  }, [isListPresented, reduceMotion, timeline])
  useEffect(() => {
    if (!plan) return
    committedRef.current = { entrance: plan.state, hasPresentedList: true }
  }, [plan])
  return plan?.enteringKeys ?? NO_ENTERING_KEYS
}
