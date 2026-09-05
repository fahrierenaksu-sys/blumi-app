import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { MyAvatar } from "../ui/myAvatar"
import { SoftBlobBackground } from "../ui/backgrounds"
import { LinearGradient } from "../ui/linearGradient"
import { ActionButtonCircle, TopBar } from "../ui/primitives"
import { uiTheme } from "../ui/theme"
import { hapticMedium } from "../ui/haptics"
import type { UpdateSessionProfileInput } from "../features/session/sessionApi"
import { analyzeProfileEditDraft } from "../features/session/profileEditModel"
import {
  USER_PROFILE_MAX_INTEREST_LENGTH,
  USER_PROFILE_MAX_INTERESTS,
  USER_PROFILE_MAX_PROMPT_ANSWER_LENGTH,
  USER_PROFILE_MAX_PROMPTS,
  USER_PROFILE_PROMPT_OPTIONS,
  PROFILE_GENDERS,
  type DiscoveryGender,
  type DiscoveryPreferences,
  type DiscoveryRadiusKm,
  type ProfileGender,
  type UserProfilePrompt,
  type UserProfilePromptId
} from "@blumi/contracts"

type ProfileEditScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "ProfileEdit"
> & {
  currentDisplayName: string
  currentAge: number | undefined
  currentBio?: string
  currentGender?: string
  currentIdentityGender?: ProfileGender
  currentDiscoveryPreferences?: DiscoveryPreferences
  currentAvatarBodyId?: string
  currentInterests?: string[]
  currentPrompts?: UserProfilePrompt[]
  currentUserId: string
  onSave: (input: UpdateSessionProfileInput) => Promise<void>
}

const GENDER_OPTIONS = PROFILE_GENDERS

function formatGenderLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function ProfileEditScreen(props: ProfileEditScreenProps) {
  const {
    navigation,
    currentDisplayName,
    currentAge,
    currentBio,
    currentGender,
    currentIdentityGender,
    currentDiscoveryPreferences,
    currentAvatarBodyId,
    currentInterests,
    currentPrompts,
    currentUserId,
    onSave
  } = props
  const [displayName, setDisplayName] = useState(currentDisplayName)
  const [ageText, setAgeText] = useState(
    currentAge ? String(currentAge) : ""
  )
  const [bio, setBio] = useState(currentBio ?? "")
  const [gender, setGender] = useState(currentIdentityGender ?? currentGender ?? "")
  const [discoveryGenders, setDiscoveryGenders] = useState<DiscoveryGender[]>(
    () => [...(currentDiscoveryPreferences?.genders ?? [])]
  )
  const [radiusKm, setRadiusKm] = useState<DiscoveryRadiusKm>(
    currentDiscoveryPreferences?.radiusKm ?? 25
  )
  const [interestsText, setInterestsText] = useState(
    (currentInterests ?? []).join("\n")
  )
  const [prompts, setPrompts] = useState<UserProfilePrompt[]>(
    () => (currentPrompts ?? []).map((prompt) => ({ ...prompt }))
  )
  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveScaleAnim = useRef(new Animated.Value(1)).current
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const profileAnalysis = useMemo(
    () => analyzeProfileEditDraft({
      current: {
        displayName: currentDisplayName,
        age: currentAge,
        bio: currentBio,
        gender: currentGender,
        identityGender: currentIdentityGender,
        discoveryPreferences: currentDiscoveryPreferences,
        interests: currentInterests,
        prompts: currentPrompts
      },
      draft: {
        displayName,
        ageText,
        bio,
        gender,
        interestsText,
        prompts,
        discoveryGenders,
        radiusKm
      }
    }),
    [
      ageText,
      bio,
      currentAge,
      currentBio,
      currentDisplayName,
      currentGender,
      currentIdentityGender,
      currentDiscoveryPreferences,
      currentInterests,
      currentPrompts,
      displayName,
      gender,
      discoveryGenders,
      interestsText,
      prompts,
      radiusKm
    ]
  )
  const {
    ageValid,
    genderValid,
    hasChanges,
    interestError,
    interests,
    nameValid,
    promptError,
    update,
    valid
  } = profileAnalysis
  const togglePrompt = useCallback((promptId: UserProfilePromptId) => {
    setPrompts((current) => {
      const selected = current.some((prompt) => prompt.promptId === promptId)
      if (selected) return current.filter((prompt) => prompt.promptId !== promptId)
      if (current.length >= USER_PROFILE_MAX_PROMPTS) return current
      return [...current, { promptId, answer: "" }]
    })
  }, [])
  const updatePromptAnswer = useCallback(
    (promptId: UserProfilePromptId, answer: string) => {
      setPrompts((current) => current.map((prompt) =>
        prompt.promptId === promptId ? { ...prompt, answer } : prompt
      ))
    },
    []
  )
  const canSave = valid && !saved && !isSaving
  const isTurkish = Intl.DateTimeFormat().resolvedOptions().locale
    .toLowerCase()
    .startsWith("tr")
  const discoveryCopy = isTurkish
    ? {
        audience: "Kiminle tanışmak istiyorum",
        everyone: "Herkes",
        radius: "Arama alanı",
        character: "Karakter gövdesi",
        characterHelp: "Kimliğinden bağımsızdır. Görünüşünü Avatar Stüdyosu’nda değiştirebilirsin.",
        editCharacter: "Avatar Stüdyosu’nda düzenle"
      }
    : {
        audience: "Who I’d like to meet",
        everyone: "Everyone",
        radius: "Search area",
        character: "Character frame",
        characterHelp: "Separate from your identity. Change your look in Avatar Studio.",
        editCharacter: "Edit in Avatar Studio"
      }

  const toggleDiscoveryGender = useCallback((option: DiscoveryGender) => {
    setDiscoveryGenders((current) => current.includes(option)
      ? current.filter((value) => value !== option)
      : [...current, option])
  }, [])

  const handleSave = useCallback(async () => {
    if (!canSave || !hasChanges) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await onSave(update)
      hapticMedium()
      setSaved(true)
      setTimeout(() => {
        if (isMountedRef.current) navigation.goBack()
      }, 600)
    } catch {
      setSaveError("We could not save that yet. Your profile is still safe.")
    } finally {
      setIsSaving(false)
    }
  }, [
    canSave,
    hasChanges,
    navigation,
    onSave,
    update
  ])

  const handleSavePressIn = () => {
    Animated.spring(saveScaleAnim, {
      toValue: uiTheme.animation.scalePress,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handleSavePressOut = () => {
    Animated.spring(saveScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.springBouncy,
    }).start()
  }

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView
        contentGutter
        style={styles.safe}
        edges={["top", "left", "right", "bottom"]}
      >
        <TopBar
          title="Edit Profile"
          titleAlign="start"
          leftSlot={
            <ActionButtonCircle accessibilityLabel="Go back" onPress={() => navigation.goBack()} size={40}>
              <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
            </ActionButtonCircle>
          }
        />

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.previewCard}>
            <LinearGradient
              colors={uiTheme.gradients.heroBackground as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.previewGlow} pointerEvents="none" />
            <MyAvatar
              name={displayName || "?"}
              seed={currentUserId}
              size={110}
              ring="strong"
            />
            <Text style={styles.previewName}>
              {displayName || "Your Name"}
            </Text>
            <Text style={styles.previewHint}>
              This is the name people see first.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>About me</Text>

          {/* Fields */}
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>Display name</Text>
            <TextInput
              accessibilityLabel="Display name"
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="What should people call you?"
              placeholderTextColor={uiTheme.colors.textMuted}
              maxLength={30}
              autoCapitalize="words"
              autoCorrect={false}
            />
            {!nameValid ? (
              <ValidationError message="Use a name from 2 to 30 characters" />
            ) : null}
          </View>

          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput
              accessibilityLabel="Age"
              style={styles.input}
              value={ageText}
              onChangeText={setAgeText}
              placeholder="18-99"
              placeholderTextColor={uiTheme.colors.textMuted}
              keyboardType="number-pad"
              maxLength={2}
            />
            {!ageValid ? (
              <ValidationError message="Use an age from 18 to 99" />
            ) : null}
            <Text style={styles.fieldHint}>
              Keep it simple. Your avatar and room add the personality.
            </Text>
          </View>

          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              accessibilityLabel="Bio"
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="A quick line about your vibe"
              placeholderTextColor={uiTheme.colors.textMuted}
              maxLength={160}
              multiline
            />
          </View>

          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>My identity</Text>
            <View accessibilityRole="radiogroup" style={styles.segmentRow}>
              {GENDER_OPTIONS.map((option) => {
                const selected = gender === option
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityLabel={`${formatGenderLabel(option)} gender`}
                    accessibilityState={{ selected }}
                    onPress={() => setGender(option)}
                    style={[
                      styles.segmentButton,
                      selected ? styles.segmentButtonSelected : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        selected ? styles.segmentTextSelected : null
                      ]}
                    >
                      {formatGenderLabel(option)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            {!genderValid ? (
              <ValidationError message="Choose one option to keep your profile complete" />
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>{discoveryCopy.audience}</Text>
          <View style={styles.fieldCard}>
            <View style={styles.segmentRow}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={discoveryCopy.everyone}
                accessibilityState={{ checked: discoveryGenders.length === 0 }}
                onPress={() => setDiscoveryGenders([])}
                style={[
                  styles.segmentButton,
                  discoveryGenders.length === 0 ? styles.segmentButtonSelected : null
                ]}
              >
                <Text style={[
                  styles.segmentText,
                  discoveryGenders.length === 0 ? styles.segmentTextSelected : null
                ]}>{discoveryCopy.everyone}</Text>
              </Pressable>
              {GENDER_OPTIONS.map((option) => {
                const selected = discoveryGenders.includes(option)
                return (
                  <Pressable
                    key={`discovery-${option}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={formatGenderLabel(option)}
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggleDiscoveryGender(option)}
                    style={[
                      styles.segmentButton,
                      selected ? styles.segmentButtonSelected : null
                    ]}
                  >
                    <Text style={[
                      styles.segmentText,
                      selected ? styles.segmentTextSelected : null
                    ]}>{formatGenderLabel(option)}</Text>
                  </Pressable>
                )
              })}
            </View>
            <Text style={styles.fieldLabel}>{discoveryCopy.radius}</Text>
            <View style={styles.segmentRow}>
              {([25, 50, 100] as const).map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option} km ${discoveryCopy.radius}`}
                  accessibilityState={{ selected: radiusKm === option }}
                  onPress={() => setRadiusKm(option)}
                  style={[
                    styles.segmentButton,
                    radiusKm === option ? styles.segmentButtonSelected : null
                  ]}
                >
                  <Text style={[
                    styles.segmentText,
                    radiusKm === option ? styles.segmentTextSelected : null
                  ]}>{option} km</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={styles.sectionTitle}>{discoveryCopy.character}</Text>
          <View style={styles.fieldCard}>
            <Text style={styles.characterValue}>
              {formatCharacterBodyLabel(currentAvatarBodyId)}
            </Text>
            <Text style={styles.fieldHint}>{discoveryCopy.characterHelp}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={discoveryCopy.editCharacter}
              onPress={() => navigation.navigate("WardrobeV2")}
              style={styles.characterButton}
            >
              <Text style={styles.characterButtonText}>{discoveryCopy.editCharacter}</Text>
            </Pressable>
          </View>

          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>Interests</Text>
            <TextInput
              accessibilityLabel="Interests, one interest per line"
              style={[styles.input, styles.interestsInput]}
              value={interestsText}
              onChangeText={setInterestsText}
              placeholder={"coffee\nfilms\nlive music"}
              placeholderTextColor={uiTheme.colors.textMuted}
              autoCapitalize="none"
              multiline
            />
            {interests.length > 0 ? (
              <View style={styles.interestRow}>
                {interests.map((interest) => (
                  <View key={interest} style={styles.interestChip}>
                    <Text style={styles.interestChipText}>{interest}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {interestError ? (
              <ValidationError
                message={
                  interestError === "too-many"
                    ? `Choose up to ${USER_PROFILE_MAX_INTERESTS} interests`
                    : `Keep each interest to ${USER_PROFILE_MAX_INTEREST_LENGTH} characters or fewer`
                }
              />
            ) : (
              <Text style={styles.fieldHint}>
                One interest per line · {interests.length} / {USER_PROFILE_MAX_INTERESTS}
              </Text>
            )}
          </View>

          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>Conversation starters</Text>
            <Text style={styles.fieldHint}>
              Choose up to {USER_PROFILE_MAX_PROMPTS}. Your own words only.
            </Text>
            <View style={styles.promptOptionList}>
              {USER_PROFILE_PROMPT_OPTIONS.map((option) => {
                const selected = prompts.find(
                  (prompt) => prompt.promptId === option.promptId
                )
                return (
                  <View key={option.promptId} style={styles.promptOption}>
                    <Pressable
                      accessibilityLabel={`Toggle conversation starter: ${option.question}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: Boolean(selected) }}
                      onPress={() => togglePrompt(option.promptId)}
                      style={[
                        styles.promptChoice,
                        selected ? styles.promptChoiceSelected : null
                      ]}
                    >
                      <Text style={styles.promptChoiceText}>{option.question}</Text>
                      <Ionicons
                        name={selected ? "checkmark" : "add"}
                        size={20}
                        color={uiTheme.colors.primary}
                      />
                    </Pressable>
                    {selected ? (
                      <TextInput
                        accessibilityLabel={`Answer: ${option.question}`}
                        style={[styles.input, styles.promptAnswerInput]}
                        value={selected.answer}
                        onChangeText={(answer) =>
                          updatePromptAnswer(option.promptId, answer)
                        }
                        placeholder="Write a short, real answer"
                        placeholderTextColor={uiTheme.colors.textMuted}
                        maxLength={USER_PROFILE_MAX_PROMPT_ANSWER_LENGTH}
                        multiline
                      />
                    ) : null}
                  </View>
                )
              })}
            </View>
            {promptError ? (
              <ValidationError message={
                promptError === "empty"
                  ? "Answer each selected prompt or remove it"
                  : "Choose up to two different prompts with short answers"
              } />
            ) : null}
          </View>

          {saveError ? (
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={styles.saveError}
            >
              {saveError}
            </Text>
          ) : null}

          {/* Save */}
          <Animated.View style={[styles.saveWrap, { transform: [{ scale: saveScaleAnim }] }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                saved
                  ? "Profile saved"
                  : isSaving
                    ? "Saving profile"
                    : "Save profile"
              }
              accessibilityState={{ disabled: !canSave || !hasChanges }}
              onPress={handleSave}
              onPressIn={handleSavePressIn}
              onPressOut={handleSavePressOut}
              disabled={!canSave || !hasChanges}
              style={[
                styles.saveButton,
                (!canSave || !hasChanges) ? styles.saveButtonDisabled : null,
              ]}
            >
              <LinearGradient
                colors={
                  canSave && hasChanges
                    ? uiTheme.gradients.primary as [string, string]
                    : [uiTheme.colors.primaryDisabled, uiTheme.colors.primaryDisabled]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveButtonGradient}
              >
                <Text style={styles.saveButtonText}>
                  {saved ? "Saved" : isSaving ? "Saving..." : "Save profile"}
                </Text>
                {saved ? (
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                ) : null}
              </LinearGradient>
            </Pressable>
          </Animated.View>
          {saved ? (
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={styles.saveStatus}
            >
              Profile saved
            </Text>
          ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

function ValidationError({ message }: { message: string }) {
  return (
    <View
      accessible
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={styles.errorRow}
    >
      <Ionicons name="ellipse" size={6} color={uiTheme.colors.danger} />
      <Text style={styles.errorHint}>{message}</Text>
    </View>
  )
}

function formatCharacterBodyLabel(bodyId: string | undefined): string {
  if (!bodyId) return "Default"
  const label = bodyId
    .replace(/^avatar_v2_body_/, "")
    .replace(/_/g, " ")
    .trim()
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Default"
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background,
  },
  safe: {
    flex: 1,
    paddingTop: uiTheme.spacing.sm,
  },
  content: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: uiTheme.spacing.md,
    paddingBottom: uiTheme.spacing.xxl,
  },
  previewCard: {
    borderRadius: uiTheme.radius.xl,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    padding: uiTheme.spacing.xl,
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    overflow: "hidden",
    position: "relative",
    ...uiTheme.shadow.deep,
  },
  previewGlow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: uiTheme.colors.avatarAccent,
    top: -80,
  },
  previewName: {
    ...uiTheme.font.title,
    color: uiTheme.colors.textPrimary,
    fontSize: 26,
  },
  previewHint: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
    lineHeight: 18,
    textAlign: "center",
  },
  fieldCard: {
    gap: uiTheme.spacing.xs,
    padding: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.soft,
  },
  sectionTitle: {
    ...uiTheme.font.title,
    color: uiTheme.colors.textPrimary,
    fontSize: 20,
    marginTop: uiTheme.spacing.sm
  },
  characterValue: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
    textTransform: "capitalize"
  },
  characterButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.primarySoft,
    borderWidth: 1,
    borderColor: uiTheme.colors.primary
  },
  characterButtonText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.primaryDeep
  },
  fieldLabel: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
  },
  input: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.textPrimary,
    paddingVertical: uiTheme.spacing.xs,
    borderBottomWidth: 1.5,
    borderBottomColor: uiTheme.colors.border,
  },
  bioInput: {
    minHeight: 82,
    textAlignVertical: "top",
  },
  interestsInput: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  promptOptionList: {
    gap: uiTheme.spacing.sm,
  },
  promptOption: {
    gap: uiTheme.spacing.xs,
  },
  promptChoice: {
    minHeight: 44,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    backgroundColor: uiTheme.colors.glassStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm,
  },
  promptChoiceSelected: {
    borderColor: uiTheme.colors.primary,
    backgroundColor: uiTheme.colors.primarySoft,
  },
  promptChoiceText: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.textPrimary,
    flex: 1,
  },
  promptAnswerInput: {
    minHeight: 64,
    textAlignVertical: "top",
    paddingHorizontal: uiTheme.spacing.sm,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs,
  },
  segmentButton: {
    minHeight: 36,
    paddingHorizontal: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    backgroundColor: uiTheme.colors.glassStrong,
  },
  segmentButtonSelected: {
    borderColor: uiTheme.colors.primary,
    backgroundColor: uiTheme.colors.primarySoft,
  },
  segmentText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textMuted,
  },
  segmentTextSelected: {
    color: uiTheme.colors.primary,
  },
  interestRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs,
  },
  interestChip: {
    paddingHorizontal: uiTheme.spacing.sm,
    paddingVertical: 5,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.secondary,
  },
  interestChipText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textSecondary,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  errorHint: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.danger,
    fontWeight: "700",
  },
  fieldHint: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    lineHeight: 18,
  },
  saveError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.danger,
    fontWeight: "700",
    textAlign: "center",
  },
  saveStatus: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.successInk,
    fontWeight: "700",
    textAlign: "center",
  },
  saveWrap: {
    alignSelf: "center",
    marginTop: uiTheme.spacing.sm,
  },
  saveButton: {
    borderRadius: uiTheme.radius.full,
    overflow: "hidden",
    ...uiTheme.shadow.glow,
  },
  saveButtonGradient: {
    paddingHorizontal: uiTheme.spacing.xxl,
    paddingVertical: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs,
  },
  saveButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
  },
  saveButtonText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
  },
})
