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
import { requestAccountReauthTarget } from "./accountReauthPhone"
import { isReauthSignInRequiredError, reauthSignInAlertArgs } from "./reauthSignInRequired"
import { pendingPhoneChange } from "./pendingPhoneChange"
import type { SettingsCopy } from "./settingsCopy"
import { sanitizeVerificationCode } from "./settingsPresentationModel"
import { useSensitiveReauthHold } from "./useSensitiveReauthHold"

/**
 * Account deletion: prompt -> one-time code to the sign-in phone -> server
 * verification -> final destructive confirmation -> delete and reset session.
 */
export function useAccountDeletion(input: {
  sessionActor: SessionActor
  copy: SettingsCopy
  locale: AppLocale
  /** Returns a reset bound to the session the final request starts in. */
  bindSessionReset: () => () => Promise<void>
  /** Signs the user out so they can sign in again by SMS (a withheld phone). */
  onSignInAgain?: () => void
}) {
  const { bindSessionReset, copy, locale, onSignInAgain, sessionActor } = input
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deletionCode, setDeletionCode] = useState("")
  const [deletionCodeVisible, setDeletionCodeVisible] = useState(false)
  const deletionFirebaseConfirmationRef = useRef<FirebasePhoneConfirmation | null>(null)
  const deletionChallengeRef = useRef<string | null>(null)
  const reauthHold = useSensitiveReauthHold()

  const deleteAccount = useCallback(async (confirmationToken: string): Promise<void> => {
    if (isDeletingAccount) return
    setIsDeletingAccount(true)
    const resetDeletedSession = bindSessionReset()
    try {
      let deletionStatus: "deleted" | "pending_firebase_deletion" = "deleted"
      if (sessionActor.session.mode === "production") {
        deletionStatus = await deleteProductionAccount(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken,
          confirmationToken
        )
      }
      await resetDeletedSession()
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
  }, [bindSessionReset, copy, isDeletingAccount, locale, sessionActor])

  const requestDeletionCode = useCallback(async () => {
    if (isDeletingAccount || sessionActor.session.mode !== "production") {
      showToast({ title: copy.signInRequired, body: copy.signInBeforeDelete, type: "warning" })
      return
    }
    setIsDeletingAccount(true)
    try {
      reauthHold.hold()
      // The account's phone, not Firebase's: an interrupted phone change must
      // never block deletion.
      const { challenge, phoneNumber: accountPhoneNumber } = await requestAccountReauthTarget({
        userId: sessionActor.session.userId,
        pending: pendingPhoneChange,
        firebasePhone: getFirebaseCurrentPhoneNumber,
        requestChallenge: (knownPhone) => requestFirebaseAccountActionChallenge(
          MOBILE_HTTP_BASE_URL, sessionActor.session.sessionToken,
          { purpose: "account_deletion", ...(knownPhone ? { targetPhoneNumber: knownPhone } : {}) }
        )
      })
      deletionChallengeRef.current = challenge.challengeId
      deletionFirebaseConfirmationRef.current = await requestFirebasePhoneCode(accountPhoneNumber)
      setDeletionCode("")
      setDeletionCodeVisible(true)
    } catch (error) {
      if (isReauthSignInRequiredError(error)) {
        Alert.alert(...reauthSignInAlertArgs(locale, copy.cancel, onSignInAgain))
        return
      }
      showToast({
        title: copy.codeNotSent,
        body: getSettingsActionErrorMessageForDisplay("requestDeletionCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsDeletingAccount(false)
    }
  }, [copy, isDeletingAccount, locale, onSignInAgain, reauthHold, sessionActor])

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
      reauthHold.release()
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
  }, [copy, deleteAccount, deletionCode, isDeletingAccount, locale, reauthHold, sessionActor])

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
  const closeDeletionCode = useCallback(() => {
    reauthHold.release()
    setDeletionCodeVisible(false)
  }, [reauthHold])

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
