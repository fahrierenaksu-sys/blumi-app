import type { AuthService } from "../auth/authService"
import type { ChatService } from "../chat/chatService"
import type { MatchService } from "../matches/matchService"
import type { NotificationService } from "../notifications/notificationService"
import type { SafetyService } from "../safety/safetyService"
import type { CatTripRepository } from "./catTripRepository"
import type { CatTripSchemaProbe } from "./catTripSchema"
import { createCatTripService, type CatTripService, type CatTripWorld } from "./catTripService"
import type { CatTripRole } from "./catTripTypes"

/** Fixed, local-development seed. Never used when the flag is on in production without a real secret. */
const DEV_SEED_SECRET = "blumi-dev-cat-trips-seed"

export interface CatTripsConfig {
  enabled: boolean
  seedSecret: string
}

/**
 * BLUMI_CAT_TRIPS_ENABLED=1 turns the feature on (default off). In production
 * it also needs BLUMI_CAT_TRIPS_SEED_SECRET (at least 16 characters): without
 * it the feature stays off rather than drawing from a guessable seed. The
 * server never refuses to start over this flag.
 */
export function resolveCatTripsConfig(env: NodeJS.ProcessEnv, nodeEnv: string): CatTripsConfig {
  const secret = env.BLUMI_CAT_TRIPS_SEED_SECRET?.trim() ?? ""
  const requested = env.BLUMI_CAT_TRIPS_ENABLED === "1"
  if (nodeEnv === "production") {
    return { enabled: requested && secret.length >= 16, seedSecret: secret }
  }
  return { enabled: requested, seedSecret: secret || DEV_SEED_SECRET }
}

/** A service that answers "disabled" to everything (the default when nothing is wired). */
export function createDisabledCatTripService(): CatTripService {
  return {
    async isEnabled() { return false },
    async getState() { return { enabled: false } },
    async getCurrentTrip() { return { enabled: false } },
    async listGuests() { return { enabled: false } },
    async acknowledgeReveal() { return { outcome: "disabled" } },
    async isTeaserCurrent() { return false },
    async endTripsBetween() { return 0 },
    async purgeExpired() { return 0 }
  }
}

const TEASER_TYPE: Record<CatTripRole, "cat.trip_owner" | "cat.trip_host"> = {
  owner: "cat.trip_owner",
  host: "cat.trip_host"
}

export function createConfiguredCatTripService(input: {
  config: CatTripsConfig
  repository: CatTripRepository
  schema?: CatTripSchemaProbe
  authService: AuthService
  chatService: ChatService
  matchService: MatchService
  safetyService: SafetyService
  notificationService: NotificationService
  report?: (event: string, fields?: Record<string, number | string>) => void
}): CatTripService {
  const { authService, chatService, matchService, safetyService, notificationService } = input
  const world: CatTripWorld = {
    countMessagesByPartner: (userId, since, until) =>
      chatService.repository.countMessagesByPartnerBetween(userId, since, until),
    async isMutualMatch(userAId, userBId) {
      return (await matchService.repository.findMatchBetween(userAId, userBId)) !== null
    },
    hasBlockBetween: (userAId, userBId) => safetyService.hasBlockBetween(userAId, userBId),
    isUserActive: (userId, now) => authService.isRealtimeUserAllowed(userId, now),
    // The room cat has no server record yet (pet P1): every active account counts as having one.
    async hasCat() { return true },
    async getTimeSettings(userId) {
      const preferences = await notificationService.getPreferences(userId)
      return {
        timeZone: preferences.quietHoursTimeZone,
        utcOffsetMinutes: preferences.quietHoursUtcOffsetMinutes,
        quietHours: preferences.quietHours
      }
    },
    async queueTeaser({ userId, role, tripId, availableAt }) {
      // The server owns the copy; title and body here are replaced by the policy.
      await notificationService.sendPushToUser(
        userId,
        { title: "Blumi", body: "Blumi", data: { type: TEASER_TYPE[role], tripId } },
        undefined,
        { availableAt }
      )
    }
  }
  return createCatTripService({
    repository: input.repository,
    world,
    enabled: input.config.enabled,
    seedSecret: input.config.seedSecret,
    schema: input.schema,
    report: input.report
  })
}
