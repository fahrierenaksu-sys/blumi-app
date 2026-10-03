import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { TextInput } from "react-native"
import { hapticError, hapticSuccess } from "../../../ui/haptics"
import { LEGAL_DOCUMENT_VERSION } from "../../legal/legalPolicyMetadata"
import type { AccountRecoveryLocale } from "../accountRecoveryCopy"
import type { AuthEntryCopy } from "../authEntryCopy"
import {
  getFirebaseCurrentPhoneNumber,
  subscribeToFirebasePhoneNumber
} from "../firebasePhoneAuth"
import {
  advanceRegisterFlowToCode,
  analyzeFormattedLocalPhoneNumber,
  createInitialRegisterFlow,
  getPhoneCountryOptions,
  getRegisterFlowAvailabilityFromPhoneAnalysis,
  maskPhoneNumber,
  normalizePhoneNumber,
  returnRegisterFlowToPhone,
  updateRegisterCode,
  updateRegisterCountry,
  updateRegisterPhone,
  type PhoneCountryCode
} from "../registerFlowModel"
import type { RegisterAccountInput } from "../sessionApi"
import {
  RESEND_COOLDOWN_SECONDS,
  canSubmitRegisterVerification,
  resolveCodeRequestFailure,
  resolveCodeRequestSuccess,
  resolveLegalRequirementsMet,
  resolveRegisterCodeRequestDecision,
  resolveRegisterFieldErrors,
  resolveRegisterPrimaryAction,
  resolveRegisterProgress,
  shouldAutoSubmitRegisterCode,
  shouldRunResendCooldown,
  tickResendCooldown,
  type RegisterAuthIntent,
  type RegisterCodeRequestStatus
} from "./registerScreenModel"

export interface RegisterFlowControllerInput {
  authIntent: RegisterAuthIntent
  locale: AccountRecoveryLocale
  authCopy: AuthEntryCopy
  isSubmitting: boolean
  errorMessage: string | null
  onRequestVerificationCode: (input: { phoneNumber: string }) => Promise<void>
  onRegister: (input: RegisterAccountInput) => Promise<void>
  onClearError: () => void
  onCreateFlowStageChange?: (stage: "phone" | "otp") => void
  /**
   * Bumped by a parent that handles back itself (edge swipe, hardware back)
   * so the code step returns to the phone step here, keeping one owner of it.
   */
  returnToPhoneRequest?: number
}

/**
 * Owns the phone -> OTP registration state machine: the flow state, the
 * Firebase auto-verified phone, the code request and verification submits,
 * the resend cooldown, and field feedback. The Register views only render it.
 */
export function useRegisterFlowController({
  authIntent,
  locale,
  authCopy,
  isSubmitting,
  errorMessage,
  onRequestVerificationCode,
  onRegister,
  onClearError,
  onCreateFlowStageChange,
  returnToPhoneRequest = 0
}: RegisterFlowControllerInput) {
  const [flow, setFlow] = useState(createInitialRegisterFlow)
  const [attemptedPrimaryAction, setAttemptedPrimaryAction] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  const [smsNotice, setSmsNotice] = useState<string | null>(null)
  const [codeRequestStatus, setCodeRequestStatus] =
    useState<RegisterCodeRequestStatus>("idle")
  const [firebasePhoneNumber, setFirebasePhoneNumber] = useState(
    getFirebaseCurrentPhoneNumber
  )
  useEffect(() => subscribeToFirebasePhoneNumber(setFirebasePhoneNumber), [])
  const [otpFocused, setOtpFocused] = useState(false)
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [otpTouched, setOtpTouched] = useState(false)
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0)
  const actionInFlightRef = useRef(false)
  const phoneInputRef = useRef<TextInput | null>(null)
  const otpInputRef = useRef<TextInput | null>(null)
  const lastAutoSubmittedCodeRef = useRef<string | null>(null)
  const codeStepCommitWaitersRef = useRef<(() => void)[]>([])
  const otpFocusPendingRef = useRef(false)
  // Bumped on every rejected code so the code cells can shake once.
  const [otpErrorCount, setOtpErrorCount] = useState(0)
  const busy = isSubmitting || localBusy
  const phoneAnalysis = useMemo(
    () => analyzeFormattedLocalPhoneNumber(flow.phoneNumber, flow.selectedCountry),
    [flow.phoneNumber, flow.selectedCountry]
  )
  const availability = useMemo(
    () => getRegisterFlowAvailabilityFromPhoneAnalysis(
      { stage: flow.stage, verificationCode: flow.verificationCode },
      busy,
      phoneAnalysis
    ),
    [busy, flow.stage, flow.verificationCode, phoneAnalysis]
  )
  const isCodeStep = flow.stage === "code"
  const { progressTotal, progressCurrent } = resolveRegisterProgress(authIntent, isCodeStep)
  const legalRequirementsMet = resolveLegalRequirementsMet(authIntent, termsAccepted)
  const verifiedFirebasePhone =
    firebasePhoneNumber === availability.normalizedPhoneNumber
  const { primaryDisabled } = resolveRegisterPrimaryAction({
    isCodeStep,
    availability,
    verifiedFirebasePhone,
    legalRequirementsMet,
    busy,
    codeRequestStatus
  })
  const clearInputFeedback = (clearSmsNotice = false): void => {
    if (attemptedPrimaryAction) setAttemptedPrimaryAction(false)
    if (clearSmsNotice && smsNotice !== null) setSmsNotice(null)
    if (errorMessage !== null) onClearError()
  }
  const maskedPhoneNumber = maskPhoneNumber(
    availability.normalizedPhoneNumber
  )
  const selectedCountry = useMemo(
    () => getPhoneCountryOptions().find(
      (country) => country.countryCode === flow.selectedCountry
    ) ?? getPhoneCountryOptions()[0],
    [flow.selectedCountry]
  )
  const { showPhoneError, showOtpError } = resolveRegisterFieldErrors({
    phoneValid: availability.phoneValid,
    verificationCodeValid: availability.verificationCodeValid,
    phoneTouched,
    otpTouched,
    attemptedPrimaryAction,
    phoneNumberLength: flow.phoneNumber.length,
    verificationCodeLength: flow.verificationCode.length
  })

  useEffect(() => {
    if (!shouldRunResendCooldown(isCodeStep, resendCooldownSeconds)) return
    const timer = setTimeout(() => {
      setResendCooldownSeconds(tickResendCooldown)
    }, 1000)
    return () => clearTimeout(timer)
  }, [isCodeStep, resendCooldownSeconds])

  // The OTP step has committed: release a pending code request and put the
  // caret in the code field so the SMS code can be typed or autofilled at once.
  useEffect(() => {
    otpFocusPendingRef.current = isCodeStep
    if (!isCodeStep) return
    for (const resolve of codeStepCommitWaitersRef.current.splice(0)) resolve()
  }, [isCodeStep])

  // The code field is read-only while busy, so focus lands once it is not.
  useEffect(() => {
    if (!isCodeStep || busy || !otpFocusPendingRef.current) return
    otpFocusPendingRef.current = false
    otpInputRef.current?.focus()
  }, [busy, isCodeStep, otpErrorCount])

  const waitForCodeStepCommit = (): Promise<void> => new Promise((resolve) => {
    codeStepCommitWaitersRef.current.push(resolve)
    // Never hold the request if the step could not advance (phone edited).
    setTimeout(resolve, 250)
  })

  useLayoutEffect(() => {
    if (authIntent === "create") {
      onCreateFlowStageChange?.(isCodeStep ? "otp" : "phone")
    }
  }, [authIntent, isCodeStep, onCreateFlowStageChange])

  const returnToPhoneStep = (): void => {
    setFlow(returnRegisterFlowToPhone)
    setAttemptedPrimaryAction(false)
    setOtpTouched(false)
    setSmsNotice(null)
    setCodeRequestStatus("idle")
    setResendCooldownSeconds(0)
    onClearError()
  }

  const returnToPhoneStepRef = useRef(returnToPhoneStep)
  returnToPhoneStepRef.current = returnToPhoneStep
  const handledReturnToPhoneRequestRef = useRef(returnToPhoneRequest)
  useLayoutEffect(() => {
    if (returnToPhoneRequest === handledReturnToPhoneRequestRef.current) return
    handledReturnToPhoneRequestRef.current = returnToPhoneRequest
    returnToPhoneStepRef.current()
  }, [returnToPhoneRequest])

  const requestVerificationCode = async (): Promise<void> => {
    setAttemptedPrimaryAction(true)
    const decision = resolveRegisterCodeRequestDecision({
      verifiedFirebasePhone,
      phoneValid: availability.phoneValid,
      canRequestCode: availability.canRequestCode,
      legalRequirementsMet,
      actionInFlight: actionInFlightRef.current,
      isCodeStep,
      resendCooldownSeconds
    })
    if (decision === "complete-verified-phone") {
      actionInFlightRef.current = true
      setLocalBusy(true)
      onClearError()
      try {
        await onRegister({
          phoneNumber: availability.normalizedPhoneNumber,
          verificationCode: "",
          authIntent,
          termsAcceptance: { version: LEGAL_DOCUMENT_VERSION, locale }
        })
      } catch {
        // Session state owns the user-facing account-completion error.
      } finally {
        actionInFlightRef.current = false
        setLocalBusy(false)
      }
      return
    }
    if (decision === "blocked") {
      if (!availability.phoneValid) phoneInputRef.current?.focus()
      return
    }

    const previousCodeAvailable = codeRequestStatus === "sent"
    actionInFlightRef.current = true
    setLocalBusy(true)
    onClearError()
    setCodeRequestStatus("sending")
    setSmsNotice(authCopy.sendingCode)
    try {
      if (!isCodeStep) {
        setFlow((current) =>
          normalizePhoneNumber(current.phoneNumber, current.selectedCountry) ===
          availability.normalizedPhoneNumber
            ? advanceRegisterFlowToCode(current)
            : current
        )
        // Let the OTP step commit before the native verification request can open UI.
        await waitForCodeStepCommit()
      }
      await onRequestVerificationCode({
        phoneNumber: availability.normalizedPhoneNumber
      })
      const success = resolveCodeRequestSuccess(isCodeStep, authCopy)
      setCodeRequestStatus(success.codeRequestStatus)
      lastAutoSubmittedCodeRef.current = null
      setAttemptedPrimaryAction(false)
      setOtpTouched(false)
      setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS)
      setSmsNotice(success.smsNotice)
    } catch {
      // Session state owns the user-facing provider error.
      const failure = resolveCodeRequestFailure(previousCodeAvailable, authCopy)
      setCodeRequestStatus(failure.codeRequestStatus)
      setSmsNotice(failure.smsNotice)
    } finally {
      actionInFlightRef.current = false
      setLocalBusy(false)
    }
  }

  const verifyCode = async (): Promise<void> => {
    setAttemptedPrimaryAction(true)
    if (!canSubmitRegisterVerification({
      canVerify: availability.canVerify,
      verifiedFirebasePhone,
      actionInFlight: actionInFlightRef.current,
      codeRequestStatus
    })) return

    actionInFlightRef.current = true
    setLocalBusy(true)
    onClearError()
    try {
      await onRegister({
        phoneNumber: availability.normalizedPhoneNumber,
        verificationCode: flow.verificationCode,
        authIntent,
        termsAcceptance: {
          version: LEGAL_DOCUMENT_VERSION,
          locale
        }
      })
      hapticSuccess()
    } catch {
      // Session state owns the user-facing verification error; the field
      // clears, shakes and takes focus again for the next attempt.
      hapticError()
      setFlow((current) => updateRegisterCode(current, ""))
      setAttemptedPrimaryAction(false)
      setOtpErrorCount((count) => count + 1)
      otpFocusPendingRef.current = true
    } finally {
      actionInFlightRef.current = false
      setLocalBusy(false)
    }
  }

  const verifyCodeRef = useRef(verifyCode)
  verifyCodeRef.current = verifyCode
  const autoSubmitCode = shouldAutoSubmitRegisterCode({
    isCodeStep,
    verificationCode: flow.verificationCode,
    lastAutoSubmittedCode: lastAutoSubmittedCodeRef.current,
    canVerify: availability.canVerify,
    actionInFlight: actionInFlightRef.current,
    codeRequestStatus
  })
  useEffect(() => {
    if (!autoSubmitCode) return
    lastAutoSubmittedCodeRef.current = flow.verificationCode
    void verifyCodeRef.current()
  }, [autoSubmitCode, flow.verificationCode])

  const runPrimaryAction = (): void => {
    if (isCodeStep) {
      void verifyCode()
      return
    }
    void requestVerificationCode()
  }

  const resendCode = (): void => {
    void requestVerificationCode()
  }

  const handleCodeChange = (value: string): void => {
    setFlow((current) => updateRegisterCode(current, value))
    clearInputFeedback()
  }

  const handleOtpFocus = (): void => setOtpFocused(true)

  const handleOtpBlur = (): void => {
    setOtpFocused(false)
    setOtpTouched(true)
  }

  const handleCountrySelect = (countryCode: PhoneCountryCode): void => {
    setFlow((current) =>
      updateRegisterCountry(current, countryCode)
    )
    setAttemptedPrimaryAction(false)
    setPhoneTouched(false)
    setSmsNotice(null)
    onClearError()
  }

  const handlePhoneChange = (value: string): void => {
    setFlow((current) => updateRegisterPhone(current, value))
    clearInputFeedback(true)
  }

  const handlePhoneBlur = (): void => setPhoneTouched(true)

  const toggleTermsAccepted = (): void => setTermsAccepted((accepted) => !accepted)

  return {
    flow,
    busy,
    isCodeStep,
    phoneAnalysis,
    availability,
    selectedCountry,
    maskedPhoneNumber,
    progressTotal,
    progressCurrent,
    verifiedFirebasePhone,
    primaryDisabled,
    attemptedPrimaryAction,
    codeRequestStatus,
    smsNotice,
    otpFocused,
    termsAccepted,
    resendCooldownSeconds,
    showPhoneError,
    showOtpError,
    phoneInputRef,
    otpInputRef,
    otpErrorCount,
    returnToPhoneStep,
    runPrimaryAction,
    resendCode,
    handleCodeChange,
    handleOtpFocus,
    handleOtpBlur,
    handleCountrySelect,
    handlePhoneChange,
    handlePhoneBlur,
    toggleTermsAccepted
  }
}

export type RegisterFlowController = ReturnType<typeof useRegisterFlowController>
