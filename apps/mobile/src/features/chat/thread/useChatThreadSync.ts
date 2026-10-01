import { useCallback, useEffect, useRef } from "react"
import { AppState } from "react-native"
import type { FetchThreadMessagesOptions } from "../chatApi"

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
  markThreadRead,
  setActiveThread
}: {
  resolvedThreadId: string | undefined
  currentUserId: string
  isFocused: boolean
  latestIncomingMessageId: string | undefined
  requestMessages:
    | ((threadId: string, options?: FetchThreadMessagesOptions) => Promise<void>)
    | undefined
  /** `upToMessageId` is the newest partner message on screen, if any. */
  markThreadRead: ((threadId: string, upToMessageId?: string) => void) | undefined
  setActiveThread: (threadId: string | null) => void
}) {
  const current = useRef({ currentUserId, isFocused, latestIncomingMessageId })
  current.current = { currentUserId, isFocused, latestIncomingMessageId }
  const readSync = useRef<{ visibility(visible: boolean): void; incoming(id: string | undefined): void } | null>(null)
  // Request messages from server when entering thread
  useEffect(() => {
    if (requestMessages && resolvedThreadId) {
      void requestMessages(resolvedThreadId).catch(() => undefined)
    }
  }, [requestMessages, resolvedThreadId])

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
      if (current.current.currentUserId === currentUserId) markThreadRead?.(resolvedThreadId, latestId)
    }
    const sync = {
      visibility(next: boolean) {
        if (visible === next) return
        if (!next) flush()
        visible = next
        setActiveThread(next ? resolvedThreadId : null)
        if (next) markThreadRead?.(resolvedThreadId, latestId)
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
