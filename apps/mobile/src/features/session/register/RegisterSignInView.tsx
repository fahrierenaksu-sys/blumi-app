import Ionicons from "@expo/vector-icons/Ionicons"
import { useMemo, type ReactNode } from "react"
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../../../ui/layout/PageContainer"
import type { useEntranceAnimation, useSelectionTransition } from "../../../ui/animations"
import { SoftBlobBackground } from "../../../ui/backgrounds"
import { BrandMark } from "../../../ui/brandMark"
import { GlassCard, GlassPill } from "../../../ui/glass"
import { PrimaryButton } from "../../../ui/primitives"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import type { UserAvatar } from "../../avatarV2/avatarV2.types"
import { AvatarPreview2D } from "../../avatarV2/components/AvatarPreview2D"
import {
  getAccountRecoveryCopy,
  type AccountRecoveryLocale
} from "../accountRecoveryCopy"
import type { AuthEntryCopy } from "../authEntryCopy"
import { AccountRecoveryModal } from "./AccountRecoveryModal"
import { RegisterErrorNotice } from "./RegisterErrorNotice"
import { RegisterFormMetaRow } from "./RegisterFormMetaRow"
import { RegisterLegalLinks } from "./RegisterLegalLinks"
import { RegisterOtpEntry } from "./RegisterOtpEntry"
import { RegisterPhoneEntry } from "./RegisterPhoneEntry"
import {
  resolveFallbackHeadingCopy,
  resolveSignInPrimaryActionLabel,
  type RegisterAuthIntent
} from "./registerScreenModel"
import { registerStyles as styles } from "./registerStyles"
import { useAccountRecoveryFlow } from "./useAccountRecoveryFlow"
import type { RegisterFlowController } from "./useRegisterFlowController"
import type { RegisterLayout } from "./useRegisterLayout"

/**
 * Returning-account phone sign-in: its own keyboard-avoiding scroll page with
 * a character hero, two-step progress, the phone or OTP card, account
 * recovery, and legal links. Sign-in never asks for legal re-acceptance.
 */
export function RegisterSignInView({
  authIntent,
  authCopy,
  locale,
  register,
  layout,
  errorMessage,
  motionActive,
  createFlowAvatar,
  characterHero,
  formTransition,
  handoffEntrance,
  onLeave,
  onOpenPrivacy,
  onOpenTerms
}: {
  authIntent: RegisterAuthIntent
  authCopy: AuthEntryCopy
  locale: AccountRecoveryLocale
  register: RegisterFlowController
  layout: RegisterLayout
  errorMessage: string | null
  motionActive: boolean
  createFlowAvatar?: Partial<UserAvatar> | null
  /** Rendered for the sign-in intent; any other intent gets the fallback heading. */
  characterHero: ReactNode | null
  formTransition: ReturnType<typeof useSelectionTransition>
  handoffEntrance: ReturnType<typeof useEntranceAnimation>
  onLeave: () => void
  onOpenPrivacy: () => void
  onOpenTerms: () => void
}) {
  const { setupMetrics, createHeroAvatarSize, createHeroStageHeight } = layout
  const {
    busy,
    isCodeStep,
    flow,
    availability,
    progressCurrent,
    progressTotal
  } = register
  const recoveryCopy = getAccountRecoveryCopy(locale)
  const recovery = useAccountRecoveryFlow(locale)
  const signInAvatar = useMemo(
    () => (
      <AvatarPreview2D
        animationState="idle_front"
        avatar={createFlowAvatar ?? undefined}
        showGlow={false}
        size={createHeroAvatarSize}
        stageHeight={createHeroStageHeight}
        themeTone="entry"
      />
    ),
    [createFlowAvatar, createHeroAvatarSize, createHeroStageHeight]
  )
  const fallbackHeading = resolveFallbackHeadingCopy(
    isCodeStep,
    register.codeRequestStatus,
    authCopy
  )

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
                onPress={onLeave}
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
              {characterHero ?? (
                <View
                  style={[
                    styles.createHeading,
                    setupMetrics.dense ? styles.createHeadingCompact : null
                  ]}
                >
                  <Text accessibilityRole="header" style={styles.createHeadingTitle}>
                    {fallbackHeading.title}
                  </Text>
                  <Text style={styles.createHeadingBody}>
                    {fallbackHeading.body}
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
                    {signInAvatar}
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
              <RegisterFormMetaRow authCopy={authCopy} isCodeStep={isCodeStep} />

              {isCodeStep ? (
                <RegisterOtpEntry
                  authCopy={authCopy}
                  busy={busy}
                  containerStyle={styles.stepContent}
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
                />
              ) : (
                <RegisterPhoneEntry
                  authCopy={authCopy}
                  locale={locale}
                  busy={busy}
                  containerStyle={styles.stepContent}
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

              {errorMessage ? (
                <RegisterErrorNotice message={errorMessage} />
              ) : null}

              {authIntent === "sign-in" ? <View testID="register-primary-action">
                <PrimaryButton
                  label={resolveSignInPrimaryActionLabel(
                    authIntent,
                    isCodeStep,
                    register.verifiedFirebasePhone,
                    authCopy
                  )}
                  disabled={register.primaryDisabled}
                  busy={busy}
                  onPress={register.runPrimaryAction}
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
                  onPress={recovery.openRecovery}
                  style={styles.recoveryLink}
                >
                  <Text style={styles.recoveryLinkText}>{recoveryCopy.link}</Text>
                </Pressable>
              ) : null}
              </GlassCard>
              </Animated.View>
            </Animated.View>
            <View style={styles.footerArea}>
              <RegisterLegalLinks
                authCopy={authCopy}
                rowStyle={styles.legalRow}
                onOpenPrivacy={onOpenPrivacy}
                onOpenTerms={onOpenTerms}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <AccountRecoveryModal
          recovery={recovery}
          recoveryCopy={recoveryCopy}
          stackRecoveryActions={layout.stackRecoveryActions}
        />
      </SafeAreaView>
    </View>
  )
}
