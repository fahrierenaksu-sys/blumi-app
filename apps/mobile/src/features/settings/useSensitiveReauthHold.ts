import { useCallback, useEffect, useRef } from "react"
import { holdSensitiveReauth } from "../session/sensitiveReauthGate"

/**
 * One re-auth hold per settings flow: `hold` before a challenge is requested,
 * `release` once the code is verified or the flow ends. Unmount releases it.
 */
export function useSensitiveReauthHold() {
  const releaseRef = useRef<(() => void) | null>(null)
  const release = useCallback(() => {
    releaseRef.current?.()
    releaseRef.current = null
  }, [])
  const hold = useCallback(() => {
    releaseRef.current?.()
    releaseRef.current = holdSensitiveReauth()
  }, [])
  useEffect(() => release, [release])
  return { hold, release }
}
