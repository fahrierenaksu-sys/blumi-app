import {
  getNextPreAuthOnboardingRoute,
  type PreAuthOnboardingDraft,
  type PreAuthOnboardingRoute
} from "./preAuthOnboardingDraft"

export type PreAuthOnboardingResumeStep = "profile" | "avatar" | "room" | "phone"

export const PRE_AUTH_ONBOARDING_DRAFT_STORAGE_VERSION = 2 as const
export const PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY =
  "blumi.mobile.pre_auth_onboarding_draft.v2"
export const PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY =
  "blumi.mobile.pre_auth_onboarding_draft.v1"
export const PRE_AUTH_ONBOARDING_DRAFT_SCOPE_PREFIX =
  "preauth-onboarding-draft"

export interface PreAuthOnboardingKeyValueStore {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export interface StoredPreAuthOnboardingDraft<
  ProfileDraft = unknown,
  AvatarDraft = unknown,
  RoomDraft = unknown
> {
  readonly version: typeof PRE_AUTH_ONBOARDING_DRAFT_STORAGE_VERSION
  readonly draftId: string
  readonly scope: string
  readonly resumeStep: PreAuthOnboardingResumeStep
  readonly draft: PreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft>
}

export type PreAuthOnboardingDraftSnapshot<
  ProfileDraft = unknown,
  AvatarDraft = unknown,
  RoomDraft = unknown
> = StoredPreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft>

export interface PreAuthOnboardingDraftStorage<
  ProfileDraft = unknown,
  AvatarDraft = unknown,
  RoomDraft = unknown
> {
  load(): Promise<
    PreAuthOnboardingDraftSnapshot<ProfileDraft, AvatarDraft, RoomDraft> | null
  >
  save(
    draft: PreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft>,
    resumeStep: PreAuthOnboardingResumeStep,
    previous?: Pick<
      PreAuthOnboardingDraftSnapshot<ProfileDraft, AvatarDraft, RoomDraft>,
      "draftId"
    > | null
  ): Promise<PreAuthOnboardingDraftSnapshot<ProfileDraft, AvatarDraft, RoomDraft>>
  clear(): Promise<void>
}

interface CreatePreAuthOnboardingDraftStorageDependencies {
  readonly store: PreAuthOnboardingKeyValueStore
  readonly createDraftId?: () => string
}

export function getPreAuthOnboardingDraftScope(draftId: string): string {
  return `${PRE_AUTH_ONBOARDING_DRAFT_SCOPE_PREFIX}:${draftId}`
}

export function resolvePreAuthOnboardingDraftId(
  persistedDraftId: string | null | undefined,
  attemptId: string,
  generation: number
): string {
  return persistedDraftId ?? `${attemptId}-${generation}`
}

export function createPreAuthOnboardingDraftStorage<
  ProfileDraft = unknown,
  AvatarDraft = unknown,
  RoomDraft = unknown
>(
  dependencies: CreatePreAuthOnboardingDraftStorageDependencies
): PreAuthOnboardingDraftStorage<ProfileDraft, AvatarDraft, RoomDraft> {
  const { store } = dependencies
  const createDraftId = dependencies.createDraftId ?? createDefaultDraftId

  return {
    load: async () => {
      const rawValue = await store.getItem(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY)
      if (rawValue === null) {
        return loadAndMigrateLegacyDraft<ProfileDraft, AvatarDraft, RoomDraft>(
          store
        )
      }

      const stored = parseStoredDraft<ProfileDraft, AvatarDraft, RoomDraft>(
        rawValue
      )
      if (stored === null) {
        await store.removeItem(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY)
        return null
      }

      return toSnapshot(stored)
    },

    save: async (draft, resumeStep, previous = null) => {
      const draftId = previous?.draftId ?? createDraftId()
      if (!isValidDraftId(draftId)) {
        throw new Error("Pre-auth onboarding draft id is invalid")
      }

      const stored: StoredPreAuthOnboardingDraft<
        ProfileDraft,
        AvatarDraft,
        RoomDraft
      > = {
        version: PRE_AUTH_ONBOARDING_DRAFT_STORAGE_VERSION,
        draftId,
        scope: getPreAuthOnboardingDraftScope(draftId),
        resumeStep,
        draft
      }
      const serialized = serializeStoredDraft(stored)
      const immutableCopy = parseStoredDraft<ProfileDraft, AvatarDraft, RoomDraft>(
        serialized
      )
      if (immutableCopy === null) {
        throw new Error("Pre-auth onboarding draft is structurally invalid")
      }

      await store.setItem(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY, serialized)
      return toSnapshot(immutableCopy)
    },

    clear: async () => {
      await store.removeItem(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY)
      await store.removeItem(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY)
    }
  }
}

function createDefaultDraftId(): string {
  const timestamp = Date.now().toString(36)
  const entropy = Math.random().toString(36).slice(2, 12)
  return `${timestamp}-${entropy}`
}

function serializeStoredDraft(stored: StoredPreAuthOnboardingDraft): string {
  try {
    return JSON.stringify(stored)
  } catch {
    throw new Error("Pre-auth onboarding draft could not be serialized")
  }
}

function parseStoredDraft<ProfileDraft, AvatarDraft, RoomDraft>(
  rawValue: string
): StoredPreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft> | null {
  let candidate: unknown
  try {
    candidate = JSON.parse(rawValue)
  } catch {
    return null
  }

  if (!isPlainRecord(candidate)) return null
  if (candidate.version !== PRE_AUTH_ONBOARDING_DRAFT_STORAGE_VERSION) return null
  if (!isValidDraftId(candidate.draftId)) return null
  if (candidate.scope !== getPreAuthOnboardingDraftScope(candidate.draftId)) {
    return null
  }
  if (!isPreAuthOnboardingResumeStep(candidate.resumeStep)) return null
  if (!isStructurallyValidDraft(candidate.draft)) return null

  return candidate as unknown as StoredPreAuthOnboardingDraft<
    ProfileDraft,
    AvatarDraft,
    RoomDraft
  >
}

function isValidDraftId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !value.includes(":")
  )
}

function isPreAuthOnboardingResumeStep(
  value: unknown
): value is PreAuthOnboardingResumeStep {
  return (
    value === "profile" ||
    value === "avatar" ||
    value === "room" ||
    value === "phone"
  )
}

function isStructurallyValidDraft(
  value: unknown
): value is PreAuthOnboardingDraft {
  if (!isPlainRecord(value)) return false
  return (
    isNullableRecord(value.profile) &&
    isNullableRecord(value.avatar) &&
    isNullableRecord(value.room)
  )
}

function isNullableRecord(value: unknown): boolean {
  return value === null || isPlainRecord(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function toSnapshot<ProfileDraft, AvatarDraft, RoomDraft>(
  stored: StoredPreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft>
): PreAuthOnboardingDraftSnapshot<ProfileDraft, AvatarDraft, RoomDraft> {
  return { ...stored }
}

interface LegacyStoredPreAuthOnboardingDraft<
  ProfileDraft,
  AvatarDraft,
  RoomDraft
> {
  readonly version: 1
  readonly draftId: string
  readonly scope: string
  readonly resumeRoute?: PreAuthOnboardingRoute
  readonly draft: PreAuthOnboardingDraft<ProfileDraft, AvatarDraft, RoomDraft>
}

async function loadAndMigrateLegacyDraft<ProfileDraft, AvatarDraft, RoomDraft>(
  store: PreAuthOnboardingKeyValueStore
): Promise<
  PreAuthOnboardingDraftSnapshot<ProfileDraft, AvatarDraft, RoomDraft> | null
> {
  const rawValue = await store.getItem(
    PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY
  )
  if (rawValue === null) return null

  const legacy = parseLegacyStoredDraft<ProfileDraft, AvatarDraft, RoomDraft>(
    rawValue
  )
  if (legacy === null) {
    await store.removeItem(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY)
    return null
  }

  const stored: StoredPreAuthOnboardingDraft<
    ProfileDraft,
    AvatarDraft,
    RoomDraft
  > = {
    version: PRE_AUTH_ONBOARDING_DRAFT_STORAGE_VERSION,
    draftId: legacy.draftId,
    scope: legacy.scope,
    resumeStep: migrateLegacyResumeRoute(
      legacy.resumeRoute ?? getNextPreAuthOnboardingRoute(legacy.draft)
    ),
    draft: legacy.draft
  }
  const serialized = serializeStoredDraft(stored)
  await store.setItem(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_KEY, serialized)
  await store.removeItem(PRE_AUTH_ONBOARDING_DRAFT_STORAGE_LEGACY_KEY)
  return toSnapshot(stored)
}

function parseLegacyStoredDraft<ProfileDraft, AvatarDraft, RoomDraft>(
  rawValue: string
): LegacyStoredPreAuthOnboardingDraft<
  ProfileDraft,
  AvatarDraft,
  RoomDraft
> | null {
  let candidate: unknown
  try {
    candidate = JSON.parse(rawValue)
  } catch {
    return null
  }

  if (!isPlainRecord(candidate) || candidate.version !== 1) return null
  if (!isValidDraftId(candidate.draftId)) return null
  if (candidate.scope !== getPreAuthOnboardingDraftScope(candidate.draftId)) {
    return null
  }
  if (!isStructurallyValidDraft(candidate.draft)) return null
  if (
    candidate.resumeRoute !== undefined &&
    candidate.resumeRoute !== "profile" &&
    candidate.resumeRoute !== "avatar" &&
    candidate.resumeRoute !== "room" &&
    candidate.resumeRoute !== "register"
  ) {
    return null
  }

  return candidate as unknown as LegacyStoredPreAuthOnboardingDraft<
    ProfileDraft,
    AvatarDraft,
    RoomDraft
  >
}

function migrateLegacyResumeRoute(
  route: PreAuthOnboardingRoute
): PreAuthOnboardingResumeStep {
  return route === "register" ? "phone" : route
}
