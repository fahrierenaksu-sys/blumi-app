import { useMemo } from "react"
import { Animated, View } from "react-native"
import type { useEntranceAnimation, useSelectionTransition } from "../../../ui/animations"
import type { AccountRecoveryLocale } from "../accountRecoveryCopy"
import type { AuthEntryCopy } from "../authEntryCopy"
import {
  REGISTER_PHONE_PANEL_LAYOUT as phonePanel,
  resolveRegisterPhoneStageHeight
} from "../registerPhonePanelModel"
import { RegisterWorldHero } from "../RegisterWorldHero"
import { BlumiSetupShell } from "../setupFlow/BlumiSetupShell"
import { RegisterErrorNotice } from "./RegisterErrorNotice"
import { RegisterFormMetaRow } from "./RegisterFormMetaRow"
import { RegisterLegalLinks } from "./RegisterLegalLinks"
import { RegisterOtpEntry } from "./RegisterOtpEntry"
import { RegisterPhoneEntry } from "./RegisterPhoneEntry"
import { RegisterTermsConsent } from "./RegisterTermsConsent"
import { resolveCreatePrimaryActionLabel } from "./registerScreenModel"
import { registerStyles as styles } from "./registerStyles"
import type { RegisterFlowController } from "./useRegisterFlowController"
import type { RegisterLayout } from "./useRegisterLayout"

/**
 * Fourth onboarding step for new accounts: the shared setup shell with the
 * world hero, phone or OTP entry, the combined terms acceptance, and legal links.
 */
export function RegisterCreateView({
  authCopy,
  locale,
  register,
  layout,
  errorMessage,
  motionActive,
  formTransition,
  handoffEntrance,
  onLeave,
  onOpenPrivacy,
  onOpenTerms
}: {
  authCopy: AuthEntryCopy
  locale: AccountRecoveryLocale
  register: RegisterFlowController
  layout: RegisterLayout
  errorMessage: string | null
  motionActive: boolean
  formTransition: ReturnType<typeof useSelectionTransition>
  handoffEntrance: ReturnType<typeof useEntranceAnimation>
  onLeave: () => void
  onOpenPrivacy: () => void
  onOpenTerms: () => void
}) {
  const { setupMetrics } = layout
  const { busy, isCodeStep, flow, availability, verifiedFirebasePhone } = register
  const worldHero = useMemo(
    () => <RegisterWorldHero active={motionActive && !isCodeStep} />,
    [motionActive, isCodeStep]
  )

  return (
    <BlumiSetupShell
      backDisabled={busy}
      collapseStageOnKeyboard
      feedback={errorMessage ? (
        <RegisterErrorNotice message={errorMessage} />
      ) : null}
      motionActive={motionActive}
      onBack={() => {
        if (isCodeStep) {
          register.returnToPhoneStep()
          return
        }
        onLeave()
      }}
      onPrimaryAction={register.runPrimaryAction}
      primaryActionBusy={busy}
      primaryActionDisabled={register.primaryDisabled}
      primaryActionLabel={resolveCreatePrimaryActionLabel(isCodeStep, verifiedFirebasePhone, authCopy)}
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
          {worldHero}
        </Animated.View>
      )}
    >
      <Animated.View style={formTransition}>
        <View style={styles.stepContent}>
          <RegisterFormMetaRow authCopy={authCopy} isCodeStep={isCodeStep} />
          {isCodeStep ? (
            <RegisterOtpEntry
              authCopy={authCopy}
              busy={busy}
              containerStyle={[
                styles.stepContent,
                setupMetrics.dense ? styles.stepContentCompact : null
              ]}
              codeRequestStatus={register.codeRequestStatus}
              smsNotice={register.smsNotice}
              maskedPhoneNumber={register.maskedPhoneNumber}
              verificationCode={flow.verificationCode}
              otpFocused={register.otpFocused}
              showOtpError={register.showOtpError}
              resendCooldownSeconds={register.resendCooldownSeconds}
              onChangePhoneNumber={register.returnToPhoneStep}
              onCodeChange={register.handleCodeChange}
              onOtpFocus={register.handleOtpFocus}
              onOtpBlur={register.handleOtpBlur}
              onSubmit={register.runPrimaryAction}
              onResend={register.resendCode}
              inputRef={register.otpInputRef}
              rejectedCodeCount={register.otpErrorCount}
            />
          ) : (
            <RegisterPhoneEntry
              authCopy={authCopy}
              locale={locale}
              busy={busy}
              containerStyle={[
                styles.stepContent,
                setupMetrics.dense ? styles.stepContentCompact : null
              ]}
              selectedCountryCode={flow.selectedCountry}
              selectedCountry={register.selectedCountry}
              phoneNumber={flow.phoneNumber}
              phoneAnalysisError={register.phoneAnalysis.error}
              phoneControlInvalid={register.attemptedPrimaryAction && !availability.phoneValid}
              showPhoneError={register.showPhoneError}
              phoneInputRef={register.phoneInputRef}
              onCountrySelect={register.handleCountrySelect}
              onPhoneChange={register.handlePhoneChange}
              onPhoneBlur={register.handlePhoneBlur}
              onSubmit={register.runPrimaryAction}
            />
          )}

          <View
            style={[
              styles.footerArea,
              setupMetrics.dense ? styles.footerAreaCompact : null,
              { marginBottom: -phonePanel.spacing.footerBottomTrim }
            ]}
          >
            <RegisterTermsConsent
              authCopy={authCopy}
              termsAccepted={register.termsAccepted}
              busy={busy}
              compact={setupMetrics.dense}
              onToggle={register.toggleTermsAccepted}
            />
            <RegisterLegalLinks
              authCopy={authCopy}
              rowStyle={[
                styles.legalRow,
                setupMetrics.compact ? styles.legalRowWrapped : null
              ]}
              onOpenPrivacy={onOpenPrivacy}
              onOpenTerms={onOpenTerms}
            />
          </View>

        </View>
      </Animated.View>
    </BlumiSetupShell>
  )
}
