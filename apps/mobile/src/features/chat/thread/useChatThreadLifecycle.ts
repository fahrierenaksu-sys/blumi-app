import { useEffect, useRef, type MutableRefObject } from "react"

export interface ChatThreadLifecycleRefs {
  /** False after the screen unmounts; async work must not touch state then. */
  screenMountedRef: MutableRefObject<boolean>
  /** The signed-in user of the latest render, to drop results for another account. */
  activeUserIdRef: MutableRefObject<string>
}

/**
 * Guards shared by the matched-chat opener and room invite flows. Call it
 * first so its mount effect runs before every other thread effect.
 */
export function useChatThreadLifecycle(currentUserId: string): ChatThreadLifecycleRefs {
  const screenMountedRef = useRef(true)
  const activeUserIdRef = useRef(currentUserId)
  activeUserIdRef.current = currentUserId

  useEffect(() => {
    screenMountedRef.current = true
    return () => { screenMountedRef.current = false }
  }, [])

  return { screenMountedRef, activeUserIdRef }
}
