import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  authenticatedErrorResponses,
  coreApiJsonSchemas,
  discoverProfileParamsSchema,
  DISCOVERY_GENDERS,
  successResponseJsonSchema,
  type DiscoveryFilters,
  type DiscoveryGender
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import { createDiscoverySnapshotService, createInMemoryDiscoverySnapshots, DiscoveryCursorError, type DiscoverySnapshotService } from "../matches/discoverySnapshot"
import { DiscoveryRefreshLimitError } from "../matches/discoverySnapshot"
import type { CapabilityService } from "../capabilities/capabilityService"
import { resolveRequestCapabilities } from "../avatar/avatarReadProjection"
import { isPublicRequestError } from "../errors/publicRequestError"
import {
  DiscoveryDecisionNotEligibleError,
  DiscoveryDecisionQuotaExceededError,
  type MatchService
} from "../matches/matchService"
import type { SafetyService } from "../safety/safetyService"
import type { PersonalRoomDecorService } from "../rooms/personalRoomDecorService"
import type { RoomSnapshotService } from "../rooms/roomSnapshotService"
import type { DiscoverProfileRecord, MatchRecord } from "../matches/matchRepository"
import type { ChatService } from "../chat/chatService"
import type { ConnectionService } from "../connections/connectionService"
import type { ConnectionManager } from "../realtime/connectionManager"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"
import { createFixedWindowLimiter } from "../operations/requestLimits"
import { announceNewMatchThread } from "./matchThreadAnnouncement"
import { isRecord, resolveProductSession, schemaValidationFailed } from "./routeHelpers"

export interface DiscoverRouteServices {
  authService: AuthService
  matchService: MatchService
  discoverySnapshots?: DiscoverySnapshotService
  safetyService: SafetyService
  personalRoomDecorService?: PersonalRoomDecorService
  roomSnapshotService?: RoomSnapshotService
  capabilityService?: CapabilityService
  /** With these, a new match opens its chat and announces it to both people. */
  chatService?: ChatService
  connectionService?: ConnectionService
  connectionManager?: ConnectionManager
}

// Per verified person. The per-IP limit before authentication is only a
// coarse ceiling: many people share one carrier or office address, and an
// unverified bearer token must never choose the rate-limit key (2026-10-01).
const DISCOVER_RATE_LIMIT_MAX = 30
const DISCOVER_IP_RATE_LIMIT_MAX = 300
const DISCOVER_RATE_LIMIT_WINDOW = "1 minute"
const DISCOVER_RATE_LIMIT_WINDOW_MS = 60_000
const DISCOVER_RATE_LIMIT_MESSAGE =
  "You are refreshing Discover too quickly. Try again in a moment."

const discoverDecisionRouteSchema = {
  params: coreApiJsonSchemas.discoverProfileParams,
  response: {
    200: successResponseJsonSchema,
    ...authenticatedErrorResponses
  }
}

export async function registerDiscoverRoutes(
  app: FastifyInstance,
  services: DiscoverRouteServices
): Promise<void> {
  const {
    authService,
    matchService,
    safetyService,
    personalRoomDecorService,
    roomSnapshotService,
    capabilityService
  } = services
  const discoverUserLimiter = createFixedWindowLimiter({
    max: DISCOVER_RATE_LIMIT_MAX,
    windowMs: DISCOVER_RATE_LIMIT_WINDOW_MS
  })
  const discoverySnapshots = services.discoverySnapshots ?? createDiscoverySnapshotService(
    createInMemoryDiscoverySnapshots((userId, filters) => matchService.listDiscovery(userId, filters)))

  app.get(
    "/v1/discover",
    {
      attachValidation: true,
      config: {
        apiAuth: "bearer",
        requestValidation: "enforced",
        rateLimit: {
          max: DISCOVER_IP_RATE_LIMIT_MAX,
          timeWindow: DISCOVER_RATE_LIMIT_WINDOW,
          errorResponseBuilder: () => Object.assign(
            new Error(DISCOVER_RATE_LIMIT_MESSAGE),
            { statusCode: 429 }
          )
        }
      },
      schema: {
        querystring: coreApiJsonSchemas.discoverDeckQuery,
        response: {
          200: successResponseJsonSchema,
          ...authenticatedErrorResponses
        }
      }
    },
    async (request, reply) => {
      const resolved = await resolveProductSession({ request, reply, authService })
      if (!resolved) return
      const personLimit = discoverUserLimiter.consume(resolved.account.userId)
      if (!personLimit.allowed) {
        reply.header("Retry-After", String(personLimit.retryAfterSeconds))
        throw Object.assign(new Error(DISCOVER_RATE_LIMIT_MESSAGE), { statusCode: 429 })
      }
      const parsedFilters = parseDiscoveryFilters(
        request.query,
        resolved.account.profile.discoveryPreferences
      )
      if (!parsedFilters.ok) {
        return reply.code(400).send({ error: parsedFilters.error })
      }

      const controls = parseDiscoveryPageControls(request.query)
      if (!controls.ok) {
        return reply.code(400).send({ error: controls.error })
      }
      if (schemaValidationFailed(request)) {
        return reply.code(400).send({ error: "Choose valid Discover page options." })
      }
      let snapshotPage: Awaited<ReturnType<typeof discoverySnapshots.page>>
      let decisionQuota: Awaited<ReturnType<typeof matchService.getDecisionQuota>>
      try {
        const [pageResult, quotaResult] = await Promise.allSettled([
          discoverySnapshots.page({
            userId: resolved.account.userId, filters: parsedFilters.filters,
            limit: controls.limit, cursor: controls.cursor,
            blockedUserIds: (ids) => safetyService.listBlockedUserIdsBetween(resolved.account.userId, ids)
          }),
          matchService.getDecisionQuota(resolved.account.userId)
        ])
        // Preserve the page's established 4xx mapping even if its parallel
        // display-quota read fails first. Mutations still recheck quota server-side.
        if (pageResult.status === "rejected") throw pageResult.reason
        if (quotaResult.status === "rejected") throw quotaResult.reason
        snapshotPage = pageResult.value
        decisionQuota = quotaResult.value
      } catch (error) {
        if (error instanceof DiscoveryRefreshLimitError) return reply.code(429).header("Retry-After",error.retryAfterSeconds)
          .send({error:error.message,code:error.code,retryAfterSeconds:error.retryAfterSeconds})
        if (error instanceof DiscoveryCursorError) return reply.code(error.code === "DISCOVERY_CURSOR_EXPIRED" ? 409 : 400)
          .send({ error: error.message, code: error.code })
        throw error
      }
      const pageProfiles = snapshotPage.profiles
      // Room showcase is optional detail used only on the card's back face.
      // Keep its storage reads out of the first-page response critical path.
      const profiles = pageProfiles.map((profile) => ({
        ...profile,
        signals: buildDiscoverySignals(profile, parsedFilters.filters)
      }))
      return {
        profiles,
        page: snapshotPage.page,
        supply: {
          state: pageProfiles.length === 0
            ? "exhausted"
            : pageProfiles.length < controls.limit
              ? "low"
              : "healthy",
          scope: "global"
        },
        quota: decisionQuota
      }
    }
  )

  app.get("/v1/discover/watch", async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    return {
      watch: await matchService.getDiscoveryWatch(resolved.account.userId)
    }
  })

  app.put("/v1/discover/watch", async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const preferences = resolved.account.profile.discoveryPreferences ?? {
      ageMin: 18,
      ageMax: 99,
      genders: [],
      vibes: []
    }
    const watch = await matchService.activateDiscoveryWatch(
      resolved.account.userId,
      preferences
    )
    return reply.code(200).send({ watch })
  })

  app.delete("/v1/discover/watch", async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    await matchService.cancelDiscoveryWatch(resolved.account.userId)
    return reply.code(204).send()
  })

  app.get("/v1/discover/:userId", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: {
      params: coreApiJsonSchemas.discoverProfileParams,
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const parsedParams = discoverProfileParamsSchema.safeParse(request.params)
    const targetUserId = parsedParams.success ? parsedParams.data.userId : ""
    if (
      !targetUserId ||
      targetUserId === resolved.account.userId ||
      schemaValidationFailed(request)
    ) {
      return reply.code(404).send({ error: "That profile is not available anymore." })
    }
    if (await safetyService.hasBlockBetween(resolved.account.userId, targetUserId)) {
      return reply.code(404).send({ error: "That profile is not available anymore." })
    }
    const linkedProfile = await matchService.findProfileForViewer(
      resolved.account.userId,
      targetUserId,
      resolvePersistedDiscoveryFilters(resolved.account.profile.discoveryPreferences),
      resolveCurrentUserDiscoveryGender(
        resolved.account.profile.identityGender ?? resolved.account.profile.gender
      )
    )
    if (!linkedProfile) {
      return reply.code(404).send({ error: "That profile is not available anymore." })
    }
    return {
      ...linkedProfile,
      profile: await decorateDiscoverProfile({
        profile: linkedProfile.profile,
        request,
        personalRoomDecorService,
        roomSnapshotService,
        allowRoomShowcase:
          linkedProfile.decision.capability === "mutual-like" && (
            !capabilityService ||
            resolveRequestCapabilities(
              request,
              resolved.account.userId,
              capabilityService
            ).capabilities.discovery_room_showcase
          )
      })
    }
  })

  const { chatService, connectionService, connectionManager } = services
  const announceMatch = chatService && connectionManager
    ? (match: MatchRecord) =>
        announceNewMatchThread({
          chatService,
          authRepository: authService.repository,
          safetyService,
          connectionManager,
          connectionRepository: connectionService?.repository
        }, match)
    : undefined

  app.post("/v1/discover/:userId/like", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: discoverDecisionRouteSchema
  }, async (request, reply) => {
    return decideOnDiscoverProfile({
      request,
      reply,
      authService,
      matchService,
      safetyService,
      decision: "like",
      announceMatch
    })
  })

  app.post("/v1/discover/:userId/pass", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: discoverDecisionRouteSchema
  }, async (request, reply) => {
    return decideOnDiscoverProfile({
      request,
      reply,
      authService,
      matchService,
      safetyService,
      decision: "pass"
    })
  })
}

const DISCOVERY_PAGE_SIZE = 12
const DISCOVERY_MAX_PAGE_SIZE = 20
function parseDiscoveryPageControls(value: unknown):
  | { ok: true; cursor?: string; limit: number }
  | { ok: false; error: string } {
  const query = isRecord(value) ? value : {}
  const limit = parseIntegerQuery(query.limit, DISCOVERY_PAGE_SIZE)
  if (
    limit === null || limit < 1 || limit > DISCOVERY_MAX_PAGE_SIZE
  ) {
    return { ok: false, error: "Choose valid Discover page options." }
  }
  const cursor = query.cursor
  if (cursor !== undefined && typeof cursor !== "string") {
    return { ok: false, error: "That Discover page is no longer available." }
  }
  if (typeof cursor === "string" && cursor.length > 515) {
    return { ok: false, error: "That Discover page is no longer available." }
  }
  return { ok: true, cursor, limit }
}

function parseIntegerQuery(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback
  if (typeof value !== "string" || !/^\d{1,5}$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function buildDiscoverySignals(
  profile: { vibeTags: string[]; prompts?: unknown[]; distanceLabel: string },
  filters: DiscoveryFilters
): string[] {
  const desired = new Set(filters.vibes.map((vibe) => vibe.trim().toLowerCase()))
  const shared = profile.vibeTags
    .filter((vibe) => desired.has(vibe.trim().toLowerCase()))
    .slice(0, 2)
    .map((vibe) => `Both into ${vibe}`)
  const signals = shared.length > 0
    ? shared
    : profile.vibeTags.slice(0, 2)
  if (signals.length < 3 && profile.prompts?.length) {
    signals.push("Has a conversation starter")
  }
  return signals.slice(0, 3)
}

export async function decorateDiscoverProfile({
  profile,
  signals,
  request,
  personalRoomDecorService,
  roomSnapshotService,
  allowRoomShowcase = true
}: {
  profile: DiscoverProfileRecord
  signals?: string[]
  request: FastifyRequest
  personalRoomDecorService?: PersonalRoomDecorService
  roomSnapshotService?: RoomSnapshotService
  allowRoomShowcase?: boolean
}): Promise<Record<string, unknown>> {
  const base = signals
    ? { ...profile, signals }
    : { ...profile }
  if (!allowRoomShowcase || !personalRoomDecorService || !roomSnapshotService) {
    return base
  }

  try {
    const room = await personalRoomDecorService.get(profile.userId)
    const snapshot = await roomSnapshotService.getLatestForUser(profile.userId, room)
    if (!snapshot || !snapshot.isPublic) return base

    return {
      ...base,
      roomSnapshotUrl: buildRoomSnapshotUrl(snapshot.assetKey),
      ...(snapshot.headline ? { roomHeadline: snapshot.headline } : {})
    }
  } catch (error) {
    request.log.warn(
      { errorKind: safeOperationalErrorKind(error) },
      "Optional room showcase enrichment failed"
    )
    return base
  }
}

function buildRoomSnapshotUrl(assetKey: string): string {
  // Never reflect Host into response data. Mobile resolves this same-origin
  // path against its configured API base URL.
  return `/v1/room-showcase/${assetKey}`
}

const ALLOWED_DISCOVERY_GENDERS = new Set<DiscoveryGender>(DISCOVERY_GENDERS)

function parseDiscoveryFilters(
  value: unknown,
  defaults?: DiscoveryFilters
):
  | { ok: true; filters: DiscoveryFilters }
  | { ok: false; error: string } {
  const query = isRecord(value) ? value : {}
  const ageMin = parseAge(query.ageMin, defaults?.ageMin ?? 18)
  const ageMax = parseAge(query.ageMax, defaults?.ageMax ?? 99)
  if (ageMin === null || ageMax === null || ageMin > ageMax) {
    return { ok: false, error: "Choose an age range from 18 to 99." }
  }

  const genderValues = query.gender === undefined
    ? [...(defaults?.genders ?? [])]
    : readRepeatedQueryValue(query.gender)
  if (
    genderValues.length > ALLOWED_DISCOVERY_GENDERS.size ||
    genderValues.some((gender) =>
      !ALLOWED_DISCOVERY_GENDERS.has(gender.toLowerCase() as DiscoveryGender)
    )
  ) {
    return { ok: false, error: "Choose valid discovery genders." }
  }

  const vibeValues = query.vibe === undefined
    ? [...(defaults?.vibes ?? [])]
    : readRepeatedQueryValue(query.vibe)
  if (vibeValues.length > 8 || vibeValues.some((vibe) => vibe.length > 40)) {
    return { ok: false, error: "Choose up to 8 discovery vibes." }
  }

  return {
    ok: true,
    filters: {
      ageMin,
      ageMax,
      genders: uniqueStrings(genderValues.map((gender) => gender.toLowerCase()))
        .filter((gender): gender is DiscoveryGender =>
          ALLOWED_DISCOVERY_GENDERS.has(gender as DiscoveryGender)
        ),
      vibes: uniqueStrings(vibeValues)
    }
  }
}

function parseAge(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback
  if (typeof value !== "string" || !/^\d{1,3}$/.test(value)) return null
  const age = Number(value)
  return Number.isInteger(age) && age >= 18 && age <= 99 ? age : null
}

function readRepeatedQueryValue(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return values
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().replace(/\s+/g, " "))
    .filter(Boolean)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

async function decideOnDiscoverProfile({
  request,
  reply,
  authService,
  matchService,
  safetyService,
  decision,
  announceMatch
}: {
  request: FastifyRequest
  reply: FastifyReply
  authService: AuthService
  matchService: MatchService
  safetyService: SafetyService
  decision: "like" | "pass"
  announceMatch?: (match: MatchRecord) => Promise<unknown>
}) {
  const resolved = await resolveProductSession({ request, reply, authService })
  if (!resolved) return

  const parsedParams = discoverProfileParamsSchema.safeParse(request.params)
  const targetUserId = parsedParams.success ? parsedParams.data.userId : ""
  if (!targetUserId || schemaValidationFailed(request)) {
    return reply.code(400).send({ error: "Choose a profile first." })
  }
  if (await safetyService.hasBlockBetween(resolved.account.userId, targetUserId)) {
    return reply.code(400).send({ error: "That profile is not available anymore." })
  }

  try {
    const result = await matchService.decideEligible(
      resolved.account.userId,
      targetUserId,
      decision,
      resolvePersistedDiscoveryFilters(resolved.account.profile.discoveryPreferences),
      resolveCurrentUserDiscoveryGender(
        resolved.account.profile.identityGender ?? resolved.account.profile.gender
      )
    )
    if (result.matched && result.match && announceMatch) {
      try {
        await announceMatch(result.match)
      } catch (error) {
        // The match is durable; sync-matches opens the chat on the next visit.
        request.log.warn({ errorKind: safeOperationalErrorKind(error) }, "Match chat announcement failed")
      }
    }
    return result
  } catch (error) {
    if (error instanceof DiscoveryDecisionNotEligibleError) {
      return reply.code(409).send({
        error: error.message,
        code: "DISCOVERY_DECISION_NOT_ELIGIBLE"
      })
    }
    if (error instanceof DiscoveryDecisionQuotaExceededError) {
      return reply.code(429).send({
        error: error.message,
        code: "DISCOVERY_DECISION_QUOTA_EXHAUSTED",
        quota: error.quota
      })
    }
    if (!isPublicRequestError(error)) throw error
    return reply.code(400).send({
      error: error.message
    })
  }
}

function resolvePersistedDiscoveryFilters(
  preferences: DiscoveryFilters | undefined
): DiscoveryFilters {
  if (!preferences) {
    return {
      ageMin: 18,
      ageMax: 99,
      genders: [],
      vibes: []
    }
  }
  return {
    ageMin: preferences.ageMin,
    ageMax: preferences.ageMax,
    genders: [...preferences.genders],
    vibes: [...preferences.vibes]
  }
}

function resolveCurrentUserDiscoveryGender(
  value: unknown
): DiscoveryGender | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  return (DISCOVERY_GENDERS as readonly string[]).includes(normalized)
    ? normalized as DiscoveryGender
    : undefined
}
