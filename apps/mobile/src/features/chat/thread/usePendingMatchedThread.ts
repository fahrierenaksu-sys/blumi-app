import type { ChatThread } from "@blumi/contracts"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../../config/env"
import type { SessionMode } from "../../session/sessionModel"
import { createThread } from "../chatApi"
import { createMatchedChatOpener } from "../matchChatOpening"
import type { ChatThreadLifecycleRefs } from "./useChatThreadLifecycle"

/**
 * Creates the persisted thread for a fresh match (production only): one
 * automatic attempt per user/partner pair, then a manual retry. Requests for
 * the same pair never overlap, and results for an unmounted screen or a
 * different signed-in user are dropped.
 */
export function usePendingMatchedThread({
  currentUserId,
  pendingPartnerId,
  isPendingThread,
  sessionMode,
  sessionToken,
  onThreadCreated,
  screenMountedRef,
  activeUserIdRef
}: {
  currentUserId: string
  pendingPartnerId: string | undefined
  isPendingThread: boolean
  sessionMode: SessionMode
  sessionToken: string
  onThreadCreated: (thread: ChatThread) => void
} & ChatThreadLifecycleRefs) {
  const [isCreatingPendingThread, setIsCreatingPendingThread] = useState(false)
  const [pendingThreadCreationFailed, setPendingThreadCreationFailed] = useState(false)
  const pendingThreadRequestRef = useRef<{ key: string; inFlight: boolean }>({
    key: "",
    inFlight: false
  })
  const automaticAttemptKeyRef = useRef("")

  const matchedThreadOpener = useMemo(() => {
    if (!pendingPartnerId || sessionMode !== "production") return null
    return createMatchedChatOpener({
      createThread: () => createThread(
        MOBILE_HTTP_BASE_URL,
        sessionToken,
        { participantUserIds: [currentUserId, pendingPartnerId] }
      ),
      onThreadReady: (createdThread) => {
        if (
          !createdThread.participantUserIds.includes(currentUserId) ||
          !createdThread.participantUserIds.includes(pendingPartnerId)
        ) {
          throw new Error("That conversation is not available.")
        }
        if (
          screenMountedRef.current &&
          activeUserIdRef.current === currentUserId
        ) {
          onThreadCreated(createdThread)
        }
      }
    })
  }, [
    activeUserIdRef,
    currentUserId,
    onThreadCreated,
    pendingPartnerId,
    screenMountedRef,
    sessionMode,
    sessionToken
  ])

  const openPendingMatchedThread = useCallback(async (): Promise<void> => {
    if (!isPendingThread || !pendingPartnerId || !matchedThreadOpener) return
    const requestKey = `${currentUserId}:${pendingPartnerId}`
    if (
      pendingThreadRequestRef.current.key === requestKey &&
      pendingThreadRequestRef.current.inFlight
    ) return
    pendingThreadRequestRef.current = { key: requestKey, inFlight: true }
    if (screenMountedRef.current) {
      setPendingThreadCreationFailed(false)
      setIsCreatingPendingThread(true)
    }
    try {
      const result = await matchedThreadOpener()
      if (screenMountedRef.current && activeUserIdRef.current === currentUserId) {
        setPendingThreadCreationFailed(result.status === "failed")
      }
    } finally {
      if (pendingThreadRequestRef.current.key === requestKey) {
        pendingThreadRequestRef.current = { key: requestKey, inFlight: false }
      }
      if (screenMountedRef.current && activeUserIdRef.current === currentUserId) {
        setIsCreatingPendingThread(false)
      }
    }
  }, [
    activeUserIdRef,
    currentUserId,
    isPendingThread,
    matchedThreadOpener,
    pendingPartnerId,
    screenMountedRef
  ])

  useEffect(() => {
    if (!isPendingThread || sessionMode !== "production" || !pendingPartnerId) return
    const requestKey = `${currentUserId}:${pendingPartnerId}`
    if (automaticAttemptKeyRef.current === requestKey) return
    automaticAttemptKeyRef.current = requestKey
    void openPendingMatchedThread()
  }, [
    currentUserId,
    isPendingThread,
    openPendingMatchedThread,
    pendingPartnerId,
    sessionMode
  ])

  return { isCreatingPendingThread, pendingThreadCreationFailed, openPendingMatchedThread }
}
