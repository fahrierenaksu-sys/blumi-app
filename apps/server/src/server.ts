import cors from "@fastify/cors"
import { createInMemoryRateBudget, type SharedRateBudget } from "./operations/sharedRateBudget"
import { registerSharedRateBudget } from "./operations/sharedRateBudgetHook"
import { createTrustedRealIpBridge } from "./operations/trustedRealIpHeader"
import { createAfterResponseTasks, type AfterResponseTasks } from "./operations/afterResponseTasks"
import { safeOperationalErrorKind } from "./operations/safeErrorLog"
import { classifyDatabaseError } from "./operations/databaseErrorStatus"
import { PrivateRequestLogController, privateLogSerializers } from "./operations/privateRequestLog"
import { ipRequestCeiling, registerFailedAuthLimiter } from "./operations/requestLimits"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions
} from "fastify"
import { randomUUID } from "node:crypto"
import { createAuthService, type AuthService } from "./auth/authService"
import type { FirebaseAuthVerifier } from "./auth/firebaseAuth"
import { createFirebaseSessionRevocationHook } from "./auth/firebaseSessionRevocation"
import { createAvatarService, type AvatarService } from "./avatar/avatarService"
import { createChatService, type ChatService } from "./chat/chatService"
import type { ConnectionService } from "./connections/connectionService"
import {
  createEconomyService,
  type EconomyService
} from "./economy/economyService"
import {
  createCommerceService,
  type CommerceService
} from "./commerce/commerceService"
import {
  createUnavailableRevenueCatPurchaseVerifier,
  type RevenueCatPurchaseVerifier
} from "./commerce/revenueCatPurchaseVerifier"
import { createMatchService, type MatchService } from "./matches/matchService"
import {
  createNotificationService,
  type NotificationService
} from "./notifications/notificationService"
import { registerAuthRoutes } from "./routes/authRoutes"
import {
  registerAppLinkRoutes,
  type AppLinkConfig
} from "./routes/appLinkRoutes"
import { registerAdminRoutes } from "./routes/adminRoutes"
import { registerDiscoverRoutes } from "./routes/discoverRoutes"
import { registerEconomyRoutes } from "./routes/economyRoutes"
import { registerCommerceRoutes } from "./routes/commerceRoutes"
import { registerNotificationRoutes } from "./routes/notificationRoutes"
import { registerLegalPageRoutes } from "./routes/legalPageRoutes"
import { registerSafetyRoutes } from "./routes/safetyRoutes"
import { registerConnectionRoutes } from "./routes/connectionRoutes"
import { registerThreadRoutes } from "./routes/threadRoutes"
import { registerUserRoutes } from "./routes/userRoutes"
import { assertRequestValidationPolicy } from "./routes/routeHelpers"
import { createSafetyService, type SafetyService } from "./safety/safetyService"
import {
  createConnectionManager,
  type ConnectionManager
} from "./realtime/connectionManager"
import {
  createRealtimeTicketService,
  type RealtimeTicketService
} from "./realtime/realtimeTicketService"
import { registerRealtimeTicketRoutes } from "./routes/realtimeTicketRoutes"
import { createReadinessProbe } from "./operations/serviceLifecycle"
import type { AdminTokenService } from "./admin/adminTokenService"
import type { AdminUsersService } from "./admin/adminUsersService"
import type { AdminAnalyticsService } from "./admin/adminAnalyticsService"
import type { MiniRoomService } from "./miniRooms/miniRoomService"
import { createAccountRecoveryService, type AccountRecoveryService } from "./account/accountRecoveryService"
import { createReferralService, type ReferralService } from "./referrals/referralService"
import { registerReferralRoutes } from "./routes/referralRoutes"
import { registerPersonalRoomDecorRoutes } from "./routes/personalRoomDecorRoutes"
import { registerCatTripRoutes } from "./routes/catTripRoutes"
import { createDisabledCatTripService } from "./catTrips/catTripWiring"
import type { CatTripService } from "./catTrips/catTripService"
import { registerRoomPetRoutes } from "./routes/roomPetRoutes"
import type { RoomPetService } from "./roomPets/roomPetService"
import {
  createCapabilityService,
  isCapabilityRolledOut,
  parseCapabilityManifest,
  type CapabilityService
} from "./capabilities/capabilityService"
import { registerCapabilityRoutes } from "./routes/capabilityRoutes"
import { createChatReceiptService } from "./chat/chatReceiptService"
import { registerChatPreferencesRoutes } from "./routes/chatPreferencesRoutes"
import { registerStreetRoutes } from "./routes/streetRoutes"
import { createInMemoryStreetRepository, type StreetRepository } from "./street/streetRepository"
import { createStaticStreetSchema, type StreetSchemaProbe } from "./street/streetSchema"
import { createStreetService } from "./street/streetService"
import { createStreetRoomCache } from "./street/streetRoomCache"
import { listAllowedRealtimeUserIds } from "./auth/realtimeUserBatch"

/** The app refetches the street whenever its thread list changes; rooms are reused across reads this long. */
const STREET_ROOM_CACHE_TTL_MS = 15_000
import { withStreetDigests } from "./street/streetDigestHooks"
import { getRoomSnapshotSelfCheckState } from "./rooms/roomSnapshotRenderer"
import { computeAvatarArtPackHash, getAvatarPortraitSelfCheckState } from "./avatar/avatarPortrait"
import {
  createPersonalRoomDecorService,
  type PersonalRoomDecorService
} from "./rooms/personalRoomDecorService"
import {
  createRoomSnapshotService,
  type RoomSnapshotService
} from "./rooms/roomSnapshotService"
import { registerRoomSnapshotRoutes } from "./routes/roomSnapshotRoutes"
import { registerNotificationPortraitRoutes } from "./routes/notificationPortraitRoutes"
import {
  createNotificationPortraitService,
  type NotificationPortraitService
} from "./notifications/notificationPortraitService"
import { readDeployedCommit } from "./operations/deployedCommit"
import {
  createOpenApiDocument,
  OPENAPI_DOCUMENT_PATH,
  type OpenApiScope,
  type OpenApiRouteSnapshot
} from "./openapi/openapiDocument"

interface CreateServerOptions {
  isAccepting?: () => boolean
  checkReadiness?: () => Promise<void>
  readinessTimeoutMs?: number
  /** Overrides how /ready reads the avatar art-pack hash (tests); default hashes the built art pack manifest. */
  avatarArtPackHash?: () => string | null
  /** Overrides the build commit /health reports (tests); default reads it from the deploy environment. */
  deployedCommit?: string | null
  authService?: AuthService
  firebaseAuthVerifier?: FirebaseAuthVerifier
  /**
   * Local Simulator QA only: keeps the server-side phone code routes open next
   * to Firebase so a dev build can sign in to the in-memory API. Refused in
   * production; config only sets it for a loopback, in-memory development API.
   */
  localQaOtpEnabled?: boolean
  matchService?: MatchService
  discoverySnapshots?: import("./matches/discoverySnapshot").DiscoverySnapshotService
  chatService?: ChatService
  connectionService?: ConnectionService
  connectionManager?: ConnectionManager
  realtimeTicketService?: RealtimeTicketService
  safetyService?: SafetyService
  economyService?: EconomyService
  commerceService?: CommerceService
  revenueCatPurchaseVerifier?: RevenueCatPurchaseVerifier
  revenueCatWebhookSigningSecret?: string
  purchaseEnvironment?: "production" | "sandbox"
  sharedRateLimiter?: SharedRateBudget
  authRateLimiter?: SharedRateBudget
  avatarService?: AvatarService
  notificationService?: NotificationService
  miniRoomService?: MiniRoomService
  threadRoomInviteReader?: import("./miniRooms/threadRoomInviteRead").ThreadRoomInviteReader
  logger?: boolean
  /** Test seam: where JSON log lines go instead of stdout. */
  logDestination?: { write(line: string): void }
  nodeEnv?: string
  corsOrigins?: string[]
  trustedProxyAddresses?: string[]
  trustedClientIpHeader?: "x-real-ip"
  adminKey?: string
  adminTokenService?: AdminTokenService
  adminUsersService?: AdminUsersService
  adminAnalyticsService?: AdminAnalyticsService
  allowLegacyAdminKey?: boolean
  appLinks?: AppLinkConfig
  legalPagesEnabled?: boolean
  accountRecoveryService?: AccountRecoveryService
  referralService?: ReferralService
  personalRoomDecorService?: PersonalRoomDecorService
  /** The traveling cat (BLUMI_CAT_TRIPS_ENABLED); default: disabled. */
  catTripService?: CatTripService
  /** The room pet, only when BLUMI_ROOM_PET_ENABLED=1; absent means its routes do not exist. */
  roomPetService?: RoomPetService
  roomSnapshotService?: RoomSnapshotService
  /** Push sender pictures; must be the instance the notification service links to. */
  notificationPortraits?: NotificationPortraitService
  capabilityService?: CapabilityService
  /** Sokağım storage (migration 080); in-memory by default. */
  streetRepository?: StreetRepository
  /** Whether migration 080 is applied; in-memory storage is always ready. */
  streetSchema?: StreetSchemaProbe
  /** PostgreSQL: the auth and room repositories already write the street record inside each save's transaction. */
  streetDigestsInSaveTransaction?: boolean
  /** Side effects that responses do not wait for; drained when the app closes. */
  afterResponseTasks?: AfterResponseTasks
}

export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development"
  if (nodeEnv === "production" && options.localQaOtpEnabled) {
    throw new Error("Local QA phone codes must never be enabled in production.")
  }
  if (nodeEnv === "production" && options.allowLegacyAdminKey) {
    throw new Error("Production server cannot enable legacy admin key compatibility.")
  }
  const authService = options.authService ?? createAuthService()
  const accountRecoveryService = options.accountRecoveryService ?? createAccountRecoveryService({ authService })
  const safetyService = options.safetyService ?? createSafetyService({
    isKnownUser: async (userId) => Boolean(await authService.repository.findAccountByUserId(userId))
  })
  const chatService = options.chatService ?? createChatService({
    blockPolicy: safetyService,
    profileSource: (userIds) => authService.repository.findAccountsByUserIds(userIds)
  })
  const economyService = options.economyService ?? createEconomyService({
    getAccountCreatedAt: async (userId) => (await authService.repository.findAccountByUserId(userId))?.createdAt ?? null
  })
  const commerceService = options.commerceService ?? createCommerceService({
    economyService
  })
  const revenueCatPurchaseVerifier =
    options.revenueCatPurchaseVerifier ??
    createUnavailableRevenueCatPurchaseVerifier()
  const baseAvatarService = options.avatarService ?? createAvatarService({
    authService,
    economyService
  })
  const notificationService =
    options.notificationService ?? createNotificationService()
  const afterResponseTasks = options.afterResponseTasks ?? createAfterResponseTasks()
  const matchService =
    options.matchService ?? createMatchService({
      economyService,
      notificationService,
      deferSideEffects: (work) => afterResponseTasks.run("match-side-effects", work)
    })
  const referralService = options.referralService ?? createReferralService()
  const roomSnapshotService = options.roomSnapshotService ?? createRoomSnapshotService({
    isPublicByDefault: false,
    onRenderError: (error) => {
      console.error("Room showcase snapshot render failed", {
        errorType: error instanceof Error ? error.name : typeof error
      })
    }
  })
  const basePersonalRoomDecorService =
    options.personalRoomDecorService ??
    createPersonalRoomDecorService({
      getOwnedRoomItemIds: async (userId) =>
        (await economyService.getInventory(userId)).ownedRoomItemIds,
      getOwnedRoomItemIdsForUsers: economyService.getOwnedRoomItemIdsForUsers,
      // stored ownership, held items included: only decides that a stored placement is carried over a save
      getStoredOwnedRoomItemIds: async (userId) =>
        (await economyService.repository.getInventory(userId))?.ownedRoomItemIds ?? [],
      isActiveRoomItemId: economyService.isActiveRoomItemId,
      roomSnapshotService
    })
  const catTripService = options.catTripService ?? createDisabledCatTripService()
  const streetSchema = options.streetSchema ?? createStaticStreetSchema(true)
  const streetService = createStreetService({
    repository: options.streetRepository ?? createInMemoryStreetRepository(),
    isSchemaReady: () => streetSchema.isReady(),
    listThreads: async (viewerUserId, limit) => (await chatService.listThreadsPage(viewerUserId, { limit })).threads,
    listMutualPartnerIds: async (viewerUserId) => {
      const [matches, connections] = await Promise.all([
        matchService.repository.listMatchesForUser(viewerUserId),
        options.connectionService?.repository.listMatchesForUser(viewerUserId) ?? Promise.resolve([])
      ])
      return new Set([...matches, ...connections].flatMap((match) => match.participantUserIds)
        .filter((userId) => userId !== viewerUserId))
    },
    listBlockedPartnerIds: (viewerUserId, partnerIds) => partnerIds.length === 0
      ? Promise.resolve([])
      : safetyService.listBlockedUserIdsBetween(viewerUserId, [...partnerIds]),
    listAllowedUserIds: (userIds, now) => listAllowedRealtimeUserIds({
      repository: authService.repository,
      isRealtimeUserAllowed: (userId) => authService.isRealtimeUserAllowed(userId, now),
      userIds,
      now
    }),
    getRooms: createStreetRoomCache({
      getMany: (userIds) => basePersonalRoomDecorService.getMany(userIds),
      ttlMs: STREET_ROOM_CACHE_TTL_MS
    }),
    // capabilityService is created below; this runs per request, after it exists.
    isStreetRolledOutTo: (userId) => isCapabilityRolledOut(capabilityService, userId, "chat_street"),
    log: { warn: (entry, message) => console.warn(message, entry) }
  })
  const { avatarService, personalRoomDecorService } = options.streetDigestsInSaveTransaction
    ? { avatarService: baseAvatarService, personalRoomDecorService: basePersonalRoomDecorService }
    : withStreetDigests({
    avatarService: baseAvatarService,
    personalRoomDecorService: basePersonalRoomDecorService,
    getSessionLoadout: async (sessionToken, now) => {
      const session = await authService.getSession(sessionToken, now)
      return session ? { userId: session.account.userId, loadout: session.account.profile.avatar.loadout ?? null } : null
    },
    streetService
  })
  const capabilityService = options.capabilityService ?? createCapabilityService({
    manifest: parseCapabilityManifest(process.env.BLUMI_CAPABILITY_MANIFEST).manifest
  })
  const connectionManager = options.connectionManager ?? createConnectionManager()
  const chatReceiptService = createChatReceiptService({
    chatService,
    blockPolicy: { hasBlockBetween: (a, b) => safetyService.hasBlockBetweenCached(a, b) },
    isRolledOutFor: (userId) => isCapabilityRolledOut(capabilityService, userId, "chat_read_receipts"),
    emit: (userId, event) => connectionManager.sendToUser(userId, event)
  })
  const realtimeTicketService = options.realtimeTicketService ??
    createRealtimeTicketService({
      authService,
      requireSharedStore: nodeEnv === "production"
    })
  const trustedProxyAddresses = options.trustedProxyAddresses ?? []
  const app = Fastify({
    logger: createLoggerOptions(options.logger ?? false, nodeEnv, options.logDestination),
    logController: new PrivateRequestLogController(),
    genReqId: () => randomUUID(),
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
    trustProxy:
      trustedProxyAddresses.length > 0 ? trustedProxyAddresses : false
  })

  const openApiRoutes: OpenApiRouteSnapshot[] = []
  app.addHook("onRoute", (route) => {
    assertRequestValidationPolicy(route)
    openApiRoutes.push({
      method: route.method,
      url: route.url,
      schema: route.schema,
      config: route.config
    })
  })
  if (options.trustedClientIpHeader === "x-real-ip") {
    const bridge = createTrustedRealIpBridge(trustedProxyAddresses)
    app.addHook("onRequest", async (request, reply) => {
      if (bridge(request.raw) === "invalid" && request.url.split("?")[0]?.startsWith("/v1/")) {
        return reply.code(400).send({ error: "Request unavailable." })
      }
    })
  }
  registerProductionMiddleware(app, {
    nodeEnv,
    corsOrigins: options.corsOrigins ?? []
  })
  registerErrorHandler(app)
  app.addHook("onSend", async (request, reply, payload) => {
    // API credentials and private account state must not be retained by HTTP
    // caches. Public image routes keep their explicit cache policy.
    if (request.routeOptions.url?.startsWith("/v1/") && reply.getHeader("cache-control") === undefined) {
      reply.header("Cache-Control", "no-store")
    }
    return payload
  })

  if (options.legalPagesEnabled) {
    void app.register(registerLegalPageRoutes)
  }

  // rate-limit installs per-route hooks during plugin boot. Registering these
  // routes synchronously before it boots silently leaves them unprotected.
  app.after((error) => {
    if (error) throw error
    app.get<{ Querystring: { scope?: OpenApiScope } }>(OPENAPI_DOCUMENT_PATH, {
      config: { apiAuth: "public" },
      schema: { querystring: {
        type: "object", additionalProperties: false,
        properties: { scope: { type: "string", enum: ["active", "mobile", "admin", "infrastructure", "legacy", "all"] } }
      } }
    }, async (request) => createOpenApiDocument(openApiRoutes, { scope: request.query.scope }))
    const limitUnknownRoute = app.rateLimit({ max: 100, timeWindow: "1 minute" })
    app.addHook("onRequest", async (request, reply) => {
      // Count unknown paths before JSON parsing, including malformed bodies
      // that would never reach a not-found preHandler.
      if (!request.routeOptions.url) await limitUnknownRoute.call(app, request, reply)
    })
    app.setNotFoundHandler(async (_request, reply) => {
      // Never echo an attacker-controlled URL (which may contain private IDs).
      return reply.code(404).send({ error: "Not found.", statusCode: 404 })
    })
    const deployedCommit = options.deployedCommit === undefined ? readDeployedCommit() : options.deployedCommit
    app.get("/health", async () => ({
      ok: true,
      service: "blumi-server",
      // the room showcase art self-check (start-up); "failed" means Discover room pictures cannot be drawn
      roomShowcaseArt: getRoomSnapshotSelfCheckState(),
      // the push portrait art self-check (start-up); "failed" means pushes go out without a sender picture
      pushPortraitArt: getAvatarPortraitSelfCheckState(),
      // the short git SHA this server was built from, or null when the deploy does not say
      commit: deployedCommit
    }))
    app.get("/live", async () => ({ ok: true, service: "blumi-server" }))
    const probe = createReadinessProbe({
      isAccepting: options.isAccepting ?? (() => true),
      check: options.checkReadiness ?? (async () => {}),
      timeoutMs: options.readinessTimeoutMs
    })
    let cachedArtPackHash: string | null | undefined
    const artPackHash = () => (cachedArtPackHash === undefined ? (cachedArtPackHash = (options.avatarArtPackHash ?? computeAvatarArtPackHash)()) : cachedArtPackHash)
    app.get("/ready", async (_request, reply) => {
      const ready = await probe()
      return reply.code(ready ? 200 : 503).send({ ok: ready, service: "blumi-server", artPackHash: artPackHash() })
    })
  })
  app.addHook("onRequest", async (request, reply) => {
    if (options.isAccepting?.() === false && !["/health", "/live", "/ready"].includes(request.url.split("?")[0]!)) {
      return reply.code(503).send({ error: "Service unavailable" })
    }
  })
  if (options.appLinks) {
    void app.register(async (instance) => {
      await registerAppLinkRoutes(instance, options.appLinks as AppLinkConfig)
    })
  }

  const routeServices = {
    discoverySnapshots: options.discoverySnapshots,
    authService,
    firebaseAuthVerifier: options.firebaseAuthVerifier,
    localQaOtpEnabled: options.localQaOtpEnabled === true,
    matchService,
    chatService,
    safetyService,
    economyService,
    commerceService,
    revenueCatPurchaseVerifier,
    revenueCatWebhookSigningSecret: options.revenueCatWebhookSigningSecret,
    purchaseEnvironment: options.purchaseEnvironment,
    avatarService,
    notificationService,
    referralService,
    personalRoomDecorService,
    roomSnapshotService,
    catTripService,
    capabilityService,
    chatReceiptService,
    streetService,
    accountRecoveryService,
    connectionManager,
    connectionService: options.connectionService,
    miniRoomService: options.miniRoomService,
    threadRoomInviteReader: options.threadRoomInviteReader,
    afterResponseTasks
  }
  // A closing app finishes the side effects its answered requests started.
  app.addHook("onClose", () => afterResponseTasks.drain())
  const revokeFirebaseSessions = createFirebaseSessionRevocationHook(
    authService,
    options.firebaseAuthVerifier,
    afterResponseTasks
  )
  const stopSessionReuseRevocation = revokeFirebaseSessions
    ? authService.subscribeSessionReuse?.((userId) => revokeFirebaseSessions(userId, "session_reuse"))
    : undefined
  app.addHook("onClose", async () => { stopSessionReuseRevocation?.() })
  void app.register(async (instance) => {
    registerSharedRateBudget(instance, authService, options.sharedRateLimiter ?? createInMemoryRateBudget(), options.authRateLimiter, Boolean(options.firebaseAuthVerifier) && options.localQaOtpEnabled !== true)
    await registerAuthRoutes(instance, routeServices)
    await registerRealtimeTicketRoutes(instance, {
      authService,
      realtimeTicketService
    })
    await registerAdminRoutes(instance, {
      safetyService,
      adminKey: options.adminKey,
      adminTokenService: options.adminTokenService,
      allowLegacyAdminKey: options.allowLegacyAdminKey,
      accountRecoveryService,
      adminUsersService: options.adminUsersService,
      adminAnalyticsService: options.adminAnalyticsService,
      connectionManager,
      ...(revokeFirebaseSessions
        ? { onUserBanned: (userId: string) => revokeFirebaseSessions(userId, "moderation_ban") }
        : {})
    })
    await registerUserRoutes(instance, routeServices)
    await registerDiscoverRoutes(instance, routeServices)
    await registerThreadRoutes(instance, routeServices)
    await registerSafetyRoutes(instance, routeServices)
    await registerConnectionRoutes(instance, routeServices)
    await registerEconomyRoutes(instance, routeServices)
    await registerCommerceRoutes(instance, routeServices)
    await registerNotificationRoutes(instance, routeServices)
    await registerChatPreferencesRoutes(instance, routeServices)
    await registerStreetRoutes(instance, routeServices)
    await registerReferralRoutes(instance, routeServices)
    await registerPersonalRoomDecorRoutes(instance, routeServices)
    await registerCatTripRoutes(instance, routeServices)
    if (options.roomPetService) {
      await registerRoomPetRoutes(instance, { authService, roomPetService: options.roomPetService })
    }
    await registerRoomSnapshotRoutes(instance, routeServices)
    await registerNotificationPortraitRoutes(instance, {
      notificationPortraits: options.notificationPortraits ?? createNotificationPortraitService({})
    })
    await registerCapabilityRoutes(instance, routeServices)
  })

  return app
}

function registerProductionMiddleware(
  app: FastifyInstance,
  options: { nodeEnv: string; corsOrigins: string[] }
) {
  void app.register(helmet)
  void app.register(cors, {
    origin:
      options.nodeEnv === "production"
        ? options.corsOrigins
        : true
  })
  // Strict per IP without a bearer token; a coarse ceiling with one, since
  // signed-in traffic is limited per verified user (shared request budget).
  void app.register(rateLimit, {
    max: ipRequestCeiling,
    timeWindow: "1 minute"
  })
  registerFailedAuthLimiter(app)
}

const DATABASE_ERROR_MESSAGES = {
  409: "That changed at the same moment. Refresh and try again.",
  500: "Something went wrong.",
  503: "Service temporarily unavailable. Try again shortly."
} as const

function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const database = classifyDatabaseError(error)
    if (database) {
      // Only the SQLSTATE is logged; PostgreSQL text can contain row values.
      request.log.error({ errorKind: safeOperationalErrorKind(error), sqlState: database.sqlState }, "Database request error")
      if (database.retryAfterSeconds) reply.header("Retry-After", String(database.retryAfterSeconds))
      return reply.code(database.statusCode).send({
        error: DATABASE_ERROR_MESSAGES[database.statusCode],
        statusCode: database.statusCode,
        requestId: request.id
      })
    }
    const statusCode = getErrorStatusCode(error)
    if (statusCode >= 500) {
      request.log.error({ errorKind: safeOperationalErrorKind(error) }, "Unhandled request error")
    }

    return reply.code(statusCode).send({
      error: statusCode >= 500
        ? "Something went wrong."
        : isSchemaValidationError(error)
          // Never echo validator internals (schema paths, keywords, limits).
          ? "Check your request and try again."
          : getErrorMessage(error),
      statusCode,
      requestId: request.id
    })
  })
}

function createLoggerOptions(
  enabled: boolean,
  nodeEnv: string,
  destination?: { write(line: string): void }
): FastifyServerOptions["logger"] {
  if (!enabled) return false
  // Raw URLs, hosts and client IPs never reach the logs (privacy rules).
  if (nodeEnv === "production" || destination) {
    return { serializers: privateLogSerializers, ...(destination ? { stream: destination } : {}) }
  }
  return {
    serializers: privateLogSerializers,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard"
      }
    }
  }
}

function getErrorStatusCode(error: unknown): number {
  const statusCode =
    typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
      ? error.statusCode
      : 500
  return statusCode >= 400 && statusCode <= 599 ? statusCode : 500
}

function isSchemaValidationError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "validation" in error &&
    Array.isArray(error.validation)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong."
}
