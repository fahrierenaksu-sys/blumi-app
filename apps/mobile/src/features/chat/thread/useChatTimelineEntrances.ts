import { useEffect, useMemo, useRef } from "react"
import { useReducedMotion } from "../../../ui/animations"
import type { ChatTimelineItem } from "../chatRoomInviteModel"
import {
  EMPTY_CHAT_TIMELINE_ENTRANCE_STATE,
  planChatTimelineEntrances,
  type ChatTimelineEntranceState
} from "./chatTimelineEntranceModel"

const NO_ENTERING_KEYS: ReadonlySet<string> = new Set<string>()

interface CommittedEntranceState {
  entrance: ChatTimelineEntranceState
  hasPresentedList: boolean
}

export interface ChatTimelineEntrances {
  /** Rows that play the entrance animation on this render (none under Reduce Motion). */
  enteringKeys: ReadonlySet<string>
  /**
   * Rows that just arrived at the newest edge, whatever the motion setting:
   * a partner's arrival still taps softly (useIncomingArrivalHaptic).
   */
  arrivedKeys: ReadonlySet<string>
}

const NO_ENTRANCES: ChatTimelineEntrances = { enteringKeys: NO_ENTERING_KEYS, arrivedKeys: NO_ENTERING_KEYS }

/**
 * The timeline rows that arrive (and enter) on this render.
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
}): ChatTimelineEntrances {
  const reduceMotion = useReducedMotion()
  const committedRef = useRef<CommittedEntranceState>({
    entrance: EMPTY_CHAT_TIMELINE_ENTRANCE_STATE,
    hasPresentedList: false
  })
  const plan = useMemo(() => {
    if (!isListPresented) return null
    const committed = committedRef.current
    // Planned with motion so arrivals are known; Reduce Motion only drops the animation.
    return planChatTimelineEntrances({
      ...committed.entrance,
      nextItems: timeline,
      isInitialLoad: !committed.hasPresentedList,
      reduceMotion: false
    })
  }, [isListPresented, timeline])
  useEffect(() => {
    if (!plan) return
    committedRef.current = { entrance: plan.state, hasPresentedList: true }
  }, [plan])
  return useMemo(() => plan
    ? { enteringKeys: reduceMotion ? NO_ENTERING_KEYS : plan.enteringKeys, arrivedKeys: plan.enteringKeys }
    : NO_ENTRANCES, [plan, reduceMotion])
}
