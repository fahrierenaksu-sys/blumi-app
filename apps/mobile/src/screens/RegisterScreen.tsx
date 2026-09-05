import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import {
  advanceRegisterFlowToCode,
  analyzeLocalPhoneNumber,
  createInitialRegisterFlow,
  getPhoneCountryOptions,
  getRegisterFlowAvailability,
  maskPhoneNumber,
  normalizePhoneNumber,
  returnRegisterFlowToPhone,
  updateRegisterCode,
  updateRegisterCountry,
  updateRegisterPhone
} from "../features/session/registerFlowModel"
import {
  getLocalPhonePlaceholder,
  getPhoneErrorMessage
} from "../features/session/registerPresentationModel"
import {
  canRequestRegisterPhoneCode,
  REGISTER_PHONE_PANEL_LAYOUT as phonePanel,
  resolveRegisterPhoneStageHeight
} from "../features/session/registerPhonePanelModel"
import type { RegisterAccountInput } from "../features/session/sessionApi"
import { validateAccountRecoveryPhones } from "../features/session/accountRecoveryModel"
import {
  requestAccountRecoveryChallenge,
  submitAccountRecoveryRequest
} from "../features/session/sessionApi"
import {
  getAccountRecoveryCopy,
  getAccountRecoveryErrorMessageForDisplay,
  resolveAccountRecoveryLocale
} from "../features/session/accountRecoveryCopy"
import { getAuthEntryCopy } from "../features/session/authEntryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import { LEGAL_DOCUMENT_VERSION } from "../features/legal/legalPolicyMetadata"
import { getSetupLayoutMetrics } from "../features/session/setupFlow/setupFlowShellModel"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { CountryCallingCodePicker } from "../components/CountryCallingCodePicker"
import { RegisterCharacterHero } from "./RegisterCharacterHero"
import { SoftBlobBackground } from "../ui/backgrounds"
import { BrandMark } from "../ui/brandMark"
import { GlassCard, GlassPill } from "../ui/glass"
import { PrimaryButton } from "../ui/primitives"
import { useEntranceAnimation, useSelectionTransition } from "../ui/animations"
import { blumiEntryTheme as uiTheme } from "../ui/theme"
import { BlumiSetupShell } from "../features/session/setupFlow/BlumiSetupShell"
import { RegisterWorldHero } from "../features/session/RegisterWorldHero"
import { AvatarPreview2D } from "../features/avatarV2/components/AvatarPreview2D"
import type { UserAvatar } from "../features/avatarV2/avatarV2.types"

type RegisterScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "Register"
> & {
  isSubmitting: boolean
  errorMessage: string | null
  onRequestVerificationCode: (input: { phoneNumber: string }) => Promise<void>
  onRegister: (input: RegisterAccountInput) => Promise<void>
  onClearError: () => void
  onCreateFlowStageChange?: (stage: "phone" | "otp") => void
  createFlowAvatar?: Partial<UserAvatar> | null
  motionActive?: boolean
}

const RESEND_COOLDOWN_SECONDS = 30

export function RegisterScreen({
  route,
  navigation,
  isSubmitting,
  errorMessage,
  onRequestVerificationCode,
  onRegister,
  onClearError,
  onCreateFlowStageChange,
  createFlowAvatar,
  motionActive = true
}: RegisterScreenProps) {
  const authIntent = route.params?.intent ?? "create"
  const cameFromWorld = route.params?.entryMotion === "world-handoff"
  const locale = resolveAccountRecoveryLocale(
    getNativeAppLocale(),
    Intl.DateTimeFormat().resolvedOptions().locale
  )
  const recoveryCopy = getAccountRecoveryCopy(locale)
  const authCopy = getAuthEntryCopy(locale)
  const {
    width: viewportWidth,
    height: viewportHeight,
    fontScale: viewportFontScale
  } = useWindowDimensions()
  const stackRecoveryActions = viewportWidth < 360 || viewportFontScale >= 1.25
  const setupMetrics = getSetupLayoutMetrics({
    width: viewportWidth,
    height: viewportHeight,
    fontScale: viewportFontScale
  })
  const compactHero =
    viewportWidth < 375 || viewportFontScale >= 1.2 || viewportHeight < 760
  const createHeroAvatarSize = setupMetrics.veryCompact ? 82 : setupMetrics.dense ? 88 : 94
  const createHeroStageHeight = setupMetrics.veryCompact ? 110 : setupMetrics.dense ? 118 : 126
  const [flow, setFlow] = useState(createInitialRegisterFlow)
  const [attemptedPrimaryAction, setAttemptedPrimaryAction] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  const [smsNotice, setSmsNotice] = useState<string | null>(null)
  const [otpFocused, setOtpFocused] = useState(false)
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [otpTouched, setOtpTouched] = useState(false)
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0)
  const [recoveryVisible, setRecoveryVisible] = useState(false)
  const [recoveryStage, setRecoveryStage] = useState<"details" | "code">("details")
  const [recoveryOldPhone, setRecoveryOldPhone] = useState("")
  const [recoveryNewPhone, setRecoveryNewPhone] = useState("")
  const [recoveryCode, setRecoveryCode] = useState("")
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const actionInFlightRef = useRef(false)
  const phoneInputRef = useRef<TextInput | null>(null)
  const busy = isSubmitting || localBusy
  const availability = getRegisterFlowAvailability(flow, busy)
  const isCodeStep = flow.stage === "code"
  const progressTotal = authIntent === "create" ? 4 : 2
  const progressCurrent = authIntent === "create"
    ? 4
    : isCodeStep ? 2 : 1
  const legalRequirementsMet = authIntent === "create"
    ? termsAccepted
    : true
  const primaryEnabled = isCodeStep
    ? availability.canVerify
    : canRequestRegisterPhoneCode({
      phoneValid: availability.phoneValid,
      termsAccepted: legalRequirementsMet,
      isSubmitting: busy
    })
  const primaryDisabled = busy || !primaryEnabled
  const maskedPhoneNumber = maskPhoneNumber(
    availability.normalizedPhoneNumber
  )
  const selectedCountry = getPhoneCountryOptions().find(
    (country) => country.countryCode === flow.selectedCountry
  ) ?? getPhoneCountryOptions()[0]
  const phoneAnalysis = analyzeLocalPhoneNumber(
    flow.phoneNumber,
    flow.selectedCountry
  )
  const showPhoneError = !availability.phoneValid &&
    (phoneTouched || attemptedPrimaryAction) && flow.phoneNumber.length > 0
  const showOtpError = !availability.verificationCodeValid &&
    (otpTouched || attemptedPrimaryAction) && flow.verificationCode.length > 0
  const formTransition = useSelectionTransition(flow.stage, {
    fromScale: 0.992,
    translateY: 8
  })
  const handoffEntrance = useEntranceAnimation({
    duration: cameFromWorld ? 260 : 0,
    translateY: cameFromWorld ? 22 : 0
  })

  useEffect(() => {
    if (!isCodeStep || resendCooldownSeconds <= 0) return
    const timer = setTimeout(() => {
      setResendCooldownSeconds((seconds) => Math.max(0, seconds - 1))
    }, 1000)
    return () => clearTimeout(timer)
  }, [isCodeStep, resendCooldownSeconds])

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
    setResendCooldownSeconds(0)
    onClearError()
  }

  const requestVerificationCode = async (): Promise<void> => {
    setAttemptedPrimaryAction(true)
    if (
      !availability.canRequestCode ||
      !legalRequirementsMet ||
      actionInFlightRef.current ||
      (isCodeStep && resendCooldownSeconds > 0)
    ) {
      if (!availability.phoneValid) phoneInputRef.current?.focus()
      return
    }

    actionInFlightRef.current = true
    setLocalBusy(true)
    onClearError()
    try {
      await onRequestVerificationCode({
        phoneNumber: availability.normalizedPhoneNumber
      })
      setFlow((current) =>
        normalizePhoneNumber(current.phoneNumber, current.selectedCountry) ===
        availability.normalizedPhoneNumber
          ? advanceRegisterFlowToCode(current)
          : current
      )
      setAttemptedPrimaryAction(false)
      setOtpTouched(false)
      setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS)
      setSmsNotice(
        isCodeStep
          ? authCopy.freshCodeSent
          : authCopy.codeExpiresSoon
      )
    } catch {
      // Session state owns the user-facing provider error.
    } finally {
      actionInFlightRef.current = false
      setLocalBusy(false)
    }
  }

  const verifyCode = async (): Promise<void> => {
    setAttemptedPrimaryAction(true)
    if (!availability.canVerify || actionInFlightRef.current) return

    actionInFlightRef.current = true
    setLocalBusy(true)
    onClearError()
    try {
      await onRegister({
        phoneNumber: availability.normalizedPhoneNumber,
        verificationCode: flow.verificationCode,
        termsAcceptance: {
          version: LEGAL_DOCUMENT_VERSION,
          locale
        }
      })
    } catch {
      // Session state owns the user-facing verification error.
    } finally {
      actionInFlightRef.current = false
      setLocalBusy(false)
    }
  }

  const runPrimaryAction = (): void => {
    if (isCodeStep) {
      void verifyCode()
      return
    }
    void requestVerificationCode()
  }

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
      await requestAccountRecoveryChallenge(
        MOBILE_HTTP_BASE_URL,
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
      await submitAccountRecoveryRequest(MOBILE_HTTP_BASE_URL, {
        oldPhoneNumber: validation.normalizedOldPhoneNumber,
        newPhoneNumber: validation.normalizedNewPhoneNumber,
        verificationCode: recoveryCode
      })
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
    setRecoveryError(null)
  }

  if (authIntent === "create") {
    return (
      <BlumiSetupShell
        backDisabled={busy}
        collapseStageOnKeyboard
        feedback={errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons
              accessible={false}
              name="alert-circle-outline"
              size={19}
              color={uiTheme.colors.danger}
            />
            <Text accessibilityRole="alert" style={styles.error}>
              {errorMessage}
            </Text>
          </View>
        ) : null}
        motionActive={motionActive}
        onBack={() => {
          if (isCodeStep) {
            returnToPhoneStep()
            return
          }
          onClearError()
          navigation.goBack()
        }}
        onPrimaryAction={runPrimaryAction}
        primaryActionBusy={busy}
        primaryActionDisabled={primaryDisabled}
        primaryActionLabel={isCodeStep ? "Blumi'ye katil" : authCopy.sendCode}
        primaryActionTestID={isCodeStep ? "register-submit" : "register-send-code"}
        scrollBottomInset={0}
        stageHeight={resolveRegisterPhoneStageHeight(setupMetrics)}
        step={isCodeStep ? "otp" : "phone"}
        taskCardOffsetY={phonePanel.spacing.taskCardOffsetY}
        headingOffsetY={phonePanel.spacing.taskCardOffsetY}
        stage={(
          <Animated.View style={[styles.createCharacterScene, handoffEntrance]}>
            <View style={styles.createCharacterHalo} />
            <View style={styles.createCharacterFrame} />
            <RegisterWorldHero active={motionActive && !isCodeStep} />
          </Animated.View>
        )}
      >
        <Animated.View style={formTransition}>
          <View style={styles.stepContent}>
            <View style={styles.formMetaRow}>
              <View style={styles.formMetaIcon}>
                <Ionicons
                  accessible={false}
                  name={isCodeStep ? "chatbubble-ellipses" : "phone-portrait-outline"}
                  size={18}
                  color={uiTheme.colors.primaryDeep}
                />
              </View>
              <View style={styles.formMetaCopy}>
                <Text maxFontSizeMultiplier={1.5} style={styles.formMetaEyebrow}>
                  {authCopy.secureSignIn}
                </Text>
                <Text maxFontSizeMultiplier={1.5} style={styles.formMetaTitle}>
                  {isCodeStep ? authCopy.codeQuestion : authCopy.phoneQuestion}
                </Text>
              </View>
            </View>
            {isCodeStep ? (
              <View
                testID="register-code-step"
                style={[
                  styles.stepContent,
                  setupMetrics.dense ? styles.stepContentCompact : null
                ]}
              >
                <View style={styles.sentCard}>
                  <View style={styles.sentIcon}>
                    <Ionicons
                      accessible={false}
                      name="checkmark"
                      size={15}
                      color={uiTheme.colors.successInk}
                    />
                  </View>
                  <View style={styles.sentCopy}>
                    <Text maxFontSizeMultiplier={1.5} style={styles.sentTitle}>
                      {smsNotice ?? authCopy.codeSent}
                    </Text>
                    <Text maxFontSizeMultiplier={1.5} style={styles.sentNumber}>
                      {maskedPhoneNumber}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={authCopy.changePhoneNumber}
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={returnToPhoneStep}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.changeButton,
                      pressed ? styles.controlPressed : null
                    ]}
                  >
                    <Text style={styles.changeButtonText}>{authCopy.edit}</Text>
                  </Pressable>
                </View>

                <View style={styles.otpField}>
                  <Text maxFontSizeMultiplier={1.5} style={styles.otpLabel}>
                    {authCopy.sixDigitCode}
                  </Text>
                  <View style={styles.otpInputShell}>
                    <TextInput
                      accessibilityLabel={authCopy.sixDigitCodeAccessibilityLabel}
                      value={flow.verificationCode}
                      onChangeText={(value) => {
                        setFlow((current) => updateRegisterCode(current, value))
                        setAttemptedPrimaryAction(false)
                        onClearError()
                      }}
                      onFocus={() => setOtpFocused(true)}
                      onBlur={() => {
                        setOtpFocused(false)
                        setOtpTouched(true)
                      }}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      editable={!busy}
                      maxFontSizeMultiplier={1.5}
                      caretHidden
                      maxLength={6}
                      onSubmitEditing={runPrimaryAction}
                      style={styles.otpNativeInput}
                    />
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      pointerEvents="none"
                      style={styles.otpCells}
                    >
                      {Array.from({ length: 6 }, (_, index) => {
                        const digit = flow.verificationCode[index] ?? ""
                        const active = otpFocused &&
                          index === Math.min(flow.verificationCode.length, 5)
                        return (
                          <View
                            key={index}
                            testID={`register-otp-cell-${index}`}
                            style={[
                              styles.otpCell,
                              digit ? styles.otpCellFilled : null,
                              active ? styles.otpCellActive : null
                            ]}
                          >
                            <Text maxFontSizeMultiplier={1.5} style={styles.otpDigit}>
                              {digit}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  </View>
                  {showOtpError ? (
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      style={styles.otpError}
                    >
                      {authCopy.completeCodeError}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    resendCooldownSeconds > 0
                      ? authCopy.resendCodeIn(resendCooldownSeconds)
                      : authCopy.resendCode
                  }
                  accessibilityState={{
                    disabled: busy || resendCooldownSeconds > 0,
                    busy
                  }}
                  disabled={busy || resendCooldownSeconds > 0}
                  onPress={() => {
                    void requestVerificationCode()
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.resendButton,
                    pressed ? styles.controlPressed : null
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.5} style={styles.resendText}>
                    {resendCooldownSeconds > 0
                      ? authCopy.resendCodeCountdown(resendCooldownSeconds)
                      : authCopy.resendCode}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View
                testID="register-phone-step"
                style={[
                  styles.stepContent,
                  setupMetrics.dense ? styles.stepContentCompact : null
                ]}
              >
                <Text maxFontSizeMultiplier={1.5} style={styles.phoneLabel}>
                  {authCopy.phoneNumberLabel(selectedCountry.name)}
                </Text>
                <View
                  style={[
                    styles.phoneControl,
                    attemptedPrimaryAction && !availability.phoneValid
                      ? styles.phoneControlError
                      : null
                  ]}
                >
                  <CountryCallingCodePicker
                    language={locale}
                    disabled={busy}
                    selectedCountry={flow.selectedCountry}
                    onSelect={(countryCode) => {
                      setFlow((current) =>
                        updateRegisterCountry(current, countryCode)
                      )
                      setAttemptedPrimaryAction(false)
                      setPhoneTouched(false)
                      setSmsNotice(null)
                      onClearError()
                    }}
                  />
                  <View style={styles.phoneDivider} />
                  <TextInput
                    accessibilityLabel={authCopy.localPhoneAccessibilityLabel(selectedCountry.name)}
                    value={flow.phoneNumber}
                    onChangeText={(value) => {
                      setFlow((current) => updateRegisterPhone(current, value))
                      setAttemptedPrimaryAction(false)
                      setSmsNotice(null)
                      onClearError()
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    placeholder={getLocalPhonePlaceholder(flow.selectedCountry, authCopy.localPhonePlaceholder)}
                    placeholderTextColor={uiTheme.colors.textMuted}
                    editable={!busy}
                    maxLength={24}
                    maxFontSizeMultiplier={1.5}
                    onBlur={() => setPhoneTouched(true)}
                    onSubmitEditing={runPrimaryAction}
                    ref={phoneInputRef}
                    style={styles.phoneInput}
                  />
                </View>
                {showPhoneError ? (
                  <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    style={styles.phoneError}
                  >
                    {getPhoneErrorMessage(phoneAnalysis.error, selectedCountry.name, authCopy)}
                  </Text>
                ) : null}
                <Text maxFontSizeMultiplier={1.5} style={styles.phoneHint}>
                  {flow.selectedCountry === "TR"
                    ? authCopy.trPhoneHint
                    : authCopy.automaticCallingCodeHint(selectedCountry.callingCode)}
                </Text>
              </View>
            )}

            <View
              style={[
                styles.footerArea,
                setupMetrics.dense ? styles.footerAreaCompact : null,
                { marginBottom: -phonePanel.spacing.footerBottomTrim }
              ]}
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={authCopy.acceptTerms}
                accessibilityState={{ checked: termsAccepted, disabled: busy }}
                disabled={busy}
                onPress={() => setTermsAccepted((accepted) => !accepted)}
                style={({ pressed }) => [
                  styles.termsConsent,
                  setupMetrics.dense ? styles.termsConsentCompact : null,
                  pressed ? styles.controlPressed : null
                ]}
              >
                <Ionicons
                  accessible={false}
                  color={termsAccepted ? uiTheme.colors.primary : uiTheme.colors.textMuted}
                  name={termsAccepted ? "checkbox" : "square-outline"}
                  size={24}
                />
                <Text maxFontSizeMultiplier={1.5} style={styles.termsConsentText}>
                  {authCopy.termsConsent}
                </Text>
              </Pressable>
              <View
                style={[
                  styles.legalRow,
                  setupMetrics.compact ? styles.legalRowWrapped : null
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={authCopy.openPrivacyPolicy}
                  onPress={() => navigation.navigate("Legal", { type: "privacy" })}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.legalPressable,
                    pressed ? styles.controlPressed : null
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.5} style={styles.legalLink}>
                    {authCopy.privacy}
                  </Text>
                </Pressable>
                <Text maxFontSizeMultiplier={1.5} style={styles.legalSeparator}>·</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={authCopy.openTerms}
                  onPress={() => navigation.navigate("Legal", { type: "terms" })}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.legalPressable,
                    pressed ? styles.controlPressed : null
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.5} style={styles.legalLink}>
                    {authCopy.terms}
                  </Text>
                </Pressable>
              </View>
            </View>

          </View>
        </Animated.View>
      </BlumiSetupShell>
    )
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground
        variant="register"
        animated={motionActive}
      />
      <SafeAreaView contentGutter={false} style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={authCopy.backToAccountChoices}
                onPress={() => {
                  onClearError()
                  navigation.goBack()
                }}
                style={({ pressed }) => [
                  styles.back,
                  pressed ? styles.controlPressed : null
                ]}
              >
                <Ionicons
                  accessible={false}
                  name="arrow-back"
                  size={20}
                  color={uiTheme.colors.textPrimary}
                />
              </Pressable>

              <View accessibilityLabel="Blumi" style={styles.brandRow}>
                <BrandMark size={28} style={styles.brandMark} />
                <Text maxFontSizeMultiplier={1.4} style={styles.brandText}>Blumi</Text>
              </View>

              <GlassPill style={styles.stepPill}>
                <Text maxFontSizeMultiplier={1.4} style={styles.stepPillText}>
                  {progressCurrent} / {progressTotal}
                </Text>
              </GlassPill>
            </View>

            <Animated.View style={[styles.heading, handoffEntrance]}>
              {authIntent === "sign-in" ? <RegisterCharacterHero
                compact={compactHero}
                body={
                  isCodeStep
                    ? authIntent === "sign-in"
                      ? authCopy.signInCodeBody
                      : authCopy.createCodeBody
                    : authIntent === "sign-in"
                      ? authCopy.signInPhoneBody
                      : authCopy.registerHeroBody
                }
                message={authCopy.registerHeroMessage}
                title={
                  isCodeStep
                    ? authCopy.checkMessages
                    : authIntent === "sign-in"
                      ? authCopy.verifyNumber
                      : authCopy.registerHeroTitle
                }
              /> : (
                <View
                  style={[
                    styles.createHeading,
                    setupMetrics.dense ? styles.createHeadingCompact : null
                  ]}
                >
                  <Text accessibilityRole="header" style={styles.createHeadingTitle}>
                    {isCodeStep ? "Mesajlarına bak" : "Dünyan kaybolmasın"}
                  </Text>
                  <Text style={styles.createHeadingBody}>
                    {isCodeStep
                      ? "Gönderdiğimiz 6 haneli kodu gir."
                      : "Telefonunla Blumi dünyanı güvende tut."}
                  </Text>
                  <View
                    style={[
                      styles.createCharacterScene,
                      setupMetrics.veryCompact
                        ? styles.createCharacterSceneVeryCompact
                        : setupMetrics.dense
                          ? styles.createCharacterSceneCompact
                          : null
                    ]}
                  >
                    <View style={styles.createCharacterHalo} />
                    <View style={styles.createCharacterHome}>
                      <Ionicons
                        accessible={false}
                        color={uiTheme.colors.primaryDeep}
                        name={isCodeStep ? "shield-checkmark" : "home"}
                        size={17}
                      />
                    </View>
                    <AvatarPreview2D
                      animationState="idle_front"
                      avatar={createFlowAvatar ?? undefined}
                      showGlow={false}
                      size={createHeroAvatarSize}
                      stageHeight={createHeroStageHeight}
                      themeTone="entry"
                    />
                  </View>
                </View>
              )}
              {authIntent === "sign-in" ? <View
                accessible
                accessibilityLabel={authCopy.registrationProgressLabel(progressCurrent, progressTotal)}
                accessibilityRole="progressbar"
                accessibilityValue={{
                  min: 1,
                  max: progressTotal,
                  now: progressCurrent,
                  text: authCopy.registrationProgressValue(progressCurrent, progressTotal)
                }}
                style={styles.progressRow}
              >
                {Array.from({ length: progressTotal }, (_, index) => (
                  <View
                    key={index}
                    testID={`register-progress-${index}`}
                    style={[
                      styles.progressTrack,
                      index < progressCurrent ? styles.progressTrackActive : null
                    ]}
                  />
                ))}
              </View> : null}
            </Animated.View>

            <Animated.View style={handoffEntrance}>
              <Animated.View
                testID="register-motion-card"
                style={formTransition}
              >
              <GlassCard
                tone="light"
                style={[
                  styles.formCard,
                  setupMetrics.dense ? styles.formCardCompact : null
                ]}
              >
              <View
                pointerEvents="none"
                style={styles.formGlassTint}
              />
              <View style={styles.formMetaRow}>
                <View style={styles.formMetaIcon}>
                  <Ionicons
                    accessible={false}
                    name={isCodeStep ? "chatbubble-ellipses" : "phone-portrait-outline"}
                    size={18}
                    color={uiTheme.colors.primaryDeep}
                  />
                </View>
                <View style={styles.formMetaCopy}>
                  <Text maxFontSizeMultiplier={1.5} style={styles.formMetaEyebrow}>{authCopy.secureSignIn}</Text>
                  <Text maxFontSizeMultiplier={1.5} style={styles.formMetaTitle}>
                    {isCodeStep ? authCopy.codeQuestion : authCopy.phoneQuestion}
                  </Text>
                </View>
              </View>

              {isCodeStep ? (
                <View testID="register-code-step" style={styles.stepContent}>
                  <View style={styles.sentCard}>
                    <View style={styles.sentIcon}>
                      <Ionicons
                        accessible={false}
                        name="checkmark"
                        size={15}
                        color={uiTheme.colors.successInk}
                      />
                    </View>
                    <View style={styles.sentCopy}>
                      <Text maxFontSizeMultiplier={1.5} style={styles.sentTitle}>
                        {smsNotice ?? authCopy.codeSent}
                      </Text>
                      <Text maxFontSizeMultiplier={1.5} style={styles.sentNumber}>
                        {maskedPhoneNumber}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={authCopy.changePhoneNumber}
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      onPress={returnToPhoneStep}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.changeButton,
                        pressed ? styles.controlPressed : null
                      ]}
                    >
                      <Text style={styles.changeButtonText}>{authCopy.edit}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.otpField}>
                    <Text maxFontSizeMultiplier={1.5} style={styles.otpLabel}>
                      {authCopy.sixDigitCode}
                    </Text>
                    <View style={styles.otpInputShell}>
                      <TextInput
                        accessibilityLabel={authCopy.sixDigitCodeAccessibilityLabel}
                        value={flow.verificationCode}
                        onChangeText={(value) => {
                          setFlow((current) => updateRegisterCode(current, value))
                          setAttemptedPrimaryAction(false)
                          onClearError()
                        }}
                        onFocus={() => setOtpFocused(true)}
                        onBlur={() => {
                          setOtpFocused(false)
                          setOtpTouched(true)
                        }}
                        keyboardType="number-pad"
                        textContentType="oneTimeCode"
                        autoComplete="sms-otp"
                        editable={!busy}
                        maxFontSizeMultiplier={1.5}
                        caretHidden
                        maxLength={6}
                        onSubmitEditing={runPrimaryAction}
                        style={styles.otpNativeInput}
                      />
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        pointerEvents="none"
                        style={styles.otpCells}
                      >
                        {Array.from({ length: 6 }, (_, index) => {
                          const digit = flow.verificationCode[index] ?? ""
                          const active = otpFocused &&
                            index === Math.min(flow.verificationCode.length, 5)
                          return (
                            <View
                              key={index}
                              testID={`register-otp-cell-${index}`}
                              style={[
                                styles.otpCell,
                                digit ? styles.otpCellFilled : null,
                                active ? styles.otpCellActive : null
                              ]}
                            >
                              <Text maxFontSizeMultiplier={1.5} style={styles.otpDigit}>
                                {digit}
                              </Text>
                            </View>
                          )
                        })}
                      </View>
                    </View>
                    {showOtpError ? (
                      <Text
                        accessibilityRole="alert"
                        accessibilityLiveRegion="polite"
                        style={styles.otpError}
                      >
                        {authCopy.completeCodeError}
                      </Text>
                    ) : null}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      resendCooldownSeconds > 0
                        ? authCopy.resendCodeIn(resendCooldownSeconds)
                        : authCopy.resendCode
                    }
                    accessibilityState={{
                      disabled: busy || resendCooldownSeconds > 0,
                      busy
                    }}
                    disabled={busy || resendCooldownSeconds > 0}
                    onPress={() => {
                      void requestVerificationCode()
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.resendButton,
                      pressed ? styles.controlPressed : null
                    ]}
                  >
                    <Text maxFontSizeMultiplier={1.5} style={styles.resendText}>
                      {resendCooldownSeconds > 0
                        ? authCopy.resendCodeCountdown(resendCooldownSeconds)
                        : authCopy.resendCode}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View testID="register-phone-step" style={styles.stepContent}>
                  <Text maxFontSizeMultiplier={1.5} style={styles.phoneLabel}>
                    {authCopy.phoneNumberLabel(selectedCountry.name)}
                  </Text>
                  <View
                    style={[
                      styles.phoneControl,
                      attemptedPrimaryAction && !availability.phoneValid
                        ? styles.phoneControlError
                        : null
                    ]}
                  >
                    <CountryCallingCodePicker
                      language={locale}
                      disabled={busy}
                      selectedCountry={flow.selectedCountry}
                      onSelect={(countryCode) => {
                        setFlow((current) =>
                          updateRegisterCountry(current, countryCode)
                        )
                        setAttemptedPrimaryAction(false)
                        setPhoneTouched(false)
                        setSmsNotice(null)
                        onClearError()
                      }}
                    />
                    <View style={styles.phoneDivider} />
                    <TextInput
                      accessibilityLabel={authCopy.localPhoneAccessibilityLabel(selectedCountry.name)}
                      value={flow.phoneNumber}
                      onChangeText={(value) => {
                        setFlow((current) => updateRegisterPhone(current, value))
                        setAttemptedPrimaryAction(false)
                        setSmsNotice(null)
                        onClearError()
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="phone-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      placeholder={getLocalPhonePlaceholder(flow.selectedCountry, authCopy.localPhonePlaceholder)}
                      placeholderTextColor={uiTheme.colors.textMuted}
                      editable={!busy}
                      maxLength={24}
                      maxFontSizeMultiplier={1.5}
                      onBlur={() => setPhoneTouched(true)}
                      onSubmitEditing={runPrimaryAction}
                      ref={phoneInputRef}
                      style={styles.phoneInput}
                    />
                  </View>
                  {showPhoneError ? (
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      style={styles.phoneError}
                    >
                      {getPhoneErrorMessage(phoneAnalysis.error, selectedCountry.name, authCopy)}
                    </Text>
                  ) : null}
                  <Text maxFontSizeMultiplier={1.5} style={styles.phoneHint}>
                    {flow.selectedCountry === "TR"
                      ? authCopy.trPhoneHint
                      : authCopy.automaticCallingCodeHint(selectedCountry.callingCode)}
                  </Text>
                </View>
              )}

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Ionicons
                    accessible={false}
                    name="alert-circle-outline"
                    size={19}
                    color={uiTheme.colors.danger}
                  />
                  <Text accessibilityRole="alert" style={styles.error}>
                    {errorMessage}
                  </Text>
                </View>
              ) : null}

              {authIntent === "sign-in" ? <View testID="register-primary-action">
                <PrimaryButton
                  label={
                    isCodeStep
                      ? authIntent === "sign-in" ? authCopy.signInToBlumi : "Blumi’ye katıl"
                      : authCopy.sendCode
                  }
                  disabled={primaryDisabled}
                  busy={busy}
                  onPress={runPrimaryAction}
                  testID={isCodeStep ? "register-submit" : "register-send-code"}
                  tone="entry"
                />
              </View> : null}

              <View style={styles.privacyRow}>
                <View style={styles.privacyIcon}>
                  <Ionicons
                    accessible={false}
                    name="lock-closed"
                    size={14}
                    color={uiTheme.colors.textSecondary}
                  />
                </View>
                <Text maxFontSizeMultiplier={1.5} style={styles.privacyText}>
                  {authCopy.phonePrivacy}
                </Text>
              </View>
              {authIntent === "sign-in" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={recoveryCopy.linkAccessibilityLabel}
                  onPress={() => { setRecoveryVisible(true); setRecoveryError(null) }}
                  style={styles.recoveryLink}
                >
                  <Text style={styles.recoveryLinkText}>{recoveryCopy.link}</Text>
                </Pressable>
              ) : null}
              </GlassCard>
              </Animated.View>
            </Animated.View>
            <View style={styles.footerArea}>
              <View style={styles.legalRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={authCopy.openPrivacyPolicy}
                  onPress={() => navigation.navigate("Legal", { type: "privacy" })}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.legalPressable,
                    pressed ? styles.controlPressed : null
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.5} style={styles.legalLink}>{authCopy.privacy}</Text>
                </Pressable>
                <Text maxFontSizeMultiplier={1.5} style={styles.legalSeparator}>·</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={authCopy.openTerms}
                  onPress={() => navigation.navigate("Legal", { type: "terms" })}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.legalPressable,
                    pressed ? styles.controlPressed : null
                  ]}
                >
                  <Text maxFontSizeMultiplier={1.5} style={styles.legalLink}>{authCopy.terms}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <Modal visible={recoveryVisible} transparent animationType="fade" onRequestClose={closeRecovery}>
          <View style={styles.recoveryBackdrop}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
              style={styles.recoveryKeyboard}
            >
              <ScrollView
                contentContainerStyle={styles.recoveryScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.recoveryCard}>
              <Text accessibilityRole="header" style={styles.recoveryTitle}>{recoveryCopy.title}</Text>
              <Text style={styles.recoveryBody}>
                {recoveryStage === "details"
                  ? recoveryCopy.detailsBody
                  : recoveryCopy.codeBody}
              </Text>
              {recoveryStage === "details" ? <>
                <TextInput accessibilityLabel={recoveryCopy.oldPhoneLabel} autoComplete="tel" keyboardType="phone-pad" placeholder={recoveryCopy.oldPhonePlaceholder} value={recoveryOldPhone} onChangeText={setRecoveryOldPhone} style={styles.recoveryInput} />
                <TextInput accessibilityLabel={recoveryCopy.newPhoneLabel} autoComplete="tel" keyboardType="phone-pad" placeholder={recoveryCopy.newPhonePlaceholder} value={recoveryNewPhone} onChangeText={setRecoveryNewPhone} style={styles.recoveryInput} />
              </> : <TextInput accessibilityLabel={recoveryCopy.codeLabel} autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} placeholder={recoveryCopy.codePlaceholder} value={recoveryCode} onChangeText={(value) => setRecoveryCode(value.replace(/\D/g, ""))} style={styles.recoveryInput} />}
              {recoveryError ? <Text accessibilityRole="alert" style={styles.recoveryError}>{recoveryError}</Text> : null}
                  <View style={[styles.recoveryActions, stackRecoveryActions ? styles.recoveryActionsStacked : null]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={recoveryCopy.cancel} disabled={recoveryBusy} onPress={closeRecovery} style={[styles.recoverySecondary, stackRecoveryActions ? styles.recoveryActionStacked : null]}><Text style={styles.recoverySecondaryText}>{recoveryCopy.cancel}</Text></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={recoveryBusy ? recoveryCopy.checking : recoveryStage === "details" ? recoveryCopy.sendCode : recoveryCopy.requestReview} disabled={recoveryBusy || (recoveryStage === "details" ? recoveryOldPhone.trim().length < 8 || recoveryNewPhone.trim().length < 8 : recoveryCode.length !== 6)} onPress={() => void (recoveryStage === "details" ? requestRecoveryCode() : submitRecovery())} style={[styles.recoveryPrimary, stackRecoveryActions ? styles.recoveryActionStacked : null]}><Text style={styles.recoveryPrimaryText}>{recoveryBusy ? recoveryCopy.checking : recoveryStage === "details" ? recoveryCopy.sendCode : recoveryCopy.requestReview}</Text></Pressable>
              </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.backgroundWarm
  },
  safe: {
    flex: 1
  },
  flex: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: uiTheme.spacing.xxs,
    paddingBottom: uiTheme.spacing.sm,
    gap: 0
  },
  createContent: {
    justifyContent: "flex-start",
    gap: uiTheme.spacing.md
  },
  topBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.soft
  },
  brandRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs
  },
  brandMark: {
    borderRadius: 14
  },
  brandText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
    letterSpacing: -0.25
  },
  stepPill: {
    minWidth: 54,
    minHeight: 36,
    paddingHorizontal: uiTheme.spacing.sm,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.66)"
  },
  stepPillText: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textSecondary
  },
  heading: {
    paddingTop: 26
  },
  createHeading: {
    alignItems: "center",
    gap: 3,
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.xs,
    paddingBottom: 0
  },
  createHeadingCompact: {
    paddingHorizontal: uiTheme.spacing.md
  },
  createCharacterScene: {
    alignItems: "center",
    justifyContent: "center",
    height: 148,
    position: "relative",
    width: 240
  },
  createCharacterSceneCompact: {
    height: 136,
    width: 224
  },
  createCharacterSceneVeryCompact: {
    height: 124,
    width: 208
  },
  createCharacterHalo: {
    backgroundColor: "rgba(255, 223, 233, 0.78)",
    borderRadius: 96,
    height: 126,
    position: "absolute",
    top: 12,
    width: 208,
    ...uiTheme.shadow.glowSubtle
  },
  createCharacterFrame: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderColor: "rgba(255,255,255,0.96)",
    borderRadius: 102,
    borderWidth: 1,
    height: 136,
    position: "absolute",
    top: 6,
    width: 226,
    ...uiTheme.shadow.soft
  },
  createCharacterHome: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: uiTheme.colors.glassBorder,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    position: "absolute",
    right: 4,
    top: 8,
    width: 30,
    zIndex: 2,
    ...uiTheme.shadow.soft
  },
  createHeadingTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  createHeadingBody: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    textAlign: "center"
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12
  },
  eyebrowSpark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C65378",
    transform: [{ rotate: "45deg" }],
    ...uiTheme.shadow.glowSubtle
  },
  eyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primaryDeep,
    letterSpacing: 1.4
  },
  title: {
    color: uiTheme.colors.textPrimary,
    fontFamily: "Inter_900Black",
    fontWeight: "900",
    fontSize: 36,
    letterSpacing: -1.5,
    maxWidth: 350
  },
  body: {
    color: uiTheme.colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    fontWeight: "400",
    maxWidth: 350,
    marginTop: uiTheme.spacing.sm
  },
  progressRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 20,
    marginHorizontal: 2
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.62)"
  },
  progressTrackActive: {
    backgroundColor: uiTheme.colors.actionDark,
    ...uiTheme.shadow.glowSubtle
  },
  formCard: {
    gap: uiTheme.spacing.sm,
    marginTop: 18,
    padding: 18,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.46)",
    borderColor: "rgba(255,255,255,0.84)",
    ...uiTheme.shadow.deep
  },
  formCardCompact: {
    marginTop: 14,
    padding: 16
  },
  formGlassTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  formMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: phonePanel.spacing.headerGap,
    paddingBottom: 2
  },
  formMetaIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,240,246,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    ...uiTheme.shadow.soft
  },
  formMetaCopy: {
    flex: 1,
    gap: 3,
    paddingTop: 1
  },
  formMetaEyebrow: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.primaryDeep,
    fontSize: phonePanel.typography.eyebrow.fontSize,
    lineHeight: phonePanel.typography.eyebrow.lineHeight,
    letterSpacing: phonePanel.typography.eyebrow.letterSpacing
  },
  formMetaTitle: {
    color: uiTheme.colors.textPrimary,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    fontSize: phonePanel.typography.title.fontSize,
    lineHeight: phonePanel.typography.title.lineHeight,
    letterSpacing: phonePanel.typography.title.letterSpacing
  },
  stepContent: {
    gap: phonePanel.spacing.sectionGap
  },
  stepContentCompact: {
    gap: uiTheme.spacing.sm
  },
  otpField: {
    gap: uiTheme.spacing.xs
  },
  otpLabel: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textPrimary
  },
  otpInputShell: {
    minHeight: 58,
    position: "relative"
  },
  otpNativeInput: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    color: "transparent",
    opacity: 0.02
  },
  otpCells: {
    flex: 1,
    flexDirection: "row",
    gap: 7
  },
  otpCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.66)",
    borderWidth: 1.5,
    borderColor: uiTheme.colors.borderStrong
  },
  otpCellFilled: {
    backgroundColor: "rgba(255,238,246,0.86)",
    borderColor: uiTheme.colors.primarySoft
  },
  otpCellActive: {
    borderColor: uiTheme.colors.primary,
    ...uiTheme.shadow.glowSubtle
  },
  otpDigit: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary
  },
  otpError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk,
    paddingHorizontal: 2
  },
  phoneLabel: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textPrimary,
    fontSize: phonePanel.typography.fieldLabel.fontSize,
    lineHeight: phonePanel.typography.fieldLabel.lineHeight,
    letterSpacing: phonePanel.typography.fieldLabel.letterSpacing
  },
  phoneControl: {
    minHeight: phonePanel.spacing.fieldControlMinHeight,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong,
    backgroundColor: "rgba(255,255,255,0.88)",
    overflow: "hidden",
    ...uiTheme.shadow.soft
  },
  phoneControlError: {
    borderColor: uiTheme.colors.danger,
    backgroundColor: "rgba(255,248,249,0.94)"
  },
  phoneDivider: {
    width: 1,
    height: 28,
    backgroundColor: uiTheme.colors.divider
  },
  phoneInput: {
    flex: 1,
    minHeight: phonePanel.spacing.fieldControlMinHeight,
    paddingHorizontal: 14,
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.bodyMedium,
    fontSize: phonePanel.typography.fieldValue.fontSize,
    lineHeight: phonePanel.typography.fieldValue.lineHeight,
    letterSpacing: phonePanel.typography.fieldValue.letterSpacing
  },
  phoneError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk,
    paddingHorizontal: 2
  },
  phoneHint: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    paddingHorizontal: 4,
    textAlign: "center",
    fontSize: phonePanel.typography.helper.fontSize,
    lineHeight: phonePanel.typography.helper.lineHeight,
    letterSpacing: phonePanel.typography.helper.letterSpacing
  },
  sentCard: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    padding: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.md,
    backgroundColor: uiTheme.colors.successSoft,
    borderWidth: 1,
    borderColor: "rgba(58,192,138,0.22)"
  },
  sentIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)"
  },
  sentCopy: {
    flex: 1,
    gap: 1
  },
  sentTitle: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.successInk
  },
  sentNumber: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.successInk
  },
  changeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  changeButtonText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.successInk
  },
  resendButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.sm
  },
  resendText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep
  },
  errorBox: {
    flexDirection: "row",
    gap: uiTheme.spacing.sm,
    alignItems: "center",
    borderRadius: uiTheme.radius.md,
    padding: uiTheme.spacing.sm,
    backgroundColor: uiTheme.colors.dangerSoft
  },
  error: {
    flex: 1,
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.dangerInk
  },
  submitWrap: {
    borderRadius: 20,
    overflow: "hidden",
    ...uiTheme.shadow.glowSubtle
  },
  submit: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.lg
  },
  submitLabelRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.sm,
    position: "relative"
  },
  submitText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF"
  },
  submitArrowBubble: {
    position: "absolute",
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  disabled: {
    opacity: uiTheme.opacity.disabled,
    shadowOpacity: 0
  },
  submitPressed: {
    transform: [{ scale: uiTheme.animation.scalePress }]
  },
  controlPressed: {
    opacity: 0.7
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: phonePanel.spacing.privacyTop,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(233,223,232,0.82)",
    backgroundColor: "rgba(255,250,252,0.72)"
  },
  privacyRowCompact: {
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  privacyIcon: {
    alignItems: "center",
    height: phonePanel.typography.privacy.lineHeight,
    justifyContent: "center",
    width: 14
  },
  privacyText: {
    color: uiTheme.colors.textSecondary,
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: phonePanel.typography.privacy.fontSize,
    fontWeight: "400",
    lineHeight: phonePanel.typography.privacy.lineHeight,
    letterSpacing: phonePanel.typography.privacy.letterSpacing
  },
  recoveryLink: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  recoveryLinkText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep,
    textDecorationLine: "underline"
  },
  recoveryBackdrop: {
    flex: 1,
    backgroundColor: "rgba(45, 22, 37, 0.42)"
  },
  recoveryKeyboard: {
    flex: 1,
    justifyContent: "flex-end",
    padding: uiTheme.spacing.lg
  },
  recoveryScrollContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingVertical: uiTheme.spacing.xs
  },
  recoveryCard: {
    gap: uiTheme.spacing.sm,
    padding: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.lg,
    backgroundColor: uiTheme.colors.backgroundWarm,
    ...uiTheme.shadow.deep
  },
  recoveryTitle: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary
  },
  recoveryBody: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary
  },
  recoveryInput: {
    minHeight: 52,
    borderRadius: uiTheme.radius.md,
    paddingHorizontal: uiTheme.spacing.sm,
    color: uiTheme.colors.textPrimary,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong,
    ...uiTheme.font.bodyMedium
  },
  recoveryError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk
  },
  recoveryActions: {
    flexDirection: "row",
    gap: uiTheme.spacing.sm,
    marginTop: uiTheme.spacing.xs
  },
  recoveryActionsStacked: {
    flexDirection: "column"
  },
  recoveryActionStacked: {
    flex: 0,
    width: "100%"
  },
  recoverySecondary: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTheme.radius.md,
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong
  },
  recoverySecondaryText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary
  },
  recoveryPrimary: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTheme.radius.md,
    backgroundColor: uiTheme.colors.primary
  },
  recoveryPrimaryText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF"
  },
  footerArea: {
    alignItems: "flex-start",
    gap: 0,
    marginTop: phonePanel.spacing.footerTop
  },
  footerAreaCompact: {
    gap: 4,
    marginTop: 4
  },
  termsConsent: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: phonePanel.spacing.termsTargetMinHeight,
    paddingVertical: 12,
    paddingHorizontal: 4
  },
  termsConsentCompact: {
    paddingHorizontal: 0,
    paddingVertical: 5
  },
  termsConsentText: {
    color: uiTheme.colors.textSecondary,
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 11.5,
    lineHeight: 17,
    letterSpacing: -0.1,
    marginLeft: 8
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: -8
  },
  legalRowWrapped: {
    flexWrap: "wrap",
    marginLeft: -8,
    rowGap: 2
  },
  legalPressable: {
    minHeight: phonePanel.spacing.legalTargetMinHeight,
    justifyContent: "center",
    paddingHorizontal: 8
  },
  legalLink: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.primaryDeep,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: phonePanel.typography.legal.fontSize,
    lineHeight: phonePanel.typography.legal.lineHeight,
    letterSpacing: phonePanel.typography.legal.letterSpacing,
    textDecorationLine: "underline"
  },
  legalSeparator: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    fontSize: phonePanel.typography.footer.fontSize,
    lineHeight: phonePanel.typography.footer.lineHeight,
    letterSpacing: phonePanel.typography.footer.letterSpacing
  },
  footerNote: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    fontSize: phonePanel.typography.footer.fontSize,
    lineHeight: phonePanel.typography.footer.lineHeight,
    letterSpacing: phonePanel.typography.footer.letterSpacing
  }
})
