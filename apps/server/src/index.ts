import { createServer } from "./server"
import {
  createConfiguredServerServices,
  resolveServerConfig
} from "./config"
import { createRealtimeServer } from "./realtime/realtimeServer"
import { createConnectionManager } from "./realtime/connectionManager"
import { createRealtimeTicketService } from "./realtime/realtimeTicketService"
import { startNotificationOutboxWorker } from "./notifications/notificationOutboxWorker"
import { startDiscoveryWatchWorker } from "./matches/discoveryWatchWorker"
import { createAdminTokenService } from "./admin/adminTokenService"
import { createGracefulShutdown } from "./operations/serviceLifecycle"
import { startPeriodicWorker } from "./operations/periodicWorker"
import { createChatMessageDeliveryService } from "./chat/chatMessageDeliveryService"
import { startChatDeliveryWorker } from "./chat/chatDeliveryWorker"

const config = resolveServerConfig()
const services = createConfiguredServerServices(config)
const mediaRevocationWorker = startPeriodicWorker({
  run: () => services.mediaRevocationService.dispatchDue(),
  intervalMs: 1000,
  reportError: (error) => console.error("Media revocation worker failed", error)
})
let accepting = false
const connectionManager = createConnectionManager({
  fanout: services.realtimeFanout,
  reportFanoutError: (error) => {
    console.error("Realtime fanout publish failed", error)
  }
})
const realtimeTicketService = createRealtimeTicketService({
  authService: services.authService,
  store: services.realtimeTicketStore,
  requireSharedStore: config.nodeEnv === "production"
})
const notificationOutboxWorker = startNotificationOutboxWorker({
  notificationService: services.notificationService,
  reportError: (error) => console.error("Notification worker failed", error)
})
const chatDeliveryWorker = startChatDeliveryWorker({
  deliveryService: createChatMessageDeliveryService({
    chatService: services.chatService,
    safetyService: services.safetyService,
    notificationService: services.notificationService,
    connectionManager
  }),
  reportError: (error) => console.error("Chat delivery worker failed", error)
})
const ticketCleanupWorker = startPeriodicWorker({
  run: () => services.realtimeTicketStore.purgeExpired(new Date(), 500),
  intervalMs: 60_000,
  reportError: (error) => console.error("Realtime ticket cleanup failed", error)
})
const rateBudgetCleanupWorker = startPeriodicWorker({
  run: () => services.sharedRateLimiter.purgeExpired(), intervalMs: 60_000,
  reportError: (error) => console.error("Shared request budget cleanup failed", error)
})
const discoverySnapshotCleanupWorker = startPeriodicWorker({
  run: () => services.discoverySnapshots.purgeExpired(), intervalMs: 60_000,
  reportError: (error) => console.error("Discovery snapshot cleanup failed", error)
})
const discoveryWatchWorker = startDiscoveryWatchWorker({
  matchService: services.matchService,
  safetyService: services.safetyService,
  notificationService: services.notificationService,
  reportError: (error) => {
    console.error("Discovery Watch worker failed", error)
  }
})
const adminTokenService = config.adminSigningKeys.length > 0
  ? createAdminTokenService({ keys: config.adminSigningKeys })
  : undefined

const app = createServer({
  discoverySnapshots: services.discoverySnapshots,
  sharedRateLimiter: services.sharedRateLimiter,
  isAccepting: () => accepting,
  checkReadiness: async () => {
    await services.checkReadiness()
    if (!connectionManager.isFanoutReady()) throw new Error("Realtime fanout unavailable")
  },
  authService: services.authService,
  chatService: services.chatService,
  economyService: services.economyService,
  commerceService: services.commerceService,
  revenueCatPurchaseVerifier: services.revenueCatPurchaseVerifier,
  revenueCatWebhookSigningSecret: config.revenueCatWebhookSigningSecret,
  purchaseEnvironment: config.purchaseEnvironment,
  avatarService: services.avatarService,
  notificationService: services.notificationService,
  referralService: services.referralService,
  miniRoomService: services.miniRoomService,
  connectionService: services.connectionService,
  connectionManager,
  realtimeTicketService,
  matchService: services.matchService,
  safetyService: services.safetyService,
  accountRecoveryService: services.accountRecoveryService,
  personalRoomDecorService: services.personalRoomDecorService,
  roomSnapshotService: services.roomSnapshotService,
  logger: config.nodeEnv !== "test",
  nodeEnv: config.nodeEnv,
  corsOrigins: config.corsOrigins,
  trustedProxyAddresses: config.trustedProxyAddresses,
  adminKey: config.adminKey,
  adminTokenService,
  allowLegacyAdminKey: config.adminLegacyKeyEnabled,
  appLinks: config.appleAppId && config.androidAppLinkSha256CertFingerprints.length > 0
    ? {
        appleAppId: config.appleAppId,
        androidPackageName: "com.blumi.mobile",
        androidSha256CertFingerprints: config.androidAppLinkSha256CertFingerprints
      }
    : undefined
})

const realtimeServer = createRealtimeServer({
  authService: services.authService,
  chatService: services.chatService,
  safetyService: services.safetyService,
  presenceService: services.presenceService,
  miniRoomService: services.miniRoomService,
  connectionService: services.connectionService,
  reactionService: services.reactionService,
  notificationService: services.notificationService,
  connectionManager,
  realtimeTicketService
})

async function start() {
  await app.listen({ port: config.port, host: config.host })
  await realtimeServer.listen({
    port: config.realtimePort,
    host: config.host
  })
  accepting = true
}

const shutdown = createGracefulShutdown({
  markNotReady: () => { accepting = false },
  drain: [
    () => app.close(),
    () => realtimeServer.close({ preserveFanout: true }),
    () => discoveryWatchWorker.stop(),
    () => notificationOutboxWorker.stop(),
    () => chatDeliveryWorker.stop(),
    () => mediaRevocationWorker.stop(),
    () => ticketCleanupWorker.stop(),
    () => rateBudgetCleanupWorker.stop(),
    () => discoverySnapshotCleanupWorker.stop()
  ],
  drainOutgoing: () => connectionManager.closeFanout(),
  closeData: () => services.close()
})

function handleShutdown() {
  void shutdown().then(() => process.exit(0), (error) => {
    console.error("Blumi shutdown failed", error)
    process.exit(1)
  })
}

process.once("SIGTERM", handleShutdown)
process.once("SIGINT", handleShutdown)

start().catch((error) => {
  app.log.error(error)
  void shutdown().catch((shutdownError) => console.error("Startup cleanup failed", shutdownError))
    .finally(() => process.exit(1))
})
