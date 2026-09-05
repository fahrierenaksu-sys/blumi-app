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

export function analyzeProfileEditDraft(input: {
  current: ProfileEditCurrent
  draft: ProfileEditDraft
}): ProfileEditAnalysis {
  const displayName = input.draft.displayName.trim()
  const normalizedAgeText = input.draft.ageText.trim()
  const age = /^\d{1,2}$/.test(normalizedAgeText)
    ? Number.parseInt(normalizedAgeText, 10)
    : Number.NaN
  const bio = input.draft.bio.trim()
  const gender = input.draft.gender.trim()
  const interests = parseProfileInterests(input.draft.interestsText)
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
  const interestError = getProfileInterestError(interests)
  const interestsValid = interestError === null
  const promptAnalysis = analyzeProfilePrompts(
    input.draft.prompts ?? input.current.prompts ?? []
  )
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
