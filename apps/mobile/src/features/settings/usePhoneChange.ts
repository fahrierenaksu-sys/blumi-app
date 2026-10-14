import { useCallback, useReducer, useRef, useState } from "react"
import { Alert } from "react-native"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { showToast } from "../../ui/toast"
import {
  ApiRequestError,
  isRetryableRequestFailure,
  isSessionInvalidError
} from "../network/apiRequestError"
import type { AppLocale } from "../session/appLocale"
import {
  confirmFirebasePhoneCode,
  getFirebaseCurrentIdToken,
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
  completeFirebaseAccount,
  confirmPhoneChange,
  fetchProductionAccountSnapshot,
  requestFirebaseAccountActionChallenge,
  revokeProductionSession,
  verifyFirebaseAccountAction
} from "../session/sessionApi"
import type { SessionActor } from "../session/sessionModel"
import {
  getSettingsActionErrorMessageForDisplay,
  getSettingsVerificationErrorToastForDisplay
} from "../session/settingsActionErrorCopy"
import { pendingPhoneChange } from "./pendingPhoneChange"
import type { SettingsCopy } from "./settingsCopy"
import {
  INITIAL_PHONE_CHANGE_FORM_STATE,
  isPhoneChangePrimaryDisabled,
  phoneChangeFormReducer
} from "./settingsPhoneChangeModel"
import { useSensitiveReauthHold } from "./useSensitiveReauthHold"

interface NewPhoneProof {
  confirmationToken: string
  expiresAt: string
}

function isProofUsable(proof: NewPhoneProof | null, nowMs = Date.now()): proof is NewPhoneProof {
  if (!proof) return false
  const expiresAtMs = new Date(proof.expiresAt).getTime()
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs
}

type FinalisingFailure = "retry" | "check_outcome" | "new_number" | "restart"

/**
 * What the server says about an attempt whose answer was lost.
 * - landed: the account now has the new phone.
 * - not_landed: the session is still valid, which a landed change never leaves.
 * - session_ended: the session ended, but no account owns the new phone.
 * - unknown: the server could not be asked (network, outage).
 */
type PhoneChangeOutcome = "landed" | "not_landed" | "session_ended" | "unknown"

async function probePhoneChangeOutcome(sessionActor: SessionActor): Promise<PhoneChangeOutcome> {
  try {
    await fetchProductionAccountSnapshot(MOBILE_HTTP_BASE_URL, sessionActor.session.sessionToken)
    return "not_landed"
  } catch (error) {
    if (!isSessionInvalidError(error)) return "unknown"
  }
  // The session ended. Firebase holds the verified new phone: a sign-in-only
  // request (never a registration) shows which account owns it now.
  try {
    const idToken = await getFirebaseCurrentIdToken()
    if (!idToken) return "session_ended"
    const probe = await completeFirebaseAccount(MOBILE_HTTP_BASE_URL, { idToken, authIntent: "sign-in" })
    // The probe's session is not used; the flow signs out either way.
    void revokeProductionSession(MOBILE_HTTP_BASE_URL, probe.session.sessionToken).catch(() => undefined)
    return probe.session.userId === sessionActor.session.userId ? "landed" : "session_ended"
  } catch {
    return "session_ended"
  }
}

/**
 * How a failed final confirmation is resolved. The new-phone proof is kept
 * while the outcome is still open. A transient failure may have reached the
 * server (lost response); a later verified invalid session may mean it landed
 * or that the session was revoked for another reason, so the server is asked.
 */
function classifyFinalisingFailure(
  error: unknown,
  outcomeUnknown: boolean
): FinalisingFailure {
  if (isRetryableRequestFailure(error)) return "retry"
  if (isSessionInvalidError(error) && outcomeUnknown) return "check_outcome"
  if (error instanceof ApiRequestError && error.code === "conflict") return "new_number"
  return "restart"
}

/**
 * Phone number change: verify the current phone, enter and verify a new
 * country-aware number, confirm on the server, then sign out. The verified
 * new-phone proof survives a failed final confirmation until the outcome is
 * known, so a retry never needs a fresh code (Firebase is by then signed in
 * as the new phone and cannot be asked for one again).
 */
export function usePhoneChange(input: {
  sessionActor: SessionActor
  copy: SettingsCopy
  locale: AppLocale
  /** Returns a reset bound to the session the final request starts in. */
  bindSessionReset: () => () => Promise<void>
}) {
  const { bindSessionReset, copy, locale, sessionActor } = input
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
  const newPhoneProofRef = useRef<NewPhoneProof | null>(null)
  const finalOutcomeUnknownRef = useRef(false)
  // The phone verified at the start. After the new phone's code is confirmed,
  // Firebase reports the new phone, so a restart must not ask Firebase again.
  const verifiedCurrentPhoneRef = useRef<string | null>(null)
  // Holds foreground token refresh while an SMS challenge is pending.
  const reauthHold = useSensitiveReauthHold()
  const newPhoneAnalysis = analyzeLocalPhoneNumber(newPhoneNumber, newPhoneCountry)

  const resetPhoneChangeFlow = useCallback(() => {
    dispatch({ type: "reset" })
    currentPhoneFirebaseConfirmationRef.current = null
    currentPhoneChallengeRef.current = null
    newPhoneFirebaseConfirmationRef.current = null
    newPhoneChallengeRef.current = null
    newPhoneProofRef.current = null
    finalOutcomeUnknownRef.current = false
    reauthHold.release()
  }, [reauthHold])

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
      // After an interrupted change Firebase may hold the new phone; the
      // account's original phone is kept in secure storage until it ends.
      const currentPhoneNumber =
        verifiedCurrentPhoneRef.current ??
        (await pendingPhoneChange.readOrigin(sessionActor.session.userId)) ??
        getFirebaseCurrentPhoneNumber()
      if (!currentPhoneNumber) throw new Error("Sign in again to verify your phone.")
      verifiedCurrentPhoneRef.current = currentPhoneNumber
      reauthHold.hold()
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
  }, [copy, isChangingPhone, locale, reauthHold, sessionActor])

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
      reauthHold.hold()
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
  }, [copy, currentPhoneConfirmationToken, isChangingPhone, locale, newPhoneAnalysis.normalizedPhoneNumber, reauthHold, sessionActor])

  const applyFinalisingFailure = (
    resolution: Exclude<FinalisingFailure, "check_outcome">,
    error: unknown
  ) => {
    if (resolution === "retry") {
      finalOutcomeUnknownRef.current = true
    } else if (resolution === "new_number") {
      newPhoneProofRef.current = null
      finalOutcomeUnknownRef.current = false
      dispatch({ type: "currentPhoneVerified", confirmationToken: currentPhoneConfirmationToken })
    } else {
      // The proofs are no longer accepted: close the flow so a restart asks
      // the verified current phone for a fresh code.
      resetPhoneChangeFlow()
    }
    showToast({
      title: copy.changePhone,
      body: getSettingsActionErrorMessageForDisplay("confirmPhoneChange", error, locale),
      type: "warning"
    })
  }

  const verifyNewPhoneChangeCode = useCallback(async () => {
    if (
      isChangingPhone ||
      sessionActor.session.mode !== "production" ||
      !currentPhoneConfirmationToken
    ) {
      return
    }
    setIsChangingPhone(true)
    const resetChangedSession = bindSessionReset()
    const finishLanded = async () => {
      resetPhoneChangeFlow()
      verifiedCurrentPhoneRef.current = null
      await pendingPhoneChange.clear()
      await resetChangedSession()
      showToast({ title: copy.changePhone, body: copy.signOutBody, type: "success" })
    }
    /** Resolves an attempt whose answer was lost; true when the flow ended. */
    const settleOpenOutcome = async (): Promise<boolean> => {
      const outcome = await probePhoneChangeOutcome(sessionActor)
      if (outcome === "landed") {
        await finishLanded()
      } else if (outcome === "session_ended") {
        resetPhoneChangeFlow()
        await resetChangedSession()
        showToast({ title: copy.changePhone, body: copy.phoneChangeUnconfirmed, type: "warning" })
      } else if (outcome === "not_landed") {
        // Every proof has expired: start again from the original phone.
        resetPhoneChangeFlow()
        showToast({ title: copy.changePhone, body: copy.phoneChangeExpired, type: "warning" })
      } else {
        return false
      }
      return true
    }
    try {
      // Verified: reuse a still-valid proof from an attempt whose outcome is open.
      let proof = newPhoneProofRef.current
      if (!isProofUsable(proof) && finalOutcomeUnknownRef.current) {
        if (!(await settleOpenOutcome())) {
          showToast({ title: copy.changePhone, body: copy.phoneChangeUnconfirmed, type: "warning" })
        }
        return
      }
      if (!isProofUsable(proof)) {
        newPhoneProofRef.current = null
        finalOutcomeUnknownRef.current = false
        try {
          const firebaseConfirmation = newPhoneFirebaseConfirmationRef.current
          const challengeId = newPhoneChallengeRef.current
          if (!firebaseConfirmation || !challengeId) throw new Error("Request a verification code first.")
          const originPhone = verifiedCurrentPhoneRef.current
          // Firebase switches to the new phone on confirm: keep the original first.
          if (originPhone) await pendingPhoneChange.remember(sessionActor.session.userId, originPhone)
          const idToken = await confirmFirebasePhoneCode(firebaseConfirmation, newPhoneCode)
          proof = await verifyFirebaseAccountAction(
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
          newPhoneProofRef.current = proof
          reauthHold.release()
        } catch (error) {
          showToast({
            ...getSettingsVerificationErrorToastForDisplay("verifyNewPhoneCode", error, locale),
            type: "warning"
          })
          return
        }
      }

      // Finalising: the outcome stays open until the server answers.
      try {
        await confirmPhoneChange(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken,
          currentPhoneConfirmationToken,
          proof.confirmationToken
        )
      } catch (error) {
        const resolution = classifyFinalisingFailure(error, finalOutcomeUnknownRef.current)
        if (resolution === "check_outcome") {
          if (!(await settleOpenOutcome())) applyFinalisingFailure("retry", error)
          return
        }
        applyFinalisingFailure(resolution, error)
        return
      }

      await finishLanded()
    } finally {
      setIsChangingPhone(false)
    }
  }, [
    bindSessionReset,
    copy,
    currentPhoneConfirmationToken,
    isChangingPhone,
    locale,
    newPhoneCode,
    reauthHold,
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
