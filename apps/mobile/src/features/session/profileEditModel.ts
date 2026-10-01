import type { UpdateSessionProfileInput } from "./sessionApi"
import {
  USER_PROFILE_MAX_INTEREST_LENGTH,
  USER_PROFILE_MAX_INTERESTS,
  USER_PROFILE_MAX_PROMPTS,
  USER_PROFILE_MAX_PROMPT_ANSWER_LENGTH,
  USER_PROFILE_PROMPT_OPTIONS,
  PROFILE_GENDERS,
  type DiscoveryPreferences,
  type DiscoveryRadiusKm,
  type ProfileGender,
  type UserProfilePrompt
} from "@blumi/contracts"

const ALLOWED_PROFILE_GENDERS = new Set<ProfileGender>(PROFILE_GENDERS)
const EMPTY_PROFILE_PROMPTS: readonly UserProfilePrompt[] = []

export interface ProfileEditCurrent {
  displayName: string
  age?: number
  bio?: string
  gender?: string
  identityGender?: string
  discoveryPreferences?: DiscoveryPreferences
  interests?: readonly string[]
  prompts?: readonly UserProfilePrompt[]
}

export type ProfilePromptError =
  | "too-many"
  | "duplicate"
  | "unknown"
  | "empty"
  | "too-long"

export function analyzeProfilePrompts(
  prompts: readonly UserProfilePrompt[]
): { prompts: UserProfilePrompt[]; error: ProfilePromptError | null; valid: boolean } {
  const normalized = prompts.map((prompt) => ({
    promptId: prompt.promptId,
    answer: prompt.answer.trim().replace(/\s+/g, " ")
  }))
  const allowedIds = new Set(
    USER_PROFILE_PROMPT_OPTIONS.map((option) => option.promptId)
  )
  let error: ProfilePromptError | null = null
  if (normalized.length > USER_PROFILE_MAX_PROMPTS) error = "too-many"
  else if (new Set(normalized.map((prompt) => prompt.promptId)).size !== normalized.length) {
    error = "duplicate"
  } else if (normalized.some((prompt) => !allowedIds.has(prompt.promptId))) {
    error = "unknown"
  } else if (normalized.some((prompt) => !prompt.answer)) error = "empty"
  else if (normalized.some(
    (prompt) => prompt.answer.length > USER_PROFILE_MAX_PROMPT_ANSWER_LENGTH
  )) error = "too-long"
  return { prompts: normalized, error, valid: error === null }
}

export interface ProfileEditDraft {
  displayName: string
  ageText: string
  bio: string
  gender: string
  interestsText: string
  prompts?: readonly UserProfilePrompt[]
  discoveryGenders?: readonly ProfileGender[]
  radiusKm?: DiscoveryRadiusKm
}

export interface ProfileEditAnalysis {
  ageValid: boolean
  genderValid: boolean
  hasChanges: boolean
  interestError: "too-long" | "too-many" | null
  interests: string[]
  interestsValid: boolean
  nameValid: boolean
  promptError: ProfilePromptError | null
  prompts: UserProfilePrompt[]
  promptsValid: boolean
  discoveryPreferencesValid: boolean
  update: UpdateSessionProfileInput
  valid: boolean
}

export interface ProfileInterestAnalysis {
  interests: string[]
  error: "too-long" | "too-many" | null
  valid: boolean
}

export interface ProfileEditDraftAnalysisInput {
  current: ProfileEditCurrent
  draft: ProfileEditDraft
}

export interface ProfileEditDraftMemoDependencies {
  analyzeInterests: typeof analyzeProfileInterests
  analyzePrompts: typeof analyzeProfilePrompts
}

export function analyzeProfileEditDraft(
  input: ProfileEditDraftAnalysisInput
): ProfileEditAnalysis {
  return analyzeProfileEditDraftWithParts(
    input,
    analyzeProfileInterests(input.draft.interestsText),
    analyzeProfilePrompts(
      input.draft.prompts ?? input.current.prompts ?? EMPTY_PROFILE_PROMPTS
    )
  )
}

export function createMemoizedProfileEditDraftAnalyzer(
  dependencies: Partial<ProfileEditDraftMemoDependencies> = {}
): (input: ProfileEditDraftAnalysisInput) => ProfileEditAnalysis {
  const analyzeInterests = dependencies.analyzeInterests ?? analyzeProfileInterests
  const analyzePrompts = dependencies.analyzePrompts ?? analyzeProfilePrompts
  let hasInterests = false
  let previousInterestsText = ""
  let cachedInterestAnalysis: ProfileInterestAnalysis = {
    interests: [],
    error: null,
    valid: true
  }
  let hasPrompts = false
  let previousPromptInput: readonly UserProfilePrompt[] | undefined
  let cachedPromptAnalysis: ReturnType<typeof analyzeProfilePrompts> = {
    prompts: [],
    error: null,
    valid: true
  }

  return (input) => {
    if (!hasInterests || input.draft.interestsText !== previousInterestsText) {
      previousInterestsText = input.draft.interestsText
      cachedInterestAnalysis = analyzeInterests(input.draft.interestsText)
      hasInterests = true
    }

    const promptInput = input.draft.prompts ?? input.current.prompts
    if (!hasPrompts || promptInput !== previousPromptInput) {
      previousPromptInput = promptInput
      cachedPromptAnalysis = analyzePrompts(promptInput ?? EMPTY_PROFILE_PROMPTS)
      hasPrompts = true
    }

    return analyzeProfileEditDraftWithParts(
      input,
      {
        ...cachedInterestAnalysis,
        interests: [...cachedInterestAnalysis.interests]
      },
      {
        ...cachedPromptAnalysis,
        prompts: cachedPromptAnalysis.prompts.map((prompt) => ({ ...prompt }))
      }
    )
  }
}

function analyzeProfileEditDraftWithParts(
  input: ProfileEditDraftAnalysisInput,
  interestAnalysis: ProfileInterestAnalysis,
  promptAnalysis: ReturnType<typeof analyzeProfilePrompts>
): ProfileEditAnalysis {
  const displayName = input.draft.displayName.trim()
  const normalizedAgeText = input.draft.ageText.trim()
  const age = /^\d{1,2}$/.test(normalizedAgeText)
    ? Number.parseInt(normalizedAgeText, 10)
    : Number.NaN
  const bio = input.draft.bio.trim()
  const gender = input.draft.gender.trim()
  const interests = interestAnalysis.interests
  const nameValid = displayName.length >= 2 && displayName.length <= 30
  const ageValid = Number.isInteger(age) && age >= 18 && age <= 99
  const genderValid = ALLOWED_PROFILE_GENDERS.has(gender as ProfileGender)
  const identityGender = gender as ProfileGender
  const includesIdentityGender = input.current.identityGender !== undefined
  const includesDiscoveryPreferences =
    input.current.discoveryPreferences !== undefined ||
    input.draft.discoveryGenders !== undefined ||
    input.draft.radiusKm !== undefined
  const currentDiscoveryPreferences = input.current.discoveryPreferences ?? {
    ageMin: 18,
    ageMax: 99,
    genders: [],
    vibes: [],
    radiusKm: 25
  }
  const discoveryGenders = [...new Set(
    input.draft.discoveryGenders ?? currentDiscoveryPreferences.genders
  )]
  const radiusKm = input.draft.radiusKm ?? currentDiscoveryPreferences.radiusKm
  const discoveryPreferencesValid =
    discoveryGenders.every((value) => ALLOWED_PROFILE_GENDERS.has(value)) &&
    (radiusKm === 25 || radiusKm === 50 || radiusKm === 100)
  const discoveryPreferences: DiscoveryPreferences = {
    ageMin: currentDiscoveryPreferences.ageMin,
    ageMax: currentDiscoveryPreferences.ageMax,
    genders: discoveryGenders,
    vibes: [...currentDiscoveryPreferences.vibes],
    radiusKm
  }
  const interestError = interestAnalysis.error
  const interestsValid = interestAnalysis.valid
  const includesPrompts =
    input.draft.prompts !== undefined || input.current.prompts !== undefined
  const update: UpdateSessionProfileInput = {
    displayName,
    ...(ageValid ? { age } : {}),
    bio,
    ...(genderValid ? { gender: gender as ProfileGender } : {}),
    ...(genderValid && includesIdentityGender ? { identityGender } : {}),
    ...(includesDiscoveryPreferences && discoveryPreferencesValid
      ? { discoveryPreferences }
      : {}),
    interests,
    ...(includesPrompts ? { prompts: promptAnalysis.prompts } : {})
  }
  const currentInterests = normalizeCurrentInterests(input.current.interests)
  const hasChanges =
    displayName !== input.current.displayName.trim() ||
    (ageValid ? age !== input.current.age : normalizedAgeText !== String(input.current.age ?? "")) ||
    bio !== (input.current.bio ?? "").trim() ||
    gender !== (input.current.gender ?? "").trim() ||
    (includesIdentityGender && gender !== (input.current.identityGender ?? "").trim()) ||
    (includesDiscoveryPreferences && !areDiscoveryPreferencesEqual(
      discoveryPreferences,
      currentDiscoveryPreferences
    )) ||
    !areStringArraysEqual(interests, currentInterests) ||
    (includesPrompts && !areProfilePromptsEqual(
      promptAnalysis.prompts,
      input.current.prompts ?? []
    ))

  return {
    ageValid,
    genderValid,
    hasChanges,
    interestError,
    interests,
    interestsValid,
    nameValid,
    promptError: promptAnalysis.error,
    prompts: promptAnalysis.prompts,
    promptsValid: promptAnalysis.valid,
    discoveryPreferencesValid,
    update,
    valid:
      nameValid &&
      ageValid &&
      genderValid &&
      discoveryPreferencesValid &&
      interestsValid &&
      promptAnalysis.valid
  }
}

function areDiscoveryPreferencesEqual(
  left: DiscoveryPreferences,
  right: DiscoveryPreferences
): boolean {
  return left.ageMin === right.ageMin &&
    left.ageMax === right.ageMax &&
    left.radiusKm === right.radiusKm &&
    areStringArraysEqual(left.genders, right.genders) &&
    areStringArraysEqual(left.vibes, right.vibes)
}

function areProfilePromptsEqual(
  left: readonly UserProfilePrompt[],
  right: readonly UserProfilePrompt[]
): boolean {
  return left.length === right.length && left.every((prompt, index) =>
    prompt.promptId === right[index]?.promptId &&
    prompt.answer === right[index]?.answer.trim().replace(/\s+/g, " ")
  )
}

export function parseProfileInterests(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r\n|\r|\n/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  ]
}

/** Adds one typed entry (several when separated by commas) to the chip list. */
export function addProfileInterests(value: string, entry: string): string {
  const added = entry.split(/[,\r\n]/).map((item) => item.trim()).filter((item) => item.length > 0)
  return parseProfileInterests([value, ...added].join("\n")).join("\n")
}

export function removeProfileInterest(value: string, interest: string): string {
  return parseProfileInterests(value).filter((item) => item !== interest).join("\n")
}

/** Back, swipe-back or replace asks before unsaved edits are thrown away (DSC-9). */
export function shouldConfirmProfileEditExit(input: { hasChanges: boolean; isSaving: boolean; saved: boolean }): boolean {
  return input.hasChanges && !input.isSaving && !input.saved
}

export function analyzeProfileInterests(value: string): ProfileInterestAnalysis {
  const interests = parseProfileInterests(value)
  const error = getProfileInterestError(interests)
  return { interests, error, valid: error === null }
}

function getProfileInterestError(
  interests: readonly string[]
): ProfileEditAnalysis["interestError"] {
  if (interests.length > USER_PROFILE_MAX_INTERESTS) return "too-many"
  if (interests.some((interest) =>
    interest.length > USER_PROFILE_MAX_INTEREST_LENGTH
  )) return "too-long"
  return null
}

function normalizeCurrentInterests(interests: readonly string[] | undefined): string[] {
  return [...new Set((interests ?? []).map((item) => item.trim()).filter(Boolean))]
}

function areStringArraysEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
