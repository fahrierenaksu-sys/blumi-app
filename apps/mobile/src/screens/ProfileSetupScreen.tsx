import Ionicons from "@expo/vector-icons/Ionicons"
import { useMemo, useState } from "react"
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import { BlumiSetupShell } from "../features/session/setupFlow/BlumiSetupShell"
import {
  AVATAR_V2_CATALOG,
  DEFAULT_AVATAR_V2
} from "../features/avatarV2/avatarV2.mock"
import {
  applyOnboardingStarterBody,
  getOnboardingStarterBodyId
} from "../features/avatarV2/avatarStarterModel"
import { ProfileCharacterReactionStage } from "../features/session/ProfileCharacterReactionStage"
import { resolveAccountRecoveryLocale } from "../features/session/accountRecoveryCopy"
import { getNativeAppLocale } from "../features/session/authLocale"
import { getProfileSetupCopy } from "../features/session/profileSetupCopy"
import { getProfileSetupLayoutMetrics } from "../features/session/profileSetupLayout"
import {
  getProfileSetupInitialGender,
  PROFILE_SETUP_VISUAL
} from "../features/session/profileSetupVisualModel"
import type { UpdateSessionProfileInput } from "../features/session/sessionApi"
import type { SessionActor } from "../features/session/sessionModel"
import { FieldInput } from "../ui/fieldInput"
import { hapticLight } from "../ui/haptics"
import { blumiEntryTheme as uiTheme } from "../ui/theme"
import {
  useOnboardingHardwareBack,
  useOnboardingSignOut
} from "./components/onboardingScreenActions"
import { isProfileGender } from "@blumi/contracts"

export type ProfileSetupMode = "first-completion" | "review"

export interface ProfileSetupScreenProps {
  initialProfile: Pick<
    SessionActor["profile"],
    "displayName" | "age" | "gender" | "avatar"
  >
  mode: ProfileSetupMode
  isSubmitting: boolean
  errorMessage: string | null
  onComplete: (input: UpdateSessionProfileInput) => Promise<void>
  onBack?: () => void
  onSignOut: () => Promise<void>
  motionActive?: boolean
}

export function ProfileSetupScreen({
  initialProfile,
  mode,
  isSubmitting,
  errorMessage,
  onComplete,
  onBack,
  onSignOut,
  motionActive = true
}: ProfileSetupScreenProps) {
  const locale = resolveAccountRecoveryLocale(
    getNativeAppLocale(),
    Intl.DateTimeFormat().resolvedOptions().locale
  )
  const copy = getProfileSetupCopy(locale)
  const genderOptions = [
    { value: "woman", label: copy.woman, icon: "female" },
    { value: "man", label: copy.man, icon: "male" }
  ] as const
  const { fontScale, height, width } = useWindowDimensions()
  const [displayName, setDisplayName] = useState(
    initialProfile.displayName
  )
  const [ageText, setAgeText] = useState(
    initialProfile.age ? String(initialProfile.age) : ""
  )
  const [gender, setGender] = useState(
    getProfileSetupInitialGender(initialProfile.gender)
  )
  const { busy, requestSignOut } = useOnboardingSignOut(
    onSignOut,
    isSubmitting
  )
  const age = Number.parseInt(ageText, 10)
  const selectedGender = isProfileGender(gender) ? gender : undefined
  const normalizedNameLength = displayName.trim().length
  const nameValid = normalizedNameLength >= 2 && normalizedNameLength <= 30
  const ageValid = Number.isFinite(age) && age >= 18 && age <= 99
  const canSubmit = useMemo(
    () => nameValid && ageValid && Boolean(selectedGender) && !busy,
    [ageValid, busy, nameValid, selectedGender]
  )
  const layout = useMemo(
    () => getProfileSetupLayoutMetrics(height, width, fontScale),
    [fontScale, height, width]
  )
  const previewAvatar = useMemo(
    () => applyOnboardingStarterBody(
      initialProfile.avatar.loadout ?? DEFAULT_AVATAR_V2,
      getOnboardingStarterBodyId(gender),
      AVATAR_V2_CATALOG
    ),
    [gender, initialProfile.avatar.loadout]
  )
  const validationMessage = errorMessage ?? (
    displayName.length > 0 && !nameValid
      ? copy.useTwoToThirtyCharacters
      : ageText.length > 0 && !ageValid
        ? copy.ageRangeError
        : null
  )
  const ctaLabel = mode === "review" ? copy.saveChanges : copy.continueToCharacter

  useOnboardingHardwareBack(onBack ?? requestSignOut, busy)

  return (
    <BlumiSetupShell
      backDisabled={busy}
      collapseHeadingOnKeyboard
      collapseStageOnKeyboard
      description={copy.subtitle}
      feedback={validationMessage ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={styles.error}
        >
          {validationMessage}
        </Text>
      ) : null}
      motionActive={motionActive}
      onBack={onBack ?? requestSignOut}
      onPrimaryAction={() => {
        if (!selectedGender) return
        void onComplete({
          displayName: displayName.trim(),
          age,
          gender: selectedGender
        }).catch(() => undefined)
      }}
      primaryActionBusy={isSubmitting}
      primaryActionDisabled={!canSubmit}
      primaryActionLabel={ctaLabel}
      primaryActionTestID="profile-setup-submit"
      title={copy.title}
      taskCardMinHeight={layout.compact ? 0 : PROFILE_SETUP_VISUAL.formMinHeight}
      taskCardTone="default"
      stage={(
        <ProfileCharacterReactionStage
          compact={layout.compact}
          displayName={displayName}
          avatar={previewAvatar}
          gender={selectedGender}
          motionActive={motionActive}
        />
      )}
      step="profile"
    >
      <View
        style={[
          styles.form,
          {
            gap: layout.formGap,
            paddingHorizontal: layout.horizontalPadding,
            paddingVertical: layout.verticalPadding
          }
        ]}
      >
        <View style={[styles.identityBlock, { gap: layout.contentGap }]}>
          <View
            style={[
              styles.identityRow,
              layout.stackIdentityFields ? styles.identityRowStacked : null
            ]}
          >
            <FieldInput
              accessibilityLabel={copy.displayName}
              label={copy.displayName}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={copy.displayNamePlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
              icon="person-outline"
              editable={!busy}
              maxLength={30}
              containerStyle={
                layout.stackIdentityFields
                  ? styles.fullWidthField
                  : styles.nameField
              }
            />
            <FieldInput
              accessibilityLabel={copy.age}
              label={copy.age}
              value={ageText}
              onChangeText={(value) =>
                setAgeText(value.replace(/[^0-9]/g, "").slice(0, 2))
              }
              placeholder="18+"
              keyboardType="number-pad"
              icon="calendar-outline"
              editable={!busy}
              containerStyle={
                layout.stackIdentityFields ? styles.fullWidthField : styles.ageField
              }
            />
          </View>
          <View accessible accessibilityRole="text" style={styles.identityHint}>
            <Ionicons
              accessible={false}
              color={uiTheme.colors.textSecondary}
              name="information-circle-outline"
              size={16}
            />
            <Text style={styles.namePrivacyHint}>{copy.publicNameHint}</Text>
          </View>
        </View>
        <View style={styles.genderField}>
          <View
            style={[
              styles.genderHeadingRow,
              layout.wrapGenderOptions ? styles.genderHeadingRowStacked : null
            ]}
          >
            <Text style={styles.genderLabel}>{copy.gender}</Text>
            <Text numberOfLines={1} style={styles.genderHint}>
              {copy.genderChangeHint}
            </Text>
          </View>
          <View
            accessibilityLabel={copy.gender}
            accessibilityRole="radiogroup"
            style={[
              styles.genderRow,
              layout.wrapGenderOptions ? styles.genderRowStacked : null
            ]}
          >
            {genderOptions.map((option) => {
              const selected = gender === option.value
              return (
                <Pressable
                  key={option.value}
                  accessibilityLabel={option.label}
                  accessibilityRole="radio"
                  accessibilityState={{ disabled: busy, selected }}
                  disabled={busy}
                  onPress={() => {
                    if (gender === option.value) return
                    hapticLight()
                    setGender(option.value)
                  }}
                  style={({ pressed }) => [
                    styles.genderOption,
                    selected ? styles.genderOptionSelected : null,
                    pressed ? styles.genderOptionPressed : null
                  ]}
                >
                  {selected ? (
                    <View style={styles.selectedIndicator}>
                      <Ionicons
                        accessible={false}
                        color="#FFFFFF"
                        name="checkmark"
                        size={14}
                      />
                    </View>
                  ) : null}
                    <Ionicons
                      accessible={false}
                      name={option.icon}
                      size={PROFILE_SETUP_VISUAL.genderIconSize}
                      color={selected ? uiTheme.colors.actionDark : uiTheme.colors.textSecondary}
                    />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.genderOptionText,
                      selected ? styles.genderOptionTextSelected : null
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>
    </BlumiSetupShell>
  )
}

const styles = StyleSheet.create({
  form: {
    flexGrow: 1,
    justifyContent: "flex-start"
  },
  identityBlock: {
    gap: uiTheme.spacing.xs
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: uiTheme.spacing.sm
  },
  identityRowStacked: {
    flexDirection: "column"
  },
  nameField: {
    flex: 1
  },
  ageField: {
    width: PROFILE_SETUP_VISUAL.ageFieldWidth
  },
  fullWidthField: {
    width: "100%"
  },
  namePrivacyHint: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    flex: 1,
    flexShrink: 1,
    textAlign: "left"
  },
  identityHint: {
    alignItems: "flex-start",
    alignSelf: "stretch",
    flexDirection: "row",
    gap: uiTheme.spacing.xxs,
    justifyContent: "flex-start",
    marginBottom: uiTheme.spacing.sm,
    marginTop: uiTheme.spacing.xxs,
    maxWidth: "100%",
    paddingHorizontal: 0,
    paddingVertical: uiTheme.spacing.xs
  },
  genderField: {
    gap: uiTheme.spacing.sm,
    marginTop: uiTheme.spacing.xxs
  },
  genderHeadingRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: uiTheme.spacing.sm,
    justifyContent: "space-between"
  },
  genderHeadingRowStacked: {
    alignItems: "flex-start",
    flexDirection: "column"
  },
  genderLabel: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textPrimary
  },
  genderHint: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    flexShrink: 1,
    textAlign: "right"
  },
  genderRow: {
    flexDirection: "row",
    gap: uiTheme.spacing.sm
  },
  genderRowStacked: {
    flexDirection: "column"
  },
  genderOption: {
    flex: 1,
    minHeight: PROFILE_SETUP_VISUAL.genderOptionMinHeight,
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    backgroundColor: "rgba(255,255,255,0.66)",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs,
    overflow: "hidden",
    paddingHorizontal: uiTheme.spacing.sm,
    position: "relative"
  },
  genderOptionSelected: {
    borderColor: uiTheme.colors.actionDark,
    backgroundColor: "rgba(255,229,237,0.9)",
    ...uiTheme.shadow.soft
  },
  genderOptionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
  },
  genderOptionText: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textSecondary
  },
  genderOptionTextSelected: {
    color: uiTheme.colors.actionDark
  },
  selectedIndicator: {
    alignItems: "center",
    backgroundColor: uiTheme.colors.actionDark,
    borderRadius: PROFILE_SETUP_VISUAL.selectedIndicatorSize / 2,
    height: PROFILE_SETUP_VISUAL.selectedIndicatorSize,
    justifyContent: "center",
    position: "absolute",
    right: uiTheme.spacing.sm,
    top: uiTheme.spacing.sm,
    width: PROFILE_SETUP_VISUAL.selectedIndicatorSize
  },
  error: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.dangerInk,
    textAlign: "center"
  }
})
