import {
  normalizeOnboardingStatus,
  normalizeSessionActor,
  type OnboardingStatus,
  type SessionActor,
  type SessionSetupStep
} from "./sessionModel"
import {
  type CapabilityMap,
  normalizeUserProfilePrompts,
  type DiscoveryPreferences,
  type ProfileGender,
  type UserProfile,
  type UserProfilePrompt
} from "@blumi/contracts"
import {
  cloneAvatarSelection,
  normalizeAvatarSelection
} from "../avatarV2/avatarSelectionModel"
import {
  normalizeAccountModeration,
  type AccountModerationState
} from "./accountModeration"

export class AccountAccessError extends Error {
  readonly moderation: AccountModerationState

  constructor(message: string, moderation: AccountModerationState) {
    super(message)
    this.name = "AccountAccessError"
    this.moderation = moderation
  }
}

export interface UpdateSessionProfileInput {
  displayName: string
  age?: number
  avatarPresetId?: string
  bio?: string
  gender?: ProfileGender
  identityGender?: ProfileGender
  discoveryPreferences?: DiscoveryPreferences
  interests?: string[]
  prompts?: UserProfilePrompt[]
  locationLat?: number
  locationLng?: number
}

export interface RegisterAccountInput {
  phoneNumber: string
  verificationCode: string
  termsAcceptance: {
    version: string
    locale: "en" | "tr"
  }
}

export interface SendVerificationCodeInput {
  phoneNumber: string
}

export interface VerifyAccountDeletionCodeInput {
  verificationCode: string
}

const VERIFICATION_CODE_REQUEST_TIMEOUT_MS = 10_000

export interface SubmitAccountRecoveryRequestInput {
  oldPhoneNumber: string
  newPhoneNumber: string
  verificationCode: string
}

export function updateSessionActorProfile(
  sessionActor: SessionActor,
  input: UpdateSessionProfileInput
): SessionActor {
  return {
    ...sessionActor,
    profile: {
      ...sessionActor.profile,
      displayName: input.displayName,
      age: input.age,
      bio: input.bio,
      gender: input.gender,
      identityGender:
        input.identityGender ?? input.gender ?? sessionActor.profile.identityGender,
      discoveryPreferences: input.discoveryPreferences
        ? {
            ...input.discoveryPreferences,
            genders: [...input.discoveryPreferences.genders],
            vibes: [...input.discoveryPreferences.vibes]
          }
        : sessionActor.profile.discoveryPreferences
          ? {
              ...sessionActor.profile.discoveryPreferences,
              genders: [...sessionActor.profile.discoveryPreferences.genders],
              vibes: [...sessionActor.profile.discoveryPreferences.vibes]
            }
          : undefined,
      interests: input.interests ? [...input.interests] : undefined,
      prompts: input.prompts
        ? input.prompts.map((prompt) => ({ ...prompt }))
        : sessionActor.profile.prompts?.map((prompt) => ({ ...prompt })),
      location:
        typeof input.locationLat === "number" &&
        typeof input.locationLng === "number"
          ? {
              lat: input.locationLat,
              lng: input.locationLng
            }
          : sessionActor.profile.location
            ? { ...sessionActor.profile.location }
            : undefined,
      avatar: sessionActor.profile.avatar.loadout
        ? cloneAvatarSelection(sessionActor.profile.avatar)
        : {
            presetId:
              input.avatarPresetId ?? sessionActor.profile.avatar.presetId
          }
    }
  }
}

function withBaseUrl(baseHttpUrl: string, path: string): string {
  const trimmed = baseHttpUrl.endsWith("/") ? baseHttpUrl.slice(0, -1) : baseHttpUrl
  return `${trimmed}${path}`
}

export async function registerAccount(
  baseHttpUrl: string,
  input: RegisterAccountInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SessionActor> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/accounts/register"), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input),
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(
      payload,
      "We could not create your account yet.",
      [input.phoneNumber, input.verificationCode]
    ))
  }

  const actor = normalizeSessionActor(payload, {
    requireExplicitIdentity: true,
    requiredMode: "production"
  })
  if (!actor || actor.session.mode !== "production") {
    throw new Error("Blumi could not finish account setup yet.")
  }
  const explicitOnboarding = normalizeOnboardingStatus(
    (payload as { session?: { onboarding?: unknown } } | null)
      ?.session?.onboarding
  )
  if (!explicitOnboarding) {
    throw new Error("Blumi could not confirm your account onboarding status.")
  }
  return actor
}

export async function sendVerificationCode(
  baseHttpUrl: string,
  input: SendVerificationCodeInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  timeoutMs = VERIFICATION_CODE_REQUEST_TIMEOUT_MS
): Promise<{ expiresAt: string }> {
  const timeoutController = new AbortController()
  const abortFromCaller = () => timeoutController.abort(signal?.reason)
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener("abort", abortFromCaller, { once: true })

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("The connection timed out. Check your connection and try again."))
      timeoutController.abort()
    }, timeoutMs)
  })
  try {
    const response = await Promise.race([
      fetcher(withBaseUrl(baseHttpUrl, "/v1/auth/send-code"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input),
        signal: timeoutController.signal
      }),
      timeout
    ])
    const payload: unknown = await Promise.race([response.json(), timeout])

    if (!response.ok) {
      throw new Error(getApiErrorMessage(
        payload,
        "We could not send that SMS code yet.",
        [input.phoneNumber]
      ))
    }

    if (
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as Record<string, unknown>).expiresAt === "string"
    ) {
      return {
        expiresAt: (payload as Record<string, unknown>).expiresAt as string
      }
    }

    throw new Error("Blumi could not confirm the SMS code window.")
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abortFromCaller)
  }
}

export async function deleteProductionAccount(
  baseHttpUrl: string,
  sessionToken: string,
  confirmationToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/account"), {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ confirmationToken }),
    signal
  })
  if (!response.ok) {
    const payload = await readJsonPayload(response)
    throw new Error(getApiErrorMessage(payload, "We could not delete your account yet."))
  }
}

export async function requestAccountDeletionChallenge(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ expiresAt: string }> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/account/deletion/challenge"), {
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}` },
    signal
  })
  const payload = await readJsonPayload(response)
  if (!response.ok || typeof (payload as { expiresAt?: unknown } | null)?.expiresAt !== "string") {
    throw new Error(getApiErrorMessage(payload, "We could not send a deletion code yet."))
  }
  return { expiresAt: (payload as { expiresAt: string }).expiresAt }
}

export async function verifyAccountDeletionCode(
  baseHttpUrl: string,
  sessionToken: string,
  input: VerifyAccountDeletionCodeInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ confirmationToken: string; expiresAt: string }> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/account/deletion/confirm"), {
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
    body: JSON.stringify(input),
    signal
  })
  const payload = await readJsonPayload(response)
  if (
    !response.ok ||
    typeof (payload as { confirmationToken?: unknown } | null)?.confirmationToken !== "string" ||
    typeof (payload as { expiresAt?: unknown } | null)?.expiresAt !== "string"
  ) {
    throw new Error(getApiErrorMessage(payload, "We could not verify that deletion code."))
  }
  return payload as { confirmationToken: string; expiresAt: string }
}

export async function requestAccountRecoveryChallenge(
  baseHttpUrl: string,
  newPhoneNumber: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ expiresAt: string }> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/account/recovery/challenge"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phoneNumber: newPhoneNumber }),
    signal
  })
  const payload = await readJsonPayload(response)
  if (!response.ok || typeof (payload as { expiresAt?: unknown } | null)?.expiresAt !== "string") {
    throw new Error(getApiErrorMessage(payload, "We could not send a recovery code yet."))
  }
  return { expiresAt: (payload as { expiresAt: string }).expiresAt }
}

export async function submitAccountRecoveryRequest(
  baseHttpUrl: string,
  input: SubmitAccountRecoveryRequestInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/account/recovery/requests"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal
  })
  const payload = await readJsonPayload(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not verify that recovery code."))
  }
}

export async function requestAccountDataExportChallenge(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ expiresAt: string }> {
  return requestAccountActionChallenge(baseHttpUrl, "/v1/account/export/challenge", sessionToken, fetcher, signal)
}

export async function verifyAccountDataExportCode(
  baseHttpUrl: string,
  sessionToken: string,
  verificationCode: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ confirmationToken: string; expiresAt: string }> {
  return verifyAccountActionCode(baseHttpUrl, "/v1/account/export/confirm", sessionToken, verificationCode, fetcher, signal)
}

export { downloadAccountDataExport } from "./accountDataExport"

export async function requestPhoneChangeCurrentChallenge(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ expiresAt: string }> {
  return requestAccountActionChallenge(
    baseHttpUrl,
    "/v1/account/phone-change/current/challenge",
    sessionToken,
    fetcher,
    signal
  )
}

export async function verifyPhoneChangeCurrentCode(
  baseHttpUrl: string,
  sessionToken: string,
  verificationCode: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ confirmationToken: string; expiresAt: string }> {
  return verifyAccountActionCode(
    baseHttpUrl,
    "/v1/account/phone-change/current/confirm",
    sessionToken,
    verificationCode,
    fetcher,
    signal
  )
}

export async function requestPhoneChangeNewNumberChallenge(
  baseHttpUrl: string,
  sessionToken: string,
  phoneNumber: string,
  currentPhoneConfirmationToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ expiresAt: string }> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, "/v1/account/phone-change/new/challenge"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        phoneNumber,
        currentPhoneConfirmationToken
      }),
      signal
    }
  )
  const payload = await readJsonPayload(response)
  if (
    !response.ok ||
    typeof (payload as { expiresAt?: unknown } | null)?.expiresAt !== "string"
  ) {
    throw new Error(
      getApiErrorMessage(payload, "We could not send a code to that phone yet.")
    )
  }
  return { expiresAt: (payload as { expiresAt: string }).expiresAt }
}

export async function verifyPhoneChangeNewNumberCode(
  baseHttpUrl: string,
  sessionToken: string,
  verificationCode: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ confirmationToken: string; expiresAt: string }> {
  return verifyAccountActionCode(
    baseHttpUrl,
    "/v1/account/phone-change/new/confirm",
    sessionToken,
    verificationCode,
    fetcher,
    signal
  )
}

export async function confirmPhoneChange(
  baseHttpUrl: string,
  sessionToken: string,
  currentPhoneConfirmationToken: string,
  newPhoneConfirmationToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, "/v1/account/phone-change/confirm"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        currentPhoneConfirmationToken,
        newPhoneConfirmationToken
      }),
      signal
    }
  )
  if (!response.ok) {
    const payload = await readJsonPayload(response)
    throw new Error(
      getApiErrorMessage(payload, "We could not change your sign-in phone yet.")
    )
  }
}

async function requestAccountActionChallenge(
  baseHttpUrl: string,
  path: string,
  sessionToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal
): Promise<{ expiresAt: string }> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, path), { method: "POST", headers: { authorization: `Bearer ${sessionToken}` }, signal })
  const payload = await readJsonPayload(response)
  if (!response.ok || typeof (payload as { expiresAt?: unknown } | null)?.expiresAt !== "string") {
    throw new Error(getApiErrorMessage(payload, "We could not send a security code yet."))
  }
  return { expiresAt: (payload as { expiresAt: string }).expiresAt }
}

async function verifyAccountActionCode(
  baseHttpUrl: string,
  path: string,
  sessionToken: string,
  verificationCode: string,
  fetcher: typeof fetch,
  signal?: AbortSignal
): Promise<{ confirmationToken: string; expiresAt: string }> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, path), {
    method: "POST", headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" }, body: JSON.stringify({ verificationCode }), signal
  })
  const payload = await readJsonPayload(response)
  if (!response.ok || typeof (payload as { confirmationToken?: unknown } | null)?.confirmationToken !== "string" || typeof (payload as { expiresAt?: unknown } | null)?.expiresAt !== "string") {
    throw new Error(getApiErrorMessage(payload, "We could not verify that security code."))
  }
  return payload as { confirmationToken: string; expiresAt: string }
}

export async function acknowledgeAccountModeration(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<AccountModerationState> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, "/v1/account/moderation/acknowledge"),
    {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}` },
      signal
    }
  )
  const payload = await readJsonPayload(response)
  const moderation = normalizeAccountModeration(
    (payload as { moderation?: unknown } | null)?.moderation
  )
  if (!response.ok || !moderation) {
    throw createSessionApiError(
      payload,
      "We could not save that acknowledgement."
    )
  }
  return moderation
}

export async function revokeProductionSession(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/auth/session"), {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${sessionToken}`
    },
    signal
  })
  if (!response.ok) {
    const payload = await readJsonPayload(response)
    throw new Error(getApiErrorMessage(payload, "We could not revoke your session yet."))
  }
}

export async function updateProductionProfile(
  baseHttpUrl: string,
  sessionToken: string,
  input: UpdateSessionProfileInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<UserProfile> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/users/me"), {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(input),
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not save your profile yet."))
  }

  return normalizeUserProfilePayload(payload)
}

export async function completeProductionOnboardingStep(
  baseHttpUrl: string,
  sessionToken: string,
  step: SessionSetupStep,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<OnboardingStatus> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, "/v1/users/me/onboarding"),
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ step }),
      signal
    }
  )
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(payload, "We could not save your setup progress yet.")
    )
  }
  const onboarding = normalizeOnboardingStatus(
    (payload as { onboarding?: unknown } | null)?.onboarding
  )
  if (!onboarding) {
    throw new Error("Blumi could not confirm your setup progress.")
  }
  return onboarding
}

export async function fetchProductionProfile(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<UserProfile> {
  const snapshot = await fetchProductionAccountSnapshot(
    baseHttpUrl,
    sessionToken,
    fetcher,
    signal
  )
  return snapshot.profile
}

export interface ProductionAccountSnapshot {
  profile: UserProfile
  onboarding: OnboardingStatus
  moderation: AccountModerationState | null
}

export async function fetchProductionAccountSnapshot(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  resolvedCapabilities?: Partial<CapabilityMap>
): Promise<ProductionAccountSnapshot> {
  const declaredCapabilities = resolvedCapabilities?.avatar_loadout_v2_read
    ? "avatar_loadout_v2_read"
    : undefined
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/users/me"), {
    headers: {
      authorization: `Bearer ${sessionToken}`,
      ...(declaredCapabilities
        ? { "x-blumi-client-capabilities": declaredCapabilities }
        : {})
    },
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw createSessionApiError(payload, "We could not refresh your profile yet.")
  }
  const onboarding = normalizeOnboardingStatus(
    (payload as { onboarding?: unknown } | null)?.onboarding
  )
  if (!onboarding) {
    throw new Error("Blumi could not confirm your account onboarding status.")
  }
  return {
    profile: normalizeUserProfilePayload(payload),
    onboarding,
    moderation: normalizeAccountModeration(
      (payload as { moderation?: unknown } | null)?.moderation
    )
  }
}

function createSessionApiError(payload: unknown, fallback: string): Error {
  const record = isRecord(payload) ? payload : null
  const code = record?.code
  const status = record?.status
  if (
    (code === "ACCOUNT_SUSPENDED" && status === "suspended") ||
    (code === "ACCOUNT_BANNED" && status === "banned")
  ) {
    const now = new Date().toISOString()
    const moderation = normalizeAccountModeration({
      status,
      updatedAt: now,
      ...(typeof record?.suspendedUntil === "string"
        ? { suspendedUntil: record.suspendedUntil }
        : {})
    })
    if (moderation) {
      return new AccountAccessError(getApiErrorMessage(payload, fallback), moderation)
    }
  }
  return new Error(getApiErrorMessage(payload, fallback))
}

function getApiErrorMessage(
  payload: unknown,
  fallback: string,
  sensitiveValues: readonly string[] = []
): string {
  const message = (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).error === "string"
  )
    ? ((payload as Record<string, unknown>).error as string)
    : fallback
  return sensitiveValues.reduce(
    (redacted, value) => value.length > 0
      ? redacted.split(value).join("[redacted]")
      : redacted,
    message
  )
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

function normalizeUserProfilePayload(payload: unknown): UserProfile {
  const profile = (payload as { profile?: unknown } | null)?.profile
  if (!profile || typeof profile !== "object") {
    throw new Error("Blumi could not read your saved profile.")
  }
  const record = profile as Partial<UserProfile>
  const avatar = record.avatar
  const normalizedAvatar = normalizeAvatarSelection(avatar)
  if (
    typeof record.userId !== "string" ||
    typeof record.displayName !== "string" ||
    (record.age !== undefined && typeof record.age !== "number") ||
    !normalizedAvatar
  ) {
    throw new Error("Blumi could not read your saved profile.")
  }
  return {
    userId: record.userId,
    displayName: record.displayName,
    age: record.age,
    bio: typeof record.bio === "string" ? record.bio : undefined,
    gender: typeof record.gender === "string" ? record.gender : undefined,
    interests: Array.isArray(record.interests)
      ? record.interests.filter((item): item is string => typeof item === "string")
      : undefined,
    prompts: normalizeUserProfilePrompts(record.prompts),
    location: normalizeProfileLocation(record.location),
    avatar: normalizedAvatar
  }
}

function normalizeProfileLocation(value: unknown): UserProfile["location"] {
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

export type { SessionActor } from "./sessionModel"
