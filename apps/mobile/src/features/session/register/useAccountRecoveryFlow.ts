import { useRef, useState } from "react"
import { MOBILE_HTTP_BASE_URL } from "../../../config/env"
import { validateAccountRecoveryPhones } from "../accountRecoveryModel"
import {
  getAccountRecoveryErrorMessageForDisplay,
  type AccountRecoveryLocale
} from "../accountRecoveryCopy"
import {
  confirmFirebasePhoneCode,
  requestFirebasePhoneCode,
  type FirebasePhoneConfirmation
} from "../firebasePhoneAuth"
import { submitAccountRecoveryRequest } from "../sessionApi"
import type { AccountRecoveryStage } from "./registerScreenModel"

/**
 * Sign-in account recovery: request a Firebase code for the new number, then
 * confirm it and submit the old/new number pair for review.
 */
export function useAccountRecoveryFlow(locale: AccountRecoveryLocale) {
  const [recoveryVisible, setRecoveryVisible] = useState(false)
  const [recoveryStage, setRecoveryStage] = useState<AccountRecoveryStage>("details")
  const [recoveryOldPhone, setRecoveryOldPhone] = useState("")
  const [recoveryNewPhone, setRecoveryNewPhone] = useState("")
  const [recoveryCode, setRecoveryCode] = useState("")
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const recoveryFirebaseConfirmationRef = useRef<FirebasePhoneConfirmation | null>(null)

  const requestRecoveryCode = async (): Promise<void> => {
    if (recoveryBusy) return
    const validation = validateAccountRecoveryPhones(
      recoveryOldPhone,
      recoveryNewPhone
    )
    if (validation.errorMessage) {
      setRecoveryError(validation.errorMessage)
      return
    }
    setRecoveryBusy(true)
    setRecoveryError(null)
    try {
      recoveryFirebaseConfirmationRef.current = await requestFirebasePhoneCode(
        validation.normalizedNewPhoneNumber
      )
      setRecoveryOldPhone(validation.normalizedOldPhoneNumber)
      setRecoveryNewPhone(validation.normalizedNewPhoneNumber)
      setRecoveryStage("code")
      setRecoveryCode("")
    } catch (error) {
      setRecoveryError(
        getAccountRecoveryErrorMessageForDisplay("requestCode", error, locale)
      )
    } finally { setRecoveryBusy(false) }
  }

  const submitRecovery = async (): Promise<void> => {
    if (recoveryBusy) return
    const validation = validateAccountRecoveryPhones(
      recoveryOldPhone,
      recoveryNewPhone
    )
    if (validation.errorMessage) {
      setRecoveryError(validation.errorMessage)
      return
    }
    setRecoveryBusy(true)
    setRecoveryError(null)
    try {
      const confirmation = recoveryFirebaseConfirmationRef.current
      if (!confirmation) throw new Error("Request a verification code first.")
      const idToken = await confirmFirebasePhoneCode(confirmation, recoveryCode)
      await submitAccountRecoveryRequest(MOBILE_HTTP_BASE_URL, {
        oldPhoneNumber: validation.normalizedOldPhoneNumber,
        newPhoneNumber: validation.normalizedNewPhoneNumber,
        idToken
      })
      recoveryFirebaseConfirmationRef.current = null
      setRecoveryVisible(false)
      setRecoveryStage("details")
      setRecoveryOldPhone("")
      setRecoveryNewPhone("")
      setRecoveryCode("")
    } catch (error) {
      setRecoveryError(
        getAccountRecoveryErrorMessageForDisplay("submitReview", error, locale)
      )
    } finally { setRecoveryBusy(false) }
  }

  const closeRecovery = (): void => {
    if (recoveryBusy) return
    setRecoveryVisible(false)
    setRecoveryStage("details")
    setRecoveryOldPhone("")
    setRecoveryNewPhone("")
    setRecoveryCode("")
    recoveryFirebaseConfirmationRef.current = null
    setRecoveryError(null)
  }

  const openRecovery = (): void => { setRecoveryVisible(true); setRecoveryError(null) }

  return {
    recoveryVisible,
    recoveryStage,
    recoveryOldPhone,
    recoveryNewPhone,
    recoveryCode,
    recoveryBusy,
    recoveryError,
    setRecoveryOldPhone,
    setRecoveryNewPhone,
    setRecoveryCode,
    requestRecoveryCode,
    submitRecovery,
    closeRecovery,
    openRecovery
  }
}

export type AccountRecoveryFlow = ReturnType<typeof useAccountRecoveryFlow>
