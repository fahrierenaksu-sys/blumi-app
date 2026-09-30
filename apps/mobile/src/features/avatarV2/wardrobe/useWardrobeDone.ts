import { useCallback, useEffect, useState } from "react"
import { hapticError, hapticSuccess } from "../../../ui/haptics"
import { resolveWardrobeDoneDecision } from "./wardrobeDoneModel"

/**
 * "Done" waits for the in-flight save (and queued taps) to be confirmed, then
 * closes. A failed save keeps the screen open with the save error visible.
 */
export function useWardrobeDone(input: {
  isSaving: boolean
  hasPendingTryOn: boolean
  saveErrorMessage: string | null
  onClose: () => void
}) {
  const { isSaving, hasPendingTryOn, saveErrorMessage, onClose } = input
  const [isWaiting, setIsWaiting] = useState(false)
  const decision = resolveWardrobeDoneDecision({
    isSaving,
    hasPendingTryOn,
    saveErrorMessage
  })

  useEffect(() => {
    if (!isWaiting || decision === "wait") return
    setIsWaiting(false)
    if (decision === "close") {
      hapticSuccess()
      onClose()
      return
    }
    hapticError()
  }, [decision, isWaiting, onClose])

  const handleDone = useCallback((): void => {
    if (decision === "wait") {
      setIsWaiting(true)
      return
    }
    if (decision === "blocked") {
      hapticError()
      return
    }
    hapticSuccess()
    onClose()
  }, [decision, onClose])

  return { handleDone, isWaitingToClose: isWaiting }
}
