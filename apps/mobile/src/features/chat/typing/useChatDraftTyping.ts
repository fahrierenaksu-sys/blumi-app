import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { AppState } from "react-native"
import {
  IDLE_TYPING_SENDER,
  planDraftChange,
  planDraftEnd,
  type ChatTypingPlan,
  type ChatTypingSenderState
} from "./chatTypingModel"
import { chatTypingStore } from "./chatTypingStore"

// Incoming typing entries never affect the composer's sender scope. Keep
// owner changes observable even when both accounts have typing enabled.
let senderSnapshot: { ownerUserId: string | undefined; sendEnabled: boolean } = { ownerUserId: undefined, sendEnabled: false }
const readSenderSnapshot = () => {
  const { ownerUserId, sendEnabled } = chatTypingStore.getSnapshot()
  if (senderSnapshot.ownerUserId !== ownerUserId || senderSnapshot.sendEnabled !== sendEnabled) senderSnapshot = { ownerUserId, sendEnabled }
  return senderSnapshot
}

/** Composer callbacks; stable for the lifetime of the screen. */
export interface ChatDraftTyping {
  /** The user edited the draft (never called for programmatic changes). */
  noteDraft(text: string): void
  /** Sent, blurred or otherwise done with the draft for now. */
  endDraft(): void
}

/**
 * Emits `chat.typing` for one conversation's composer while `chat_typing` is
 * on: start at most every 3 s while the draft changes, stop on send, clear,
 * blur, focus loss, app background, conversation change and unmount.
 */
export function useChatDraftTyping(threadId: string | undefined, active: boolean): ChatDraftTyping {
  const { ownerUserId, sendEnabled } = useSyncExternalStore(chatTypingStore.subscribe, readSenderSnapshot, readSenderSnapshot)
  const stateRef = useRef<ChatTypingSenderState>(IDLE_TYPING_SENDER)
  const ownerRef = useRef(ownerUserId)
  if (ownerRef.current !== ownerUserId) {
    ownerRef.current = ownerUserId
    stateRef.current = IDLE_TYPING_SENDER
  }
  const inputRef = useRef({ threadId, live: active && sendEnabled })
  inputRef.current = { threadId, live: active && sendEnabled }

  const typing = useMemo<ChatDraftTyping>(() => {
    const commit = (plan: ChatTypingPlan): void => {
      if (plan.send && !chatTypingStore.send(plan.send)) {
        // Not sent (offline or switched off): a stop needs no retry, a start
        // retries on the next keystroke.
        if (plan.send.state === "start") return
      }
      stateRef.current = plan.next
    }
    return {
      noteDraft(text) {
        const { threadId: current, live } = inputRef.current
        if (!current || !live) return
        commit(planDraftChange(stateRef.current, { threadId: current, text, now: Date.now() }))
      },
      endDraft() {
        commit(planDraftEnd(stateRef.current, Date.now()))
      }
    }
  }, [])

  const live = active && sendEnabled
  useEffect(() => {
    if (!live) return undefined
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") typing.endDraft()
    })
    return () => {
      subscription.remove()
      typing.endDraft()
    }
  }, [live, ownerUserId, threadId, typing])

  return typing
}
