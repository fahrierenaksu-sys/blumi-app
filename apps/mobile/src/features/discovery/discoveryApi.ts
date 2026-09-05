import type {
  AvatarSelection,
  DiscoveryDecisionQuota,
  DiscoveryFilters,
  DiscoveryWatchRecord,
  UserProfilePrompt
} from "@blumi/contracts"
import { normalizeUserProfilePrompts } from "@blumi/contracts"
import {
  cloneAvatarSelection,
  normalizeAvatarSelection
} from "../avatarV2/avatarSelectionModel"
import {
  buildApiUrl,
  createAuthenticatedHeaders,
  requestJson
} from "../network/apiClient"
import type { BlumiMatch } from "../matches/matchRoomModel"
import {
  discoveryDecisionSchema,
  discoveryQuotaSchema,
  discoveryWatchSchema,
  serverMatchSchema
} from "./discoverySchemas"
import { SUPPORTED_MOBILE_CAPABILITIES } from "../capabilities/capabilityApi"

export type DiscoveryDecision = "like" | "pass"

export interface DiscoverProfileRecord {
  userId: string
  displayName: string
  age: number
  bio?: string
  prompts?: UserProfilePrompt[]
  distanceLabel: string
  vibeTags: string[]
  signals: string[]
  badges?: string[]
  roomHeadline?: string | null
  roomSnapshotUrl?: string | null
  avatarPresetId: string
  avatar: AvatarSelection
}

export type DeepLinkDiscoveryDecisionCapability = "mutual-like" | "view-only"

export interface DiscoverProfileResponse {
  profile: DiscoverProfileRecord
  decision: { capability: DeepLinkDiscoveryDecisionCapability }
}

export class DiscoveryProfileUnavailableError extends Error {
  constructor(message = "That profile is not available anymore.") {
    super(message)
    this.name = "DiscoveryProfileUnavailableError"
  }
}

export interface DiscoveryPageRequest {
  limit?: number
  cursor?: string
}

export interface DiscoveryPageResult {
  profiles: DiscoverProfileRecord[]
  page: {
    nextCursor: string | null
    hasMore: boolean
  }
  supply: {
    state: "healthy" | "low" | "exhausted"
    scope: "global"
  }
  quota: DiscoveryDecisionQuota
}

export interface DiscoveryDecisionRecord {
  fromUserId: string
  toUserId: string
  decision: DiscoveryDecision
  decidedAt: string
}

export interface ServerMatchRecord {
  matchId: string
  participantUserIds: [string, string]
  matchedAt: string
}

export interface DiscoveryDecisionResult {
  decision: DiscoveryDecisionRecord
  matched: boolean
  match: ServerMatchRecord | null
  quota: DiscoveryDecisionQuota
}

export class DiscoveryDecisionQuotaExhaustedError extends Error {
  readonly quota: DiscoveryDecisionQuota

  constructor(quota: DiscoveryDecisionQuota) {
    super("You’ve reached today’s Discover limit. Come back after it resets.")
    this.name = "DiscoveryDecisionQuotaExhaustedError"
    this.quota = quota
  }
}

/**
 * The server rechecks decision eligibility when a deep-linked profile action
 * is submitted. This distinguishes a stale button from a transport failure.
 */
export class DiscoveryDecisionNotEligibleError extends Error {
  constructor() {
    super("That profile is not available for a decision.")
    this.name = "DiscoveryDecisionNotEligibleError"
  }
}

export async function fetchDiscoveryWatch(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DiscoveryWatchRecord | null> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    "/v1/discover/watch",
    {
      headers: {
        ...createAuthenticatedHeaders(sessionToken),
        "x-blumi-client-capabilities": SUPPORTED_MOBILE_CAPABILITIES.join(",")
      },
      signal
    },
    fetcher
  )
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not check your Vibe Card yet."))
  }
  const watch = (payload as { watch?: unknown } | null)?.watch
  return watch === null || watch === undefined ? null : normalizeDiscoveryWatch(watch)
}

export async function activateDiscoveryWatch(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DiscoveryWatchRecord> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    "/v1/discover/watch",
    {
      method: "PUT",
      headers: createAuthenticatedHeaders(sessionToken),
      signal
    },
    fetcher
  )
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not save your Vibe Card yet."))
  }
  return normalizeDiscoveryWatch((payload as { watch?: unknown } | null)?.watch)
}

export async function cancelDiscoveryWatch(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetcher(buildApiUrl(baseHttpUrl, "/v1/discover/watch"), {
    method: "DELETE",
    headers: createAuthenticatedHeaders(sessionToken),
    signal
  })
  if (!response.ok) {
    const payload: unknown = await response.json()
    throw new Error(getApiErrorMessage(payload, "We could not cancel your Vibe Card yet."))
  }
}

export async function fetchDiscoverProfiles(
  baseHttpUrl: string,
  sessionToken: string,
  filters: DiscoveryFilters,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DiscoverProfileRecord[]> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/discover?${createDiscoveryQuery(filters).toString()}`,
    {
      headers: {
        ...createAuthenticatedHeaders(sessionToken),
        "x-blumi-client-capabilities": SUPPORTED_MOBILE_CAPABILITIES.join(",")
      },
      signal
    },
    fetcher
  )

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not refresh Discover yet."))
  }

  return normalizeDiscoverProfilesPayload(payload, baseHttpUrl)
}

export async function fetchDiscoverPage(
  baseHttpUrl: string,
  sessionToken: string,
  filters: DiscoveryFilters,
  request: DiscoveryPageRequest,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DiscoveryPageResult> {
  const query = createDiscoveryQuery(filters)
  query.set("limit", String(request.limit ?? 12))
  if (request.cursor) query.set("cursor", request.cursor)
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/discover?${query.toString()}`,
    {
      headers: {
        ...createAuthenticatedHeaders(sessionToken),
        "x-blumi-client-capabilities": SUPPORTED_MOBILE_CAPABILITIES.join(",")
      },
      signal
    },
    fetcher
  )
  if (!response.ok) {
    if (payload && typeof payload === "object" && "code" in payload &&
      (payload.code === "DISCOVERY_CURSOR_EXPIRED" || payload.code === "DISCOVERY_CURSOR_INVALID")) {
      throw new DiscoveryCursorResetError(payload.code)
    }
    if (payload && typeof payload === "object" && "code" in payload && payload.code === "DISCOVERY_REFRESH_LIMIT") {
      const seconds="retryAfterSeconds" in payload ? Number(payload.retryAfterSeconds) : 60
      throw new DiscoveryRefreshLimitError(Number.isFinite(seconds) ? Math.max(1,Math.min(1800,Math.ceil(seconds))) : 60)
    }
    throw new Error(getApiErrorMessage(payload, "We could not refresh Discover yet."))
  }
  return normalizeDiscoveryPagePayload(payload, baseHttpUrl)
}

export class DiscoveryCursorResetError extends Error {
  constructor(readonly code: "DISCOVERY_CURSOR_EXPIRED" | "DISCOVERY_CURSOR_INVALID") {
    super("Discover changed. Refreshing the list.")
  }
}
export class DiscoveryRefreshLimitError extends Error {
  readonly code="DISCOVERY_REFRESH_LIMIT"
  constructor(readonly retryAfterSeconds:number) {super("Keep browsing this list. You can refresh again shortly.")}
}

function createDiscoveryQuery(filters: DiscoveryFilters): URLSearchParams {
  const query = new URLSearchParams({
    ageMin: String(filters.ageMin),
    ageMax: String(filters.ageMax)
  })
  for (const gender of filters.genders) query.append("gender", gender)
  for (const vibe of filters.vibes) query.append("vibe", vibe)
  return query
}

export async function fetchDiscoverProfile(
  baseHttpUrl: string,
  sessionToken: string,
  userId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DiscoverProfileResponse> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/discover/${encodeURIComponent(userId)}`,
    {
      headers: {
        ...createAuthenticatedHeaders(sessionToken),
        "x-blumi-client-capabilities": SUPPORTED_MOBILE_CAPABILITIES.join(",")
      },
      signal
    },
    fetcher
  )
  if (!response.ok) {
    const message = getApiErrorMessage(
      payload,
      "That profile is not available anymore."
    )
    if (response.status === 404) {
      throw new DiscoveryProfileUnavailableError(message)
    }
    throw new Error(message)
  }
  const record = payload as { profile?: unknown; decision?: unknown } | null
  const capability = normalizeDeepLinkDecisionCapability(record?.decision)
  if (!capability) {
    throw new Error("Blumi could not read the deep-linked profile decision.")
  }
  return {
    profile: normalizeDiscoverProfileRecord(record?.profile, baseHttpUrl),
    decision: { capability }
  }
}

export async function decideDiscoverProfile(
  baseHttpUrl: string,
  sessionToken: string,
  targetUserId: string,
  decision: DiscoveryDecision,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DiscoveryDecisionResult> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/discover/${encodeURIComponent(targetUserId)}/${decision}`,
    {
      method: "POST",
      headers: createAuthenticatedHeaders(sessionToken),
      signal
    },
    fetcher
  )

  if (!response.ok) {
    const quota = normalizeQuotaErrorPayload(payload)
    if (quota) throw new DiscoveryDecisionQuotaExhaustedError(quota)
    if (isDecisionNotEligiblePayload(payload)) {
      throw new DiscoveryDecisionNotEligibleError()
    }
    throw new Error(getApiErrorMessage(payload, "That profile is not available anymore."))
  }

  return normalizeDiscoveryDecisionPayload(payload)
}

export function createMatchFromDiscoveryResult(input: {
  currentUser: { userId: string; displayName: string }
  matchedUser: { userId: string; displayName: string }
  result: DiscoveryDecisionResult
}): BlumiMatch | null {
  if (!input.result.matched || !input.result.match) return null
  return {
    id: input.result.match.matchId,
    mode: "futureBackend",
    createdAt: input.result.match.matchedAt,
    currentUser: { ...input.currentUser },
    matchedUser: { ...input.matchedUser },
    roomOwnerUserId: input.currentUser.userId,
    backendBoundary: "future-backend-adapter"
  }
}

export function normalizeDiscoverProfilesPayload(
  payload: unknown,
  baseHttpUrl?: string
): DiscoverProfileRecord[] {
  const profiles = (payload as { profiles?: unknown } | null)?.profiles
  if (!Array.isArray(profiles)) {
    throw new Error("Blumi could not read Discover profiles.")
  }
  return profiles.map((profile) => normalizeDiscoverProfileRecord(profile, baseHttpUrl))
}

export function normalizeDiscoveryPagePayload(
  payload: unknown,
  baseHttpUrl?: string
): DiscoveryPageResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("Blumi could not read the Discover page.")
  }
  const record = payload as Record<string, unknown>
  const page = record.page
  const supply = record.supply
  if (!page || typeof page !== "object" || !supply || typeof supply !== "object") {
    throw new Error("Blumi could not read the Discover page.")
  }
  const pageRecord = page as Record<string, unknown>
  const supplyRecord = supply as Record<string, unknown>
  const state = supplyRecord.state
  if (
    typeof pageRecord.hasMore !== "boolean" ||
    (pageRecord.nextCursor !== null && typeof pageRecord.nextCursor !== "string") ||
    (state !== "healthy" && state !== "low" && state !== "exhausted") ||
    supplyRecord.scope !== "global"
  ) {
    throw new Error("Blumi could not read the Discover page.")
  }
  return {
    profiles: normalizeDiscoverProfilesPayload(payload, baseHttpUrl),
    page: {
      nextCursor: pageRecord.nextCursor as string | null,
      hasMore: pageRecord.hasMore
    },
    supply: {
      state,
      scope: "global"
    },
    quota: normalizeDiscoveryDecisionQuota(record.quota)
  }
}

function normalizeQuotaErrorPayload(payload: unknown): DiscoveryDecisionQuota | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  if (record.code !== "DISCOVERY_DECISION_QUOTA_EXHAUSTED") return null
  return normalizeDiscoveryDecisionQuota(record.quota)
}

function isDecisionNotEligiblePayload(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as Record<string, unknown>).code === "DISCOVERY_DECISION_NOT_ELIGIBLE"
  )
}

function normalizeDiscoveryDecisionQuota(value: unknown): DiscoveryDecisionQuota {
  const parsed = discoveryQuotaSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error("Blumi could not read your Discover limit.")
  }
  return {
    limit: parsed.data.limit,
    extensionDecisions: parsed.data.extensionDecisions,
    used: parsed.data.used,
    remaining: parsed.data.remaining,
    resetsAt: parsed.data.resetsAt,
    rewardedAd: {
      available: parsed.data.rewardedAd.available,
      extensionDecisions: 10
    }
  }
}

function normalizeDiscoveryWatch(value: unknown): DiscoveryWatchRecord {
  const parsed = discoveryWatchSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error("Blumi could not read your Vibe Card.")
  }
  return {
    userId: parsed.data.userId,
    status: "active",
    preferences: {
      ageMin: parsed.data.preferences.ageMin,
      ageMax: parsed.data.preferences.ageMax,
      genders: [...parsed.data.preferences.genders],
      vibes: [...parsed.data.preferences.vibes]
    },
    updatedAt: parsed.data.updatedAt,
    expiresAt: parsed.data.expiresAt
  }
}

export function isDiscoveryWatchActive(
  watch: DiscoveryWatchRecord,
  now = new Date()
): boolean {
  const expiresAt = Date.parse(watch.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt > now.getTime()
}

function normalizeDiscoverProfileRecord(
  value: unknown,
  baseHttpUrl?: string
): DiscoverProfileRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Blumi could not read one Discover profile.")
  }
  const record = value as Partial<DiscoverProfileRecord>
  const avatar = normalizeAvatarSelection(record.avatar) ?? (
    typeof record.avatarPresetId === "string"
      ? { presetId: record.avatarPresetId }
      : null
  )
  if (
    typeof record.userId !== "string" ||
    typeof record.displayName !== "string" ||
    typeof record.age !== "number" ||
    (record.bio !== undefined && typeof record.bio !== "string") ||
    typeof record.distanceLabel !== "string" ||
    !Array.isArray(record.vibeTags) ||
    !record.vibeTags.every((tag) => typeof tag === "string") ||
    (record.signals !== undefined && (
      !Array.isArray(record.signals) ||
      !record.signals.every((signal) => typeof signal === "string") ||
      record.signals.length > 3
    )) ||
    !avatar
  ) {
    throw new Error("Blumi could not read one Discover profile.")
  }
  return {
    userId: record.userId,
    displayName: record.displayName,
    age: record.age,
    bio: record.bio,
    prompts: normalizeUserProfilePrompts(record.prompts),
    distanceLabel: record.distanceLabel,
    vibeTags: [...record.vibeTags],
    signals: record.signals ? [...record.signals] : record.vibeTags.slice(0, 3),
    badges: record.badges?.filter((badge): badge is string => typeof badge === "string").slice(0, 3),
    roomHeadline: typeof record.roomHeadline === "string" ? record.roomHeadline : undefined,
    roomSnapshotUrl: normalizeRoomSnapshotUrl(record.roomSnapshotUrl, baseHttpUrl),
    avatarPresetId: avatar.presetId,
    avatar: cloneAvatarSelection(avatar)
  }
}

function normalizeRoomSnapshotUrl(
  value: unknown,
  baseHttpUrl?: string
): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  if (value.startsWith("/") && baseHttpUrl) {
    return buildApiUrl(baseHttpUrl, value)
  }
  try {
    const candidate = new URL(value)
    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") {
      return undefined
    }
    if (!baseHttpUrl) return candidate.toString()
    const apiBase = new URL(baseHttpUrl)
    return candidate.origin === apiBase.origin ? candidate.toString() : undefined
  } catch {
    return undefined
  }
}

function normalizeDeepLinkDecisionCapability(
  value: unknown
): DeepLinkDiscoveryDecisionCapability | null {
  if (!value || typeof value !== "object") return null
  const capability = (value as Record<string, unknown>).capability
  return capability === "mutual-like" || capability === "view-only"
    ? capability
    : null
}

function normalizeDiscoveryDecisionPayload(payload: unknown): DiscoveryDecisionResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("Blumi could not save that Discover choice.")
  }
  const record = payload as Partial<DiscoveryDecisionResult>
  const decision = parseDiscoveryDecision(record.decision)
  if (!decision || typeof record.matched !== "boolean") {
    throw new Error("Blumi could not save that Discover choice.")
  }
  if (record.matched && record.match === null) {
    throw new Error("Blumi could not open that match yet.")
  }
  if (!record.matched && record.match !== null) {
    throw new Error("Blumi could not save that Discover choice.")
  }
  return {
    decision,
    matched: record.matched,
    match: record.matched ? normalizeServerMatchRecord(record.match) : null,
    quota: normalizeDiscoveryDecisionQuota(record.quota)
  }
}

function parseDiscoveryDecision(
  value: unknown
): DiscoveryDecisionRecord | null {
  const parsed = discoveryDecisionSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    fromUserId: parsed.data.fromUserId as string,
    toUserId: parsed.data.toUserId as string,
    decision: parsed.data.decision as DiscoveryDecision,
    decidedAt: parsed.data.decidedAt as string
  }
}

function normalizeServerMatchRecord(value: unknown): ServerMatchRecord {
  const parsed = serverMatchSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error("Blumi could not open that match yet.")
  }
  return {
    matchId: parsed.data.matchId,
    participantUserIds: [...parsed.data.participantUserIds] as [string, string],
    matchedAt: parsed.data.matchedAt
  }
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).error === "string"
  )
    ? ((payload as Record<string, unknown>).error as string)
    : fallback
}
