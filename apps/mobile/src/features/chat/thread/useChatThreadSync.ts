import { useCallback, useEffect, useRef } from "react"
import { AppState } from "react-native"
import type { FetchThreadMessagesOptions } from "../chatApi"

const runNow = (task: () => void): (() => void) => {
  task()
  return () => undefined
}

/**
 * Keeps the open conversation in sync: requests history on entry, marks it
 * read (read receipts), and flags it active for unread tracking. Effects run
 * in that order.
 */
export function useChatThreadSync({
  resolvedThreadId,
  currentUserId,
  isFocused,
  latestIncomingMessageId,
  requestMessages,
  refreshParticipants,
  markThreadRead,
  setActiveThread,
  historyReady = false,
  whenSettled = runNow
}: {
  /**
   * The store already holds this thread's history: the entry refresh can
   * wait for the push to settle. Unknown history is requested at once.
   */
  historyReady?: boolean
  /**
   * Defers background work until the push transition settles (see
   * useAfterPushTransition); defaults to running it at once.
   */
  whenSettled?: (task: () => void) => () => void
  resolvedThreadId: string | undefined
  currentUserId: string
  isFocused: boolean
  latestIncomingMessageId: string | undefined
  refreshParticipants?: () => Promise<void>
  requestMessages:
    | ((threadId: string, options?: FetchThreadMessagesOptions) => Promise<void>)
    | undefined
  /**
   * `upToMessageId` is the newest partner message on screen. A read is sent
   * only once one is shown: a read without a message would cover partner
   * messages that are still loading or not yet committed (false read).
   */
  markThreadRead: ((threadId: string, upToMessageId?: string) => void) | undefined
  setActiveThread: (threadId: string | null) => void
}) {
  const current = useRef({ currentUserId, isFocused, latestIncomingMessageId })
  current.current = { currentUserId, isFocused, latestIncomingMessageId }
  const readSync = useRef<{ visibility(visible: boolean): void; incoming(id: string | undefined): void } | null>(null)
  const historyReadyRef = useRef(historyReady)
  historyReadyRef.current = historyReady
  useEffect(() => {
    if (!isFocused || !resolvedThreadId || !refreshParticipants) return
    // The thread-list refresh re-renders the Inbox and this screen when it
    // lands: it waits for the push to settle (the header already shows the
    // cached partner).
    const cancel = whenSettled(() => { void refreshParticipants().catch(() => undefined) })
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") void refreshParticipants().catch(() => undefined)
    })
    return () => {
      cancel()
      subscription.remove()
    }
  }, [isFocused, refreshParticipants, resolvedThreadId, whenSettled])
  // Request messages from server when entering thread. Unknown history is
  // what the screen waits for, so it goes at once; a refresh of cached
  // history (and its invitation refresh) waits for the push to settle.
  useEffect(() => {
    if (!requestMessages || !resolvedThreadId) return
    const request = () => { void requestMessages(resolvedThreadId).catch(() => undefined) }
    if (!historyReadyRef.current) {
      request()
      return
    }
    return whenSettled(request)
  }, [requestMessages, resolvedThreadId, whenSettled])

  const handleRetryMessages = useCallback((): void => {
    if (!requestMessages || !resolvedThreadId) return
    void requestMessages(resolvedThreadId).catch(() => undefined)
  }, [resolvedThreadId, requestMessages])

  useEffect(() => {
    if (!resolvedThreadId) return
    let visible = false
    let latestId = current.current.latestIncomingMessageId
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      if (timer === undefined) return
      clearTimeout(timer)
      timer = undefined
      if (current.current.currentUserId === currentUserId && latestId) markThreadRead?.(resolvedThreadId, latestId)
    }
    const sync = {
      visibility(next: boolean) {
        if (visible === next) return
        if (!next) flush()
        visible = next
        setActiveThread(next ? resolvedThreadId : null)
        if (next && latestId) markThreadRead?.(resolvedThreadId, latestId)
      },
      incoming(id: string | undefined) {
        if (id === latestId) return
        latestId = id
        if (!visible || !id) return
        clearTimeout(timer)
        timer = setTimeout(flush, 500)
      }
    }
    readSync.current = sync
    sync.visibility(current.current.isFocused && AppState.currentState === "active")
    const subscription = AppState.addEventListener("change", (state) => {
      sync.visibility(current.current.isFocused && state === "active")
    })
    return () => {
      flush()
      readSync.current = null
      setActiveThread(null)
      subscription.remove()
    }
  }, [currentUserId, markThreadRead, resolvedThreadId, setActiveThread])

  useEffect(() => {
    readSync.current?.visibility(isFocused && AppState.currentState === "active")
  }, [isFocused])
  useEffect(() => {
    readSync.current?.incoming(latestIncomingMessageId)
  }, [latestIncomingMessageId])

  return { handleRetryMessages }
}
