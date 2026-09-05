import cors from "@fastify/cors"
import { createInMemoryRateBudget, type SharedRateBudget } from "./operations/sharedRateBudget"
import { registerSharedRateBudget } from "./operations/sharedRateBudgetHook"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions
} from "fastify"
import { randomUUID } from "node:crypto"
import { createAuthService, type AuthService } from "./auth/authService"
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
import { registerSafetyRoutes } from "./routes/safetyRoutes"
import { registerConnectionRoutes } from "./routes/connectionRoutes"
import { registerThreadRoutes } from "./routes/threadRoutes"
import { registerUserRoutes } from "./routes/userRoutes"
import { createSafetyService, type SafetyService } from "./safety/safetyService"
import { createInMemoryPresenceRepository } from "./presence/presenceRepository"
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
import type { MiniRoomService } from "./miniRooms/miniRoomService"
import { createAccountRecoveryService, type AccountRecoveryService } from "./account/accountRecoveryService"
import { createReferralService, type ReferralService } from "./referrals/referralService"
import { registerReferralRoutes } from "./routes/referralRoutes"
import { registerPersonalRoomDecorRoutes } from "./routes/personalRoomDecorRoutes"
import {
  createCapabilityService,
  parseCapabilityManifest,
  type CapabilityService
} from "./capabilities/capabilityService"
import { registerCapabilityRoutes } from "./routes/capabilityRoutes"
import {
  createPersonalRoomDecorService,
  type PersonalRoomDecorService
} from "./rooms/personalRoomDecorService"
import {
  createRoomSnapshotService,
  type RoomSnapshotService
} from "./rooms/roomSnapshotService"
import { registerRoomSnapshotRoutes } from "./routes/roomSnapshotRoutes"
import {
  createOpenApiDocument,
  OPENAPI_DOCUMENT_PATH,
  type OpenApiRouteSnapshot
} from "./openapi/openapiDocument"

interface CreateServerOptions {
  isAccepting?: () => boolean
  checkReadiness?: () => Promise<void>
  readinessTimeoutMs?: number
  authService?: AuthService
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
  avatarService?: AvatarService
  notificationService?: NotificationService
  miniRoomService?: MiniRoomService
  logger?: boolean
  nodeEnv?: string
  corsOrigins?: string[]
  trustedProxyAddresses?: string[]
  adminKey?: string
  adminTokenService?: AdminTokenService
  allowLegacyAdminKey?: boolean
  appLinks?: AppLinkConfig
  accountRecoveryService?: AccountRecoveryService
  referralService?: ReferralService
  personalRoomDecorService?: PersonalRoomDecorService
  roomSnapshotService?: RoomSnapshotService
  capabilityService?: CapabilityService
}

export function createServer(options: CreateServerOptions = {}): FastifyInstance {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development"
  if (nodeEnv === "production" && options.allowLegacyAdminKey) {
    throw new Error("Production server cannot enable legacy admin key compatibility.")
  }
  const authService = options.authService ?? createAuthService()
  const accountRecoveryService = options.accountRecoveryService ?? createAccountRecoveryService({ authService })
  const chatService = options.chatService ?? createChatService()
  const safetyService = options.safetyService ?? createSafetyService()
  const economyService = options.economyService ?? createEconomyService()
  const commerceService = options.commerceService ?? createCommerceService({
    economyService
  })
  const revenueCatPurchaseVerifier =
    options.revenueCatPurchaseVerifier ??
    createUnavailableRevenueCatPurchaseVerifier()
  const presenceRepository = createInMemoryPresenceRepository()
  const avatarService = options.avatarService ?? createAvatarService({
    authService,
    economyService,
    presenceRepository
  })
  const notificationService =
    options.notificationService ?? createNotificationService()
  const matchService =
    options.matchService ?? createMatchService({ economyService, notificationService })
  const referralService = options.referralService ?? createReferralService()
  const roomSnapshotService = options.roomSnapshotService ?? createRoomSnapshotService({
    isPublicByDefault: false,
    onRenderError: (error, room) => {
      console.error("Room showcase snapshot render failed", {
        error,
        userId: room.userId,
        revision: room.revision
      })
    }
  })
  const personalRoomDecorService =
    options.personalRoomDecorService ??
    createPersonalRoomDecorService({
      getOwnedRoomItemIds: async (userId) =>
        (await economyService.getInventory(userId)).ownedRoomItemIds,
      roomSnapshotService
    })
  const capabilityService = options.capabilityService ?? createCapabilityService({
    manifest: parseCapabilityManifest(process.env.BLUMI_CAPABILITY_MANIFEST).manifest
  })
  const connectionManager = options.connectionManager ?? createConnectionManager()
  const realtimeTicketService = options.realtimeTicketService ??
    createRealtimeTicketService({
      authService,
      requireSharedStore: nodeEnv === "production"
    })
  const trustedProxyAddresses = options.trustedProxyAddresses ?? []
  const app = Fastify({
    logger: createLoggerOptions(options.logger ?? false, nodeEnv),
    genReqId: () => randomUUID(),
    trustProxy:
      trustedProxyAddresses.length > 0 ? trustedProxyAddresses : false
  })

  const openApiRoutes: OpenApiRouteSnapshot[] = []
  app.addHook("onRoute", (route) => {
    openApiRoutes.push({
      method: route.method,
      url: route.url,
      schema: route.schema,
      config: route.config
    })
  })
  app.get(OPENAPI_DOCUMENT_PATH, async () => createOpenApiDocument(openApiRoutes))

  registerProductionMiddleware(app, {
    nodeEnv,
    corsOrigins: options.corsOrigins ?? []
  })
  registerErrorHandler(app)

  app.get("/health", async () => ({
    ok: true,
    service: "blumi-server"
  }))
  app.get("/live", async () => ({ ok: true, service: "blumi-server" }))
  const probe = createReadinessProbe({
    isAccepting: options.isAccepting ?? (() => true),
    check: options.checkReadiness ?? (async () => {}),
    timeoutMs: options.readinessTimeoutMs
  })
  app.get("/ready", async (_request, reply) => {
    const ready = await probe()
    return reply.code(ready ? 200 : 503).send({ ok: ready, service: "blumi-server" })
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
    capabilityService,
    accountRecoveryService,
    connectionManager,
    connectionService: options.connectionService,
    miniRoomService: options.miniRoomService
  }
  void app.register(async (instance) => {
    registerSharedRateBudget(instance, authService, options.sharedRateLimiter ?? createInMemoryRateBudget())
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
      accountRecoveryService
    })
    await registerUserRoutes(instance, routeServices)
    await registerDiscoverRoutes(instance, routeServices)
    await registerThreadRoutes(instance, routeServices)
    await registerSafetyRoutes(instance, routeServices)
    await registerConnectionRoutes(instance, routeServices)
    await registerEconomyRoutes(instance, routeServices)
    await registerCommerceRoutes(instance, routeServices)
    await registerNotificationRoutes(instance, routeServices)
    await registerReferralRoutes(instance, routeServices)
    await registerPersonalRoomDecorRoutes(instance, routeServices)
    await registerRoomSnapshotRoutes(instance, routeServices)
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
  void app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute"
  })
}

function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const statusCode = getErrorStatusCode(error)
    if (statusCode >= 500) {
      request.log.error({ error }, "Unhandled request error")
    }

    return reply.code(statusCode).send({
      error: statusCode >= 500 ? "Something went wrong." : getErrorMessage(error),
      statusCode,
      requestId: request.id
    })
  })
}

function createLoggerOptions(
  enabled: boolean,
  nodeEnv: string
): FastifyServerOptions["logger"] {
  if (!enabled) return false
  if (nodeEnv === "production") return true
  return {
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong."
}
