import { useCallback, useEffect } from "react"
import type { FetchThreadMessagesOptions } from "../chatApi"

/**
 * Keeps the open conversation in sync: requests history on entry, marks it
 * read (read receipts), and flags it active for unread tracking. Effects run
 * in that order.
 */
export function useChatThreadSync({
  resolvedThreadId,
  requestMessages,
  markThreadRead,
  setActiveThread
}: {
  resolvedThreadId: string | undefined
  requestMessages:
    | ((threadId: string, options?: FetchThreadMessagesOptions) => Promise<void>)
    | undefined
  markThreadRead: ((threadId: string) => void) | undefined
  setActiveThread: (threadId: string | null) => void
}) {
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
    if (markThreadRead && resolvedThreadId) {
      markThreadRead(resolvedThreadId)
    }
  }, [markThreadRead, resolvedThreadId])

  // Mark thread as active for unread tracking
  useEffect(() => {
    if (resolvedThreadId) {
      setActiveThread(resolvedThreadId)
    }
    return () => setActiveThread(null)
  }, [resolvedThreadId, setActiveThread])

  return { handleRetryMessages }
}
