import { useCallback, useReducer, useRef, useState } from "react"
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
  analyzeLocalPhoneNumber,
  formatLocalPhoneNumber,
  type PhoneCountryCode
} from "../session/registerFlowModel"
import {
  confirmPhoneChange,
  requestFirebaseAccountActionChallenge,
  verifyFirebaseAccountAction
} from "../session/sessionApi"
import type { SessionActor } from "../session/sessionModel"
import {
  getSettingsActionErrorMessageForDisplay,
  getSettingsVerificationErrorToastForDisplay
} from "../session/settingsActionErrorCopy"
import type { SettingsCopy } from "./settingsCopy"
import {
  INITIAL_PHONE_CHANGE_FORM_STATE,
  isPhoneChangePrimaryDisabled,
  phoneChangeFormReducer
} from "./settingsPhoneChangeModel"

/**
 * Phone number change: verify the current phone, enter and verify a new
 * country-aware number, confirm on the server, then sign out.
 */
export function usePhoneChange(input: {
  sessionActor: SessionActor
  copy: SettingsCopy
  locale: AppLocale
  onResetSession: () => Promise<void>
}) {
  const { copy, locale, onResetSession, sessionActor } = input
  const [isChangingPhone, setIsChangingPhone] = useState(false)
  const [form, dispatch] = useReducer(phoneChangeFormReducer, INITIAL_PHONE_CHANGE_FORM_STATE)
  const {
    currentCode: currentPhoneCode,
    newCode: newPhoneCode,
    newCountry: newPhoneCountry,
    newNumber: newPhoneNumber,
    currentConfirmationToken: currentPhoneConfirmationToken
  } = form
  const currentPhoneFirebaseConfirmationRef = useRef<FirebasePhoneConfirmation | null>(null)
  const currentPhoneChallengeRef = useRef<string | null>(null)
  const newPhoneFirebaseConfirmationRef = useRef<FirebasePhoneConfirmation | null>(null)
  const newPhoneChallengeRef = useRef<string | null>(null)
  const newPhoneAnalysis = analyzeLocalPhoneNumber(newPhoneNumber, newPhoneCountry)

  const resetPhoneChangeFlow = useCallback(() => {
    dispatch({ type: "reset" })
    currentPhoneFirebaseConfirmationRef.current = null
    currentPhoneChallengeRef.current = null
    newPhoneFirebaseConfirmationRef.current = null
    newPhoneChallengeRef.current = null
  }, [])

  const requestPhoneChangeCurrentCode = useCallback(async () => {
    if (isChangingPhone || sessionActor.session.mode !== "production") {
      showToast({
        title: copy.signInRequired,
        body: copy.signInBeforePhone,
        type: "warning"
      })
      return
    }
    setIsChangingPhone(true)
    try {
      const currentPhoneNumber = getFirebaseCurrentPhoneNumber()
      if (!currentPhoneNumber) throw new Error("Sign in again to verify your phone.")
      currentPhoneChallengeRef.current = (await requestFirebaseAccountActionChallenge(
        MOBILE_HTTP_BASE_URL, sessionActor.session.sessionToken, { purpose: "phone_change_current" }
      )).challengeId
      currentPhoneFirebaseConfirmationRef.current = await requestFirebasePhoneCode(currentPhoneNumber)
      dispatch({ type: "opened" })
    } catch (error) {
      showToast({
        title: copy.codeNotSent,
        body: getSettingsActionErrorMessageForDisplay("requestCurrentPhoneCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsChangingPhone(false)
    }
  }, [copy, isChangingPhone, locale, sessionActor])

  const verifyCurrentPhoneChangeCode = useCallback(async () => {
    if (isChangingPhone || sessionActor.session.mode !== "production") return
    setIsChangingPhone(true)
    try {
      const firebaseConfirmation = currentPhoneFirebaseConfirmationRef.current
      const challengeId = currentPhoneChallengeRef.current
      if (!firebaseConfirmation || !challengeId) throw new Error("Request a verification code first.")
      const idToken = await confirmFirebasePhoneCode(firebaseConfirmation, currentPhoneCode)
      const confirmation = await verifyFirebaseAccountAction(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        { idToken, challengeId, purpose: "phone_change_current" }
      )
      currentPhoneFirebaseConfirmationRef.current = null
      currentPhoneChallengeRef.current = null
      dispatch({ type: "currentPhoneVerified", confirmationToken: confirmation.confirmationToken })
    } catch (error) {
      showToast({
        ...getSettingsVerificationErrorToastForDisplay("verifyCurrentPhoneCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsChangingPhone(false)
    }
  }, [currentPhoneCode, isChangingPhone, locale, sessionActor])

  const requestPhoneChangeNewCode = useCallback(async () => {
    if (
      isChangingPhone ||
      sessionActor.session.mode !== "production" ||
      !currentPhoneConfirmationToken
    ) {
      return
    }
    setIsChangingPhone(true)
    try {
      newPhoneChallengeRef.current = (await requestFirebaseAccountActionChallenge(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken,
        { purpose: "phone_change_new", targetPhoneNumber: newPhoneAnalysis.normalizedPhoneNumber }
      )).challengeId
      newPhoneFirebaseConfirmationRef.current = await requestFirebasePhoneCode(
        newPhoneAnalysis.normalizedPhoneNumber
      )
      dispatch({ type: "newPhoneCodeSent" })
    } catch (error) {
      showToast({
        title: copy.codeNotSent,
        body: getSettingsActionErrorMessageForDisplay("requestNewPhoneCode", error, locale),
        type: "warning"
      })
    } finally {
      setIsChangingPhone(false)
    }
  }, [copy, currentPhoneConfirmationToken, isChangingPhone, locale, newPhoneAnalysis.normalizedPhoneNumber, sessionActor])

  const verifyNewPhoneChangeCode = useCallback(async () => {
    if (
      isChangingPhone ||
      sessionActor.session.mode !== "production" ||
      !currentPhoneConfirmationToken
    ) {
      return
    }
    setIsChangingPhone(true)
    try {
      let next: { confirmationToken: string; expiresAt: string }
      try {
        const firebaseConfirmation = newPhoneFirebaseConfirmationRef.current
        const challengeId = newPhoneChallengeRef.current
        if (!firebaseConfirmation || !challengeId) throw new Error("Request a verification code first.")
        const idToken = await confirmFirebasePhoneCode(firebaseConfirmation, newPhoneCode)
        next = await verifyFirebaseAccountAction(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken,
          {
            idToken,
            challengeId,
            purpose: "phone_change_new",
            currentPhoneConfirmationToken
          }
        )
        newPhoneFirebaseConfirmationRef.current = null
        newPhoneChallengeRef.current = null
      } catch (error) {
        showToast({
          ...getSettingsVerificationErrorToastForDisplay("verifyNewPhoneCode", error, locale),
          type: "warning"
        })
        return
      }

      try {
        await confirmPhoneChange(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken,
          currentPhoneConfirmationToken,
          next.confirmationToken
        )
      } catch (error) {
        showToast({
          title: copy.changePhone,
          body: getSettingsActionErrorMessageForDisplay("confirmPhoneChange", error, locale),
          type: "warning"
        })
        return
      }

      resetPhoneChangeFlow()
      await onResetSession()
      showToast({
        title: copy.changePhone,
        body: copy.signOutBody,
        type: "success"
      })
    } finally {
      setIsChangingPhone(false)
    }
  }, [
    copy,
    currentPhoneConfirmationToken,
    isChangingPhone,
    locale,
    newPhoneCode,
    onResetSession,
    resetPhoneChangeFlow,
    sessionActor
  ])

  const handlePhoneChangePrompt = useCallback(() => {
    Alert.alert(
      copy.changePhone,
      copy.phoneChangePromptBody,
      [
        { text: copy.cancel, style: "cancel" },
        {
          text: isChangingPhone ? copy.sending : copy.sendSecurityCode,
          onPress: () => {
            void requestPhoneChangeCurrentCode()
          }
        }
      ]
    )
  }, [copy, isChangingPhone, requestPhoneChangeCurrentCode])

  const selectNewPhoneCountry = useCallback((countryCode: PhoneCountryCode) => {
    dispatch({ type: "countrySelected", country: countryCode })
  }, [])
  const changeNewPhoneNumber = useCallback((value: string) => {
    dispatch({ type: "numberChanged", formattedNumber: formatLocalPhoneNumber(value, newPhoneCountry) })
  }, [newPhoneCountry])
  const changePhoneChangeCode = useCallback((value: string) => {
    dispatch({ type: "codeEntered", value })
  }, [])

  const isPrimaryDisabled = isPhoneChangePrimaryDisabled({
    step: form.step,
    isChangingPhone,
    currentCode: currentPhoneCode,
    newCode: newPhoneCode,
    newPhoneValid: newPhoneAnalysis.valid
  })

  return {
    phoneChangeVisible: form.visible,
    phoneChangeStep: form.step,
    isChangingPhone,
    currentPhoneCode,
    newPhoneCode,
    newPhoneCountry,
    newPhoneNumber,
    isPrimaryDisabled,
    resetPhoneChangeFlow,
    selectNewPhoneCountry,
    changeNewPhoneNumber,
    changePhoneChangeCode,
    verifyCurrentPhoneChangeCode,
    requestPhoneChangeNewCode,
    verifyNewPhoneChangeCode,
    handlePhoneChangePrompt
  }
}
