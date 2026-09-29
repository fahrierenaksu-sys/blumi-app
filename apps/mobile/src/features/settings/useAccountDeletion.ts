import { useCallback, useRef, useState } from "react"
import { Alert } from "react-native"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import type { AppLocale } from "../session/appLocale"
import {
  confirmFirebasePhoneCode,
  getFirebaseCurrentPhoneNumber,
  requestFirebasePhoneCode,
  type FirebasePhoneConfirmation
} from "../session/firebasePhoneAuth"
import {
  deleteProductionAccount,
  requestFirebaseAccountActionChallenge,
  verifyFirebaseAccountAction
} from "../session/sessionApi"
import type { SessionActor } from "../session/sessionModel"
import {
  getSettingsActionErrorMessageForDisplay,
  getSettingsVerificationErrorToastForDisplay
} from "../session/settingsActionErrorCopy"
import type { SettingsCopy } from "./settingsCopy"
import { sanitizeVerificationCode } from "./settingsPresentationModel"

/**
 * Account deletion: prompt -> one-time code to the sign-in phone -> server
 * verification -> final destructive confirmation -> delete and reset session.
 */
export function useAccountDeletion(input: {
  sessionActor: SessionActor
  copy: SettingsCopy
  locale: AppLocale
  onResetSession: () => Promise<void>
}) {
  const { copy, locale, onResetSession, sessionActor } = input
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deletionCode, setDeletionCode] = useState("")
  const [deletionCodeVisible, setDeletionCodeVisible] = useState(false)
  const deletionFirebaseConfirmationRef = useRef<FirebasePhoneConfirmation | null>(null)
  const deletionChallengeRef = useRef<string | null>(null)

  const deleteAccount = useCallback(async (confirmationToken: string): Promise<void> => {
    if (isDeletingAccount) return
    setIsDeletingAccount(true)
    try {
      let deletionStatus: "deleted" | "pending_firebase_deletion" = "deleted"
      if (sessionActor.session.mode === "production") {
        deletionStatus = await deleteProductionAccount(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken,
          confirmationToken
        )
      }
      await onResetSession()
      showToast({
        title: deletionStatus === "deleted" ? copy.deletedTitle : copy.deletionPendingTitle,
        body: deletionStatus === "deleted" ? copy.deletedBody : copy.deletionPendingBody,
        type: deletionStatus === "deleted" ? "success" : "warning"
      })
    } catch (error) {
      showToast({
        title: "Account not deleted",
        body: getSettingsActionErrorMessageForDisplay("deleteAccount", error, locale),
        type: "warning"
      })
    } finally {
      setIsDeletingAccount(false)
    }
  }, [copy, isDeletingAccount, locale, onResetSession, sessionActor])

  const requestDeletionCode = useCallback(async () => {
    if (isDeletingAccount || sessionActor.session.mode !== "production") {
      showToast({ title: copy.signInRequired, body: copy.signInBeforeDelete, type: "warning" })
      return
    }
    setIsDeletingAccount(true)
    try {
      const currentPhoneNumber = getFirebaseCurrentPhoneNumber()
      if (!currentPhoneNumber) throw new Error("Sign in again to verify your phone.")
      deletionChallengeRef.current = (await requestFirebaseAccountActionChallenge(
        MOBILE_HTTP_BASE_URL, sessionActor.session.sessionToken, { purpose: "account_deletion" }
      )).challengeId
      deletionFirebaseConfirmationRef.current = await requestFirebasePhoneCode(currentPhoneNumber)
      setDeletionCode("")
      setDeletionCodeVisible(true)
    } catch (error) {
      showToast({
        title: copy.codeNotSent,
        body: getSettingsActionErrorMessageForDisplay("requestDeletionCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsDeletingAccount(false)
    }
  }, [copy, isDeletingAccount, locale, sessionActor])

  const verifyDeletionCode = useCallback(async () => {
    if (isDeletingAccount || sessionActor.session.mode !== "production") return
    setIsDeletingAccount(true)
    try {
      const firebaseConfirmation = deletionFirebaseConfirmationRef.current
      const challengeId = deletionChallengeRef.current
      if (!firebaseConfirmation || !challengeId) throw new Error("Request a verification code first.")
      const idToken = await confirmFirebasePhoneCode(firebaseConfirmation, deletionCode)
      const confirmation = await verifyFirebaseAccountAction(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        { idToken, challengeId, purpose: "account_deletion" }
      )
      deletionFirebaseConfirmationRef.current = null
      deletionChallengeRef.current = null
      setDeletionCodeVisible(false)
      Alert.alert(
        copy.deletePermanentlyTitle,
        copy.deletePermanentlyBody,
        [
          { text: copy.cancel, style: "cancel" },
          { text: copy.deletePermanently, style: "destructive", onPress: () => void deleteAccount(confirmation.confirmationToken) }
        ]
      )
    } catch (error) {
      showToast({
        ...getSettingsVerificationErrorToastForDisplay("verifyDeletionCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsDeletingAccount(false)
    }
  }, [copy, deleteAccount, deletionCode, isDeletingAccount, locale, sessionActor])

  const handleDeleteAccountPrompt = useCallback(() => {
    Alert.alert(
      copy.deleteAccount,
      copy.deleteAccountPromptBody,
      [
        { text: copy.cancel, style: "cancel" },
        {
          text: isDeletingAccount ? copy.sending : copy.sendDeletionCode,
          style: "destructive",
          onPress: () => {
            void requestDeletionCode()
          }
        }
      ]
    )
  }, [copy, isDeletingAccount, requestDeletionCode])

  const changeDeletionCode = useCallback((value: string) => {
    setDeletionCode(sanitizeVerificationCode(value))
  }, [])
  const closeDeletionCode = useCallback(() => setDeletionCodeVisible(false), [])

  return {
    isDeletingAccount,
    deletionCode,
    deletionCodeVisible,
    changeDeletionCode,
    closeDeletionCode,
    verifyDeletionCode,
    handleDeleteAccountPrompt
  }
}
