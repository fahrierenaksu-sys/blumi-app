import type {
  AuthSession,
  CompleteAvatarSelection,
  UserProfile
} from "@blumi/contracts"
import {
  isProfileGender,
  isReadableProfileGender,
  normalizeUserProfilePrompts
} from "@blumi/contracts"
import {
  cloneAvatarSelection,
  normalizeAvatarSelection
} from "../avatarV2/avatarSelectionModel"

export type AccountId = string
export type SessionId = string
export type SessionMode = "demo" | "production"
export type ProfileSetupStatus = "incomplete" | "complete"
export type AvatarSetupStatus = "incomplete" | "complete"
export type RoomSetupStatus = "incomplete" | "complete"
export type SessionSetupStep = "profile" | "avatar" | "room"
const ALLOWED_DISCOVERY_GENDERS = new Set(["woman", "man"])
const ALLOWED_DISCOVERY_RADIUS_KM = new Set([25, 50, 100])

export interface OnboardingStatus {
  profile: ProfileSetupStatus
  avatar: AvatarSetupStatus
  room: RoomSetupStatus
  completedAt?: string
}

export interface CurrentSession extends AuthSession {
  accountId: AccountId
  sessionId: SessionId
  mode: SessionMode
  onboarding: OnboardingStatus
}

export interface SessionActor {
  session: CurrentSession
  profile: UserProfile
}

export interface CreateDemoSessionInput {
  displayName: string
  avatarPresetId?: string
  age?: number
}

export interface CreateProductionSessionInput {
  accountId: AccountId
  sessionId: SessionId
  userId: string
  sessionToken: string
  expiresAt: string
  profile: UserProfile
}

interface NormalizeSessionActorOptions {
  requireExplicitIdentity?: boolean
  requiredMode?: SessionMode
}

export function createIncompleteOnboardingStatus(): OnboardingStatus {
  return {
    profile: "incomplete",
    avatar: "incomplete",
    room: "incomplete"
  }
}

export function createCompleteOnboardingStatus(
  completedAt = new Date().toISOString()
): OnboardingStatus {
  return {
    profile: "complete",
    avatar: "complete",
    room: "complete",
    completedAt
  }
}

export function createDemoSessionActor(
  input: CreateDemoSessionInput
): SessionActor {
  const issuedAt = Date.now()
  const accountId = `demo-account-${issuedAt}`
  const userId = `demo-user-${issuedAt}`

  return {
    session: {
      accountId,
      sessionId: `demo-session-id-${issuedAt}`,
      mode: "demo",
      onboarding: createCompleteOnboardingStatus(
        new Date(issuedAt).toISOString()
      ),
      userId,
      sessionToken: `demo-session-${issuedAt}`,
      expiresAt: new Date(issuedAt + 1000 * 60 * 60 * 24 * 30).toISOString()
    },
    profile: {
      userId,
      displayName: input.displayName,
      age: input.age,
      avatar: {
        presetId: input.avatarPresetId ?? "dusk"
      }
    }
  }
}

export function createProductionSessionActor(
  input: CreateProductionSessionInput
): SessionActor {
  return {
    session: {
      accountId: input.accountId,
      sessionId: input.sessionId,
      mode: "production",
      onboarding: createIncompleteOnboardingStatus(),
      userId: input.userId,
      sessionToken: input.sessionToken,
      expiresAt: input.expiresAt
    },
    profile: copyUserProfile(input.profile)
  }
}

export function completeSessionSetupStep(
  actor: SessionActor,
  step: SessionSetupStep,
  completedAt = new Date().toISOString()
): SessionActor {
  const nextStatus = {
    ...actor.session.onboarding,
    [step]: "complete"
  }
  const onboarding: OnboardingStatus = isOnboardingComplete(nextStatus)
    ? {
        ...nextStatus,
        completedAt: actor.session.onboarding.completedAt ?? completedAt
      }
    : {
        profile: nextStatus.profile,
        avatar: nextStatus.avatar,
        room: nextStatus.room
      }

  return {
    ...actor,
    session: {
      ...actor.session,
      onboarding
    },
    profile: copyUserProfile(actor.profile)
  }
}

export function replaceSessionActorAvatar(
  actor: SessionActor,
  selection: CompleteAvatarSelection
): SessionActor {
  return {
    ...actor,
    session: {
      ...actor.session,
      onboarding: { ...actor.session.onboarding }
    },
    profile: {
      ...copyUserProfile(actor.profile),
      avatar: cloneAvatarSelection(selection)
    }
  }
}

export function replaceSessionActorOnboarding(
  actor: SessionActor,
  onboarding: OnboardingStatus
): SessionActor {
  return {
    ...actor,
    session: {
      ...actor.session,
      onboarding: { ...onboarding }
    },
    profile: copyUserProfile(actor.profile)
  }
}

export function isOnboardingComplete(status: OnboardingStatus): boolean {
  return (
    status.profile === "complete" &&
    status.avatar === "complete" &&
    status.room === "complete"
  )
}

export function shouldApplyProductionAccountSync(
  startedAtMutationGeneration: number,
  currentMutationGeneration: number
): boolean {
  return startedAtMutationGeneration === currentMutationGeneration
}

export function normalizeStoredSessionActor(value: unknown): SessionActor | null {
  return normalizeSessionActor(value)
}

export function normalizeSessionActor(
  value: unknown,
  options: NormalizeSessionActorOptions = {}
): SessionActor | null {
  if (!value || typeof value !== "object") return null

  const candidate = value as Record<string, unknown>
  const rawSession = candidate.session
  const rawProfile = candidate.profile
  if (!rawSession || typeof rawSession !== "object") return null
  if (!rawProfile || typeof rawProfile !== "object") return null

  const session = rawSession as Record<string, unknown>
  const profile = rawProfile as Record<string, unknown>
  const avatar = profile.avatar
  if (!avatar || typeof avatar !== "object") return null
  const normalizedAvatar = normalizeAvatarSelection(avatar)

  if (
    typeof session.userId !== "string" ||
    typeof session.sessionToken !== "string" ||
    typeof session.expiresAt !== "string" ||
    typeof profile.userId !== "string" ||
    typeof profile.displayName !== "string" ||
    !normalizedAvatar
  ) {
    return null
  }
  if (session.userId !== profile.userId) return null

  const explicitMode = isSessionMode(session.mode) ? session.mode : undefined
  if (options.requiredMode && explicitMode !== options.requiredMode) {
    return null
  }
  const inferredMode = session.sessionToken.startsWith("demo-session-")
    ? "demo"
    : "production"
  if (explicitMode && explicitMode !== inferredMode) return null
  const mode = explicitMode ?? inferredMode
  if (
    options.requireExplicitIdentity &&
    (typeof session.accountId !== "string" ||
      session.accountId.length === 0 ||
      typeof session.sessionId !== "string" ||
      session.sessionId.length === 0)
  ) {
    return null
  }
  const onboarding =
    normalizeOnboardingStatus(session.onboarding) ??
    createCompleteOnboardingStatus()

  return {
    session: {
      accountId:
        typeof session.accountId === "string"
          ? session.accountId
          : session.userId,
      sessionId:
        typeof session.sessionId === "string"
          ? session.sessionId
          : session.sessionToken,
      mode,
      onboarding,
      userId: session.userId,
      sessionToken: session.sessionToken,
      expiresAt: session.expiresAt
    },
    profile: {
      userId: profile.userId,
      displayName: profile.displayName,
      age: typeof profile.age === "number" ? profile.age : undefined,
      bio: normalizeOptionalString(profile.bio),
      gender: isReadableProfileGender(profile.gender)
        ? profile.gender
        : undefined,
      identityGender: isProfileGender(profile.identityGender)
        ? profile.identityGender
        : isProfileGender(profile.gender)
          ? profile.gender
          : undefined,
      discoveryPreferences: normalizeDiscoveryPreferences(
        profile.discoveryPreferences
      ),
      interests: normalizeOptionalStringArray(profile.interests),
      prompts: normalizeUserProfilePrompts(profile.prompts),
      location: normalizeLocation(profile.location),
      avatar: normalizedAvatar
    }
  }
}

export function normalizeOnboardingStatus(value: unknown): OnboardingStatus | null {
  if (!value || typeof value !== "object") return null
  const status = value as Record<string, unknown>
  if (
    !isSetupStatus(status.profile) ||
    !isSetupStatus(status.avatar) ||
    !isSetupStatus(status.room)
  ) {
    return null
  }

  return {
    profile: status.profile,
    avatar: status.avatar,
    room: status.room,
    ...(typeof status.completedAt === "string"
      ? { completedAt: status.completedAt }
      : {})
  }
}

function isSessionMode(value: unknown): value is SessionMode {
  return value === "demo" || value === "production"
}

function isSetupStatus(value: unknown): value is "incomplete" | "complete" {
  return value === "incomplete" || value === "complete"
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === "string")
  return strings.length > 0 ? [...strings] : undefined
}

function normalizeLocation(value: unknown): UserProfile["location"] {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  if (typeof record.lat !== "number" || typeof record.lng !== "number") {
    return undefined
  }
  return {
    lat: record.lat,
    lng: record.lng
  }
}

function normalizeDiscoveryPreferences(
  value: unknown
): UserProfile["discoveryPreferences"] {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  if (
    !Number.isInteger(record.ageMin) ||
    !Number.isInteger(record.ageMax) ||
    (record.ageMin as number) < 18 ||
    (record.ageMax as number) > 99 ||
    (record.ageMin as number) > (record.ageMax as number) ||
    !Array.isArray(record.genders) ||
    !record.genders.every((gender) =>
      ALLOWED_DISCOVERY_GENDERS.has(String(gender))
    ) ||
    !Array.isArray(record.vibes) ||
    !record.vibes.every((vibe) => typeof vibe === "string") ||
    !ALLOWED_DISCOVERY_RADIUS_KM.has(Number(record.radiusKm))
  ) return undefined
  return {
    ageMin: record.ageMin as number,
    ageMax: record.ageMax as number,
    genders: [...record.genders] as ("woman" | "man")[],
    vibes: [...record.vibes] as string[],
    radiusKm: record.radiusKm as 25 | 50 | 100
  }
}

function copyUserProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    avatar: cloneAvatarSelection(profile.avatar),
    interests: profile.interests ? [...profile.interests] : undefined,
    prompts: profile.prompts?.map((prompt) => ({ ...prompt })),
    discoveryPreferences: profile.discoveryPreferences
      ? {
          ...profile.discoveryPreferences,
          genders: [...profile.discoveryPreferences.genders],
          vibes: [...profile.discoveryPreferences.vibes]
        }
      : undefined,
    location: profile.location ? { ...profile.location } : undefined
  }
}
