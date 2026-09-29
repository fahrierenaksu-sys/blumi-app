import { useCallback, useEffect, useRef, useState } from "react"
import { Alert } from "react-native"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import { shareAccountDataExportFile } from "../session/accountDataExport"
import type { AppLocale } from "../session/appLocale"
import {
  confirmFirebasePhoneCode,
  getFirebaseCurrentPhoneNumber,
  requestFirebasePhoneCode,
  type FirebasePhoneConfirmation
} from "../session/firebasePhoneAuth"
import {
  downloadAccountDataExport,
  requestFirebaseAccountActionChallenge,
  verifyFirebaseAccountAction
} from "../session/sessionApi"
import type { SessionActor } from "../session/sessionModel"
import { getSettingsActionErrorMessageForDisplay } from "../session/settingsActionErrorCopy"
import type { SettingsCopy } from "./settingsCopy"
import { sanitizeVerificationCode } from "./settingsPresentationModel"

/**
 * Account data export: prompt -> one-time code -> server verification ->
 * download and share. An in-flight export is aborted when the session user
 * changes or the screen unmounts.
 */
export function useAccountDataExport(input: {
  sessionActor: SessionActor
  copy: SettingsCopy
  locale: AppLocale
}) {
  const { copy, locale, sessionActor } = input
  const [isExportingAccountData, setIsExportingAccountData] = useState(false)
  const exportControllerRef = useRef<AbortController | null>(null)
  useEffect(() => () => { exportControllerRef.current?.abort() }, [sessionActor.session.userId])
  const [exportCode, setExportCode] = useState("")
  const [exportCodeVisible, setExportCodeVisible] = useState(false)
  const exportFirebaseConfirmationRef = useRef<FirebasePhoneConfirmation | null>(null)
  const exportChallengeRef = useRef<string | null>(null)

  const requestDataExport = useCallback(async () => {
    if (
      isExportingAccountData ||
      sessionActor.session.mode !== "production"
    ) {
      showToast({
        title: copy.signInRequired,
        body: copy.signInBeforeExport,
        type: "warning"
      })
      return
    }
    setIsExportingAccountData(true)
    try {
      const currentPhoneNumber = getFirebaseCurrentPhoneNumber()
      if (!currentPhoneNumber) throw new Error("Sign in again to verify your phone.")
      exportChallengeRef.current = (await requestFirebaseAccountActionChallenge(
        MOBILE_HTTP_BASE_URL, sessionActor.session.sessionToken, { purpose: "account_data_export" }
      )).challengeId
      exportFirebaseConfirmationRef.current = await requestFirebasePhoneCode(currentPhoneNumber)
      setExportCode("")
      setExportCodeVisible(true)
    } catch (error) {
      showToast({
        title: copy.codeNotSent,
        body: getSettingsActionErrorMessageForDisplay("requestDataExport", error, locale),
        type: "warning"
      })
    } finally {
      setIsExportingAccountData(false)
    }
  }, [copy, isExportingAccountData, locale, sessionActor])

  const verifyExportCode = useCallback(async () => {
    if (
      isExportingAccountData ||
      sessionActor.session.mode !== "production"
    ) {
      return
    }
    const controller = new AbortController()
    exportControllerRef.current?.abort()
    exportControllerRef.current = controller
    setIsExportingAccountData(true)
    try {
      const firebaseConfirmation = exportFirebaseConfirmationRef.current
      const challengeId = exportChallengeRef.current
      if (!firebaseConfirmation || !challengeId) throw new Error("Request a verification code first.")
      const idToken = await confirmFirebasePhoneCode(firebaseConfirmation, exportCode)
      const confirmation = await verifyFirebaseAccountAction(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        { idToken, challengeId, purpose: "account_data_export" },
        undefined,
        controller.signal
      )
      exportFirebaseConfirmationRef.current = null
      exportChallengeRef.current = null
      const exported = await downloadAccountDataExport(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        confirmation.confirmationToken,
        undefined,
        controller.signal
      )
      if (controller.signal.aborted) { await exported.dispose(); return }
      await shareAccountDataExportFile(exported)
      if (controller.signal.aborted) return
      setExportCodeVisible(false)
      setExportCode("")
    } catch (error) {
      if (controller.signal.aborted) return
      showToast({
        title: copy.exportTitle,
        body: getSettingsActionErrorMessageForDisplay("verifyDataExport", error, locale),
        type: "warning"
      })
    } finally {
      if (exportControllerRef.current === controller) exportControllerRef.current = null
      setIsExportingAccountData(false)
    }
  }, [copy, exportCode, isExportingAccountData, locale, sessionActor])

  const handleDataExportPrompt = useCallback(() => {
    Alert.alert(
      copy.downloadData,
      copy.dataExportPromptBody,
      [
        { text: copy.cancel, style: "cancel" },
        {
          text: isExportingAccountData ? copy.sending : copy.sendExportCode,
          onPress: () => {
            void requestDataExport()
          }
        }
      ]
    )
  }, [copy, isExportingAccountData, requestDataExport])

  const changeExportCode = useCallback((value: string) => {
    setExportCode(sanitizeVerificationCode(value))
  }, [])
  const closeExportCode = useCallback(() => setExportCodeVisible(false), [])

  return {
    isExportingAccountData,
    exportCode,
    exportCodeVisible,
    changeExportCode,
    closeExportCode,
    verifyExportCode,
    handleDataExportPrompt
  }
}
