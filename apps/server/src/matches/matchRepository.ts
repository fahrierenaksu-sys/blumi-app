import type {
  CompleteAvatarSelection,
  DiscoveryFilters,
  DiscoveryGender,
  DiscoveryDecisionQuota,
  DiscoveryWatchRecord,
  UserProfilePrompt
} from "@blumi/contracts"
import { randomUUID } from "node:crypto"
import { createInMemoryWatchAuthority, type DiscoveryWatchAuthorization } from "./discoveryWatchAuthority"

export interface DiscoveryWatchClaim extends DiscoveryWatchRecord {
  claimToken: string
  generation: string
  authorization?: DiscoveryWatchAuthorization
}
import {
  DISCOVERY_GENDERS,
  normalizeUserProfilePrompts
} from "@blumi/contracts"
import {
  createAvatarSelection,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "@blumi/domain"
import { cloneCompleteAvatarSelection } from "../avatar/avatarSelectionPersistence"

export type DiscoveryDecision = "like" | "pass"

export interface DiscoverProfileRecord {
  userId: string
  displayName: string
  age: number
  bio?: string
  prompts?: UserProfilePrompt[]
  gender?: string
  distanceLabel: string
  vibeTags: string[]
  avatar: CompleteAvatarSelection
  avatarPresetId: string
  updatedAt?: string
}

export interface DiscoveryDecisionRecord {
  fromUserId: string
  toUserId: string
  decision: DiscoveryDecision
  decidedAt: string
}

export interface PersistedDiscoveryDecision {
  decision: DiscoveryDecisionRecord | null
  created: boolean
  quota: DiscoveryDecisionQuota
}

export interface MatchRecord {
  matchId: string
  participantUserIds: [string, string]
  matchedAt: string
}

export interface MatchRepository {
  listDiscoverProfiles(
    currentUserId: string,
    filters: DiscoveryFilters,
    page?: DiscoveryRepositoryPageRequest
  ): Promise<DiscoverProfileRecord[]>
  findDiscoverProfile(userId: string): Promise<DiscoverProfileRecord | null>
  findEligibleDiscoverProfile(
    currentUserId: string,
    targetUserId: string,
    filters: DiscoveryFilters,
    currentUserGender?: DiscoveryGender
  ): Promise<DiscoverProfileRecord | null>
  saveDecision(decision: DiscoveryDecisionRecord): Promise<void>
  consumeDecisionQuota(
    decision: DiscoveryDecisionRecord,
    now: Date,
    reconsiderationOf?: string
  ): Promise<PersistedDiscoveryDecision>
  getDecisionQuota(userId: string, now: Date): Promise<DiscoveryDecisionQuota>
  findDecision(
    fromUserId: string,
    toUserId: string
  ): Promise<DiscoveryDecisionRecord | null>
  findMatchBetween(userAId: string, userBId: string): Promise<MatchRecord | null>
  createMatch(match: MatchRecord): Promise<MatchRecord>
  findDiscoveryWatch(userId: string): Promise<DiscoveryWatchRecord | null>
  claimNextDiscoveryWatch(now: Date): Promise<DiscoveryWatchClaim | null>
  restoreDiscoveryWatch(watch: DiscoveryWatchClaim): Promise<DiscoveryWatchRecord>
  completeDiscoveryWatch(watch: DiscoveryWatchClaim): Promise<boolean>
  isDiscoveryWatchClaimCurrent(watch: DiscoveryWatchClaim, now: Date): Promise<boolean>
  upsertDiscoveryWatch(watch: DiscoveryWatchRecord): Promise<DiscoveryWatchRecord>
  deleteDiscoveryWatch(userId: string): Promise<void>
}

export interface DiscoveryRepositoryPageRequest {
  offset: number
  limit: number
}

export interface InMemoryMatchStore {
  discoverProfiles: Map<string, DiscoverProfileRecord>
  targetDiscoveryGenders: Map<string, DiscoveryGender[]>
  decisions: Map<string, DiscoveryDecisionRecord>
  matches: Map<string, MatchRecord>
  discoveryWatches: Map<string, DiscoveryWatchRecord>
  watchClaims: Map<string, { token: string; expiresAt: number }>
  watchAuthority: ReturnType<typeof createInMemoryWatchAuthority>
  discoveryQuotas: Map<string, { used: number; extensionDecisions: number }>
}

export function createInMemoryMatchStore(
  profiles: DiscoverProfileRecord[] = createSeedDiscoverProfiles()
): InMemoryMatchStore {
  return {
    discoverProfiles: new Map(
      profiles.map((profile) => [profile.userId, cloneProfile(profile)])
    ),
    targetDiscoveryGenders: new Map(),
    decisions: new Map(),
    matches: new Map(),
    discoveryWatches: new Map(),
    watchClaims: new Map(),
    watchAuthority: createInMemoryWatchAuthority(),
    discoveryQuotas: new Map()
  }
}

export function createInMemoryMatchRepository(
  store: InMemoryMatchStore = createInMemoryMatchStore()
): MatchRepository {
  return {
    async listDiscoverProfiles(currentUserId, filters, page) {
      const ranked = [...store.discoverProfiles.values()]
        .filter((profile) => profile.userId !== currentUserId)
        .filter((profile) => isDecisionEligibleForDiscovery(
          store.decisions.get(decisionKey(currentUserId, profile.userId)),
          profile
        ))
        .filter((profile) => matchesDiscoveryFilters(profile, filters))
        .filter((profile) => !store.matches.has(matchKey(currentUserId, profile.userId)))
        .sort((left, right) =>
          discoveryRankScore(right, filters) - discoveryRankScore(left, filters) ||
          left.userId.localeCompare(right.userId)
        )
      const offset = page?.offset ?? 0
      const limit = page?.limit ?? ranked.length
      let resurfacedCount = 0
      const capped = ranked.filter((profile) => {
        const decision = store.decisions.get(decisionKey(currentUserId, profile.userId))
        if (decision?.decision !== "pass") return true
        resurfacedCount += 1
        return resurfacedCount === 1
      })
      return capped
        .slice(offset, offset + limit)
        .map(cloneProfile)
    },
    async findDiscoverProfile(userId) {
      const profile = store.discoverProfiles.get(userId)
      return profile && isDiscoverableProfile(profile) ? cloneProfile(profile) : null
    },
    async findEligibleDiscoverProfile(
      currentUserId,
      targetUserId,
      filters,
      currentUserGender
    ) {
      const profile = store.discoverProfiles.get(targetUserId)
      if (!profile || targetUserId === currentUserId) return null
      if (!isDiscoverableProfile(profile) || !matchesDiscoveryFilters(profile, filters)) {
        return null
      }
      if (!isDecisionEligibleForDiscovery(
        store.decisions.get(decisionKey(currentUserId, targetUserId)),
        profile
      )) {
        return null
      }
      if (store.matches.has(matchKey(currentUserId, targetUserId))) return null
      const targetGenders = store.targetDiscoveryGenders.get(targetUserId)
      if (
        targetGenders && targetGenders.length > 0 &&
        (!currentUserGender || !targetGenders.includes(currentUserGender))
      ) {
        return null
      }
      return cloneProfile(profile)
    },
    async saveDecision(decision) {
      store.decisions.set(decisionKey(decision.fromUserId, decision.toUserId), {
        ...decision
      })
    },
    async consumeDecisionQuota(decision, now, reconsiderationOf) {
      const existing = store.decisions.get(decisionKey(decision.fromUserId, decision.toUserId))
      const quota = getInMemoryDecisionQuota(store, decision.fromUserId, now)
      if (existing && existing.decidedAt !== reconsiderationOf) {
        return { decision: { ...existing }, created: false, quota }
      }
      if (quota.remaining <= 0) {
        return { decision: null, created: false, quota }
      }
      store.decisions.set(decisionKey(decision.fromUserId, decision.toUserId), {
        ...decision
      })
      const quotaKey = discoveryQuotaKey(decision.fromUserId, now)
      const current = store.discoveryQuotas.get(quotaKey) ?? {
        used: 0,
        extensionDecisions: 0
      }
      store.discoveryQuotas.set(quotaKey, { ...current, used: current.used + 1 })
      return {
        decision: { ...decision },
        created: true,
        quota: getInMemoryDecisionQuota(store, decision.fromUserId, now)
      }
    },
    async getDecisionQuota(userId, now) {
      return getInMemoryDecisionQuota(store, userId, now)
    },
    async findDecision(fromUserId, toUserId) {
      const decision = store.decisions.get(decisionKey(fromUserId, toUserId))
      return decision ? { ...decision } : null
    },
    async findMatchBetween(userAId, userBId) {
      const match = store.matches.get(matchKey(userAId, userBId))
      return match
        ? {
            ...match,
            participantUserIds: [...match.participantUserIds] as [
              string,
              string
            ]
          }
        : null
    },
    async createMatch(match) {
      const key = matchKey(match.participantUserIds[0], match.participantUserIds[1])
      const existing = store.matches.get(key)
      if (existing) return cloneMatch(existing)
      const persisted = cloneMatch(match)
      store.matches.set(key, persisted)
      return cloneMatch(persisted)
    },
    async findDiscoveryWatch(userId) {
      const watch = store.discoveryWatches.get(userId)
      return watch ? cloneDiscoveryWatch(watch) : null
    },
    async claimNextDiscoveryWatch(now) {
      const next = [...store.discoveryWatches.values()]
        .filter((watch) => Date.parse(watch.expiresAt) > now.getTime())
        .filter((watch) => (store.watchClaims.get(watch.userId)?.expiresAt ?? 0) <= now.getTime())
        .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))[0]
      if (!next) return null
      return store.watchAuthority.exclusive(next.userId, async () => {
      const current = store.discoveryWatches.get(next.userId)
      if (!current || Date.parse(current.expiresAt) <= now.getTime() ||
        (store.watchClaims.get(next.userId)?.expiresAt ?? 0) > now.getTime()) return null
      const claimToken = randomUUID()
      store.watchClaims.set(next.userId, { token: claimToken, expiresAt: now.getTime() + 60_000 })
      const generation = store.watchAuthority.generation(next.userId, Date.parse(next.expiresAt))
      return { ...cloneDiscoveryWatch(current), claimToken, generation,
        authorization: store.watchAuthority.guard(next.userId, generation,
          (at) => store.watchClaims.get(next.userId)?.token === claimToken &&
            (store.watchClaims.get(next.userId)?.expiresAt ?? 0) > at.getTime() &&
            Date.parse(store.discoveryWatches.get(next.userId)?.expiresAt ?? "") > at.getTime(),
          () => { store.watchClaims.delete(next.userId); store.discoveryWatches.delete(next.userId) }) }
      })
    },
    async restoreDiscoveryWatch(watch) {
      return store.watchAuthority.exclusive(watch.userId, async () => {
      if (store.watchClaims.get(watch.userId)?.token === watch.claimToken && store.discoveryWatches.has(watch.userId)) {
        store.watchClaims.delete(watch.userId)
        const current = store.discoveryWatches.get(watch.userId)!
        store.discoveryWatches.set(watch.userId, { ...current, updatedAt: watch.updatedAt })
      }
      return cloneDiscoveryWatch(watch)
      })
    },
    async completeDiscoveryWatch(watch) {
      return store.watchAuthority.exclusive(watch.userId, async () => {
      if (store.watchClaims.get(watch.userId)?.token !== watch.claimToken) return false
      store.watchClaims.delete(watch.userId)
      return store.discoveryWatches.delete(watch.userId)
      })
    },
    async isDiscoveryWatchClaimCurrent(watch, now) {
      const claim = store.watchClaims.get(watch.userId)
      return store.discoveryWatches.has(watch.userId) && claim?.token === watch.claimToken && claim.expiresAt > now.getTime()
    },
    async upsertDiscoveryWatch(watch) {
      return store.watchAuthority.change(watch.userId, Date.parse(watch.expiresAt), async () => {
        store.watchClaims.delete(watch.userId)
        const persisted = cloneDiscoveryWatch(watch)
        store.discoveryWatches.set(watch.userId, persisted)
        return cloneDiscoveryWatch(persisted)
      })
    },
    async deleteDiscoveryWatch(userId) {
      await store.watchAuthority.change(userId, 0, async () => {
        store.watchClaims.delete(userId)
        store.discoveryWatches.delete(userId)
      })
    }
  }
}

const DISCOVERY_DAILY_DECISION_LIMIT = 10

function getInMemoryDecisionQuota(
  store: InMemoryMatchStore,
  userId: string,
  now: Date
): import("@blumi/contracts").DiscoveryDecisionQuota {
  const current = store.discoveryQuotas.get(discoveryQuotaKey(userId, now)) ?? {
    used: 0,
    extensionDecisions: 0
  }
  const limit = DISCOVERY_DAILY_DECISION_LIMIT + current.extensionDecisions
  return {
    limit,
    extensionDecisions: current.extensionDecisions,
    used: current.used,
    remaining: Math.max(0, limit - current.used),
    resetsAt: nextUtcDay(now).toISOString(),
    rewardedAd: { available: false, extensionDecisions: 10 }
  }
}

function discoveryQuotaKey(userId: string, now: Date): string {
  return `${userId}:${now.toISOString().slice(0, 10)}`
}

function nextUtcDay(now: Date): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  ))
}

function isDecisionEligibleForDiscovery(
  decision: DiscoveryDecisionRecord | undefined,
  profile: DiscoverProfileRecord,
  nowMs = Date.now()
): boolean {
  if (!decision) return true
  if (decision.decision === "like") return false
  const decidedAtMs = new Date(decision.decidedAt).getTime()
  if (!Number.isFinite(decidedAtMs)) return false
  if (decidedAtMs <= nowMs - 30 * 24 * 60 * 60 * 1000) return true
  const updatedAtMs = profile.updatedAt ? new Date(profile.updatedAt).getTime() : Number.NaN
  return Number.isFinite(updatedAtMs) &&
    updatedAtMs > decidedAtMs &&
    decidedAtMs <= nowMs - 7 * 24 * 60 * 60 * 1000
}

function cloneDiscoveryWatch(watch: DiscoveryWatchRecord): DiscoveryWatchRecord {
  return {
    ...watch,
    preferences: {
      ...watch.preferences,
      genders: [...watch.preferences.genders],
      vibes: [...watch.preferences.vibes]
    }
  }
}

function discoveryRankScore(
  profile: DiscoverProfileRecord,
  filters: DiscoveryFilters
): number {
  const desiredVibes = new Set(filters.vibes.map((vibe) => vibe.toLowerCase()))
  const overlap = profile.vibeTags.filter((vibe) =>
    desiredVibes.has(vibe.trim().toLowerCase())
  ).length
  const sharedVibeScore = filters.vibes.length > 0
    ? Math.min(25, overlap * 12.5)
    : 0
  const qualityScore = Math.min(
    15,
    (profile.bio?.trim() ? 5 : 0) +
      Math.min(5, profile.vibeTags.length * 2) +
      (profile.prompts?.length ? 5 : 0)
  )
  return sharedVibeScore + qualityScore
}

function cloneMatch(match: MatchRecord): MatchRecord {
  return {
    ...match,
    participantUserIds: [...match.participantUserIds] as [string, string]
  }
}

export function matchKey(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join(":")
}

function decisionKey(fromUserId: string, toUserId: string): string {
  return `${fromUserId}:${toUserId}`
}

function cloneProfile(profile: DiscoverProfileRecord): DiscoverProfileRecord {
  return {
    ...profile,
    vibeTags: [...profile.vibeTags],
    prompts: normalizeUserProfilePrompts(profile.prompts),
    avatar: cloneCompleteAvatarSelection(profile.avatar)
  }
}

export function createSeedDiscoverProfiles(): DiscoverProfileRecord[] {
  const createDefaultAvatar = (): CompleteAvatarSelection =>
    createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0)
  const createDefaultMaleAvatar = (): CompleteAvatarSelection =>
    createAvatarSelection(DEFAULT_MALE_AVATAR_LOADOUT, 0)
  return [
    {
      userId: "discover_defne",
      displayName: "Defne Yildiz",
      age: 24,
      gender: "woman",
      distanceLabel: "3 km away",
      vibeTags: ["coffee dates", "slow burn", "room design"],
      avatar: createDefaultAvatar(),
      avatarPresetId: "blonde-waves"
    },
    {
      userId: "discover_yasmin",
      displayName: "Yasmin Cardoso",
      age: 26,
      gender: "woman",
      distanceLabel: "8 km away",
      vibeTags: ["creative", "music", "city walks"],
      avatar: createDefaultAvatar(),
      avatarPresetId: "sunset"
    },
    {
      userId: "discover_mira",
      displayName: "Mira Chen",
      age: 25,
      gender: "non-binary",
      distanceLabel: "12 km away",
      vibeTags: ["bookish", "cozy rooms", "night owl"],
      avatar: createDefaultAvatar(),
      avatarPresetId: "lilac"
    },
    {
      userId: "discover_elif",
      displayName: "Elif Aydin",
      age: 23,
      gender: "woman",
      distanceLabel: "Very close",
      vibeTags: ["coffee dates", "films", "city walks"],
      avatar: createDefaultAvatar(),
      avatarPresetId: "rose"
    },
    {
      userId: "discover_lina",
      displayName: "Lina Romano",
      age: 28,
      gender: "woman",
      distanceLabel: "5 km away",
      vibeTags: ["creative", "slow burn", "room design"],
      avatar: createDefaultAvatar(),
      avatarPresetId: "pearl"
    },
    {
      userId: "discover_nora",
      displayName: "Nora Patel",
      age: 26,
      gender: "woman",
      distanceLabel: "9 km away",
      vibeTags: ["bookish", "coffee dates", "music"],
      avatar: createDefaultAvatar(),
      avatarPresetId: "sage"
    },
    {
      userId: "discover_mert",
      displayName: "Mert Kaya",
      age: 25,
      gender: "man",
      distanceLabel: "2 km away",
      vibeTags: ["music", "city walks", "coffee dates"],
      avatar: createDefaultMaleAvatar(),
      avatarPresetId: "navy"
    },
    {
      userId: "discover_arda",
      displayName: "Arda Sen",
      age: 29,
      gender: "man",
      distanceLabel: "6 km away",
      vibeTags: ["films", "creative", "night owl"],
      avatar: createDefaultMaleAvatar(),
      avatarPresetId: "espresso"
    },
    {
      userId: "discover_emir",
      displayName: "Emir Acar",
      age: 24,
      gender: "man",
      distanceLabel: "Very close",
      vibeTags: ["room design", "slow burn", "bookish"],
      avatar: createDefaultMaleAvatar(),
      avatarPresetId: "sky"
    },
    {
      userId: "discover_leo",
      displayName: "Leo Martin",
      age: 27,
      gender: "man",
      distanceLabel: "11 km away",
      vibeTags: ["city walks", "music", "creative"],
      avatar: createDefaultMaleAvatar(),
      avatarPresetId: "sand"
    },
    {
      userId: "discover_deniz",
      displayName: "Deniz Aksoy",
      age: 22,
      gender: "non-binary",
      distanceLabel: "4 km away",
      vibeTags: ["bookish", "cozy rooms", "films"],
      avatar: createDefaultAvatar(),
      avatarPresetId: "berry"
    },
    {
      userId: "discover_ada",
      displayName: "Ada Flores",
      age: 27,
      gender: "non-binary",
      distanceLabel: "7 km away",
      vibeTags: ["creative", "coffee dates", "night owl"],
      avatar: createDefaultAvatar(),
      avatarPresetId: "coral"
    }
  ]
}

function matchesDiscoveryFilters(
  profile: DiscoverProfileRecord,
  filters: DiscoveryFilters
): boolean {
  if (profile.age < filters.ageMin || profile.age > filters.ageMax) return false
  if (!isDiscoverableProfile(profile)) return false

  const normalizedGender = profile.gender?.trim().toLowerCase()
  if (
    filters.genders.length > 0 &&
    (!normalizedGender || !filters.genders.some((gender) => gender === normalizedGender))
  ) {
    return false
  }

  if (filters.vibes.length === 0) return true
  const desiredVibes = new Set(filters.vibes.map((vibe) => vibe.toLowerCase()))
  return profile.vibeTags.some((vibe) => desiredVibes.has(vibe.trim().toLowerCase()))
}

function isDiscoverableProfile(profile: DiscoverProfileRecord): boolean {
  const normalizedGender = profile.gender?.trim().toLowerCase()
  return typeof normalizedGender === "string" &&
    (DISCOVERY_GENDERS as readonly string[]).includes(normalizedGender)
}
