import { createServer } from "./server"
import {
  createConfiguredServerServices,
  resolveServerConfig
} from "./config"
import { createRealtimeServer } from "./realtime/realtimeServer"
import { createConnectionManager } from "./realtime/connectionManager"
import { createRealtimeTicketService } from "./realtime/realtimeTicketService"
import {
  connectionSetupLimitForPool,
  createConnectionSetupGate,
  DEFAULT_CONNECTION_SETUP_LIMIT
} from "./realtime/connectionSetupGate"
import { startNotificationOutboxWorker } from "./notifications/notificationOutboxWorker"
import { startDiscoveryWatchWorker } from "./matches/discoveryWatchWorker"
import { createAdminTokenService } from "./admin/adminTokenService"
import { createGracefulShutdown } from "./operations/serviceLifecycle"
import { installProcessLifecycle } from "./operations/processLifecycle"
import { startPeriodicWorker, startupJitterMs } from "./operations/periodicWorker"
import { createChatMessageDeliveryService, drainChatDispatches } from "./chat/chatMessageDeliveryService"
import { startChatDeliveryWorker } from "./chat/chatDeliveryWorker"
import { createFirebaseAuthVerifier } from "./auth/firebaseAuth"
import { createFirebaseUserDeletionDispatch } from "./auth/firebaseUserDeletionWorker"
import { safeOperationalErrorKind } from "./operations/safeErrorLog"

const config = resolveServerConfig()
const services = createConfiguredServerServices(config)
const firebaseAuthVerifier = createFirebaseAuthVerifier({
  projectId: process.env.FIREBASE_PROJECT_ID ?? "blumi-mobile-eren",
  serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  serviceAccountJsonBase64: process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64
})
const firebaseDeletionWorker = startPeriodicWorker({
  run: createFirebaseUserDeletionDispatch({
    repository: services.authService.repository,
    deleteUser: (uid) => firebaseAuthVerifier.deleteUser(uid)
  }),
  intervalMs: 30_000,
  // Maintenance cycles start spread out, not all with the first connections.
  firstRunDelayMs: startupJitterMs(30_000),
  reportError: (error) => console.error("Firebase user deletion worker failed", safeOperationalErrorKind(error))
})
const mediaRevocationWorker = config.livekitUrl && config.livekitApiKey && config.livekitApiSecret
  ? startPeriodicWorker({
      run: () => services.mediaRevocationService.dispatchDue(),
      intervalMs: 1000,
      reportError: (error) => console.error("Media revocation worker failed", safeOperationalErrorKind(error))
    })
  : undefined
let accepting = false
const connectionManager = createConnectionManager({
  fanout: services.realtimeFanout,
  reportFanoutError: (error) => {
    console.error("Realtime fanout publish failed", safeOperationalErrorKind(error))
  }
})
const realtimeTicketService = createRealtimeTicketService({
  authService: services.authService,
  store: services.realtimeTicketStore,
  requireSharedStore: config.nodeEnv === "production",
  // Ticket requests and socket upgrades share half the database pool, so a
  // reconnect storm cannot starve chat and room traffic.
  setupGate: createConnectionSetupGate(config.authRepositoryMode === "postgres"
    ? connectionSetupLimitForPool(config.databasePool.max)
    : DEFAULT_CONNECTION_SETUP_LIMIT)
})
const notificationOutboxWorker = startNotificationOutboxWorker({
  notificationService: services.notificationService,
  reportError: (error) => console.error("Notification worker failed", safeOperationalErrorKind(error))
})
const chatDeliveryWorker = startChatDeliveryWorker({
  deliveryService: createChatMessageDeliveryService({
    chatService: services.chatService,
    safetyService: services.safetyService,
    notificationService: services.notificationService,
    connectionManager
  }),
  reportError: (error) => console.error("Chat delivery worker failed", safeOperationalErrorKind(error))
})
const ticketCleanupWorker = startPeriodicWorker({
  run: () => services.realtimeTicketStore.purgeExpired(new Date(), 500),
  intervalMs: 60_000,
  firstRunDelayMs: startupJitterMs(60_000),
  reportError: (error) => console.error("Realtime ticket cleanup failed", safeOperationalErrorKind(error))
})
const rateBudgetCleanupWorker = startPeriodicWorker({
  run: () => services.sharedRateLimiter.purgeExpired(), intervalMs: 60_000, firstRunDelayMs: startupJitterMs(60_000),
  reportError: (error) => console.error("Shared request budget cleanup failed", safeOperationalErrorKind(error))
})
const discoverySnapshotCleanupWorker = startPeriodicWorker({
  run: () => services.discoverySnapshots.purgeExpired(), intervalMs: 60_000, firstRunDelayMs: startupJitterMs(60_000),
  reportError: (error) => console.error("Discovery snapshot cleanup failed", safeOperationalErrorKind(error))
})
const retentionWorker = startPeriodicWorker({
  run: () => services.retentionService.purgeExpired(), intervalMs: 600_000, firstRunDelayMs: startupJitterMs(600_000),
  reportError: (error) => console.error("Retention cleanup failed", safeOperationalErrorKind(error))
})
const discoveryWatchWorker = startDiscoveryWatchWorker({
  matchService: services.matchService,
  safetyService: services.safetyService,
  notificationService: services.notificationService,
  firstRunDelayMs: startupJitterMs(15_000),
  reportError: (error) => {
    console.error("Discovery Watch worker failed", safeOperationalErrorKind(error))
  }
})
const adminTokenService = config.adminSigningKeys.length > 0
  ? createAdminTokenService({ keys: config.adminSigningKeys })
  : undefined

const app = createServer({
  legalPagesEnabled: process.env.BLUMI_LEGAL_PAGES_ENABLED === "1",
  discoverySnapshots: services.discoverySnapshots,
  sharedRateLimiter: services.sharedRateLimiter,
  threadRoomInviteReader: services.threadRoomInviteReader,
  afterResponseTasks: services.afterResponseTasks,
  isAccepting: () => accepting,
  checkReadiness: async () => {
    await services.checkReadiness()
    if (!connectionManager.isFanoutReady()) throw new Error("Realtime fanout unavailable")
  },
  authService: services.authService,
  capabilityService: services.capabilityService,
  firebaseAuthVerifier,
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
  adminUsersService: services.adminUsersService,
  adminAnalyticsService: services.adminAnalyticsService,
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
  realtimeTicketService,
  trustedProxyAddresses: config.trustedProxyAddresses,
  capabilityService: services.capabilityService,
  httpServer: config.port === config.realtimePort ? app.server : undefined
})

async function start() {
  // Learn whether migration 070 is applied before serving, so the first
  // capability answers already include receipts (the probe never throws).
  await services.chatReceiptSchema.isReady()
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
    () => realtimeServer.close({ preserveFanout: true }),
    () => app.close(),
    () => discoveryWatchWorker.stop(),
    () => notificationOutboxWorker.stop(),
    () => firebaseDeletionWorker.stop(),
    () => chatDeliveryWorker.stop(),
    // Post-persist chat dispatches finish before the pool closes, so their
    // outbox jobs are not left leased (and pushed 30 s late) by a restart.
    () => drainChatDispatches(services.chatService),
    () => mediaRevocationWorker?.stop() ?? Promise.resolve(),
    () => ticketCleanupWorker.stop(),
    () => rateBudgetCleanupWorker.stop(),
    () => discoverySnapshotCleanupWorker.stop(),
    () => retentionWorker.stop()
  ],
  drainOutgoing: () => connectionManager.closeFanout(),
  closeData: () => services.close()
})

const lifecycle = installProcessLifecycle({
  process,
  shutdown,
  exit: (code) => process.exit(code),
  reportError: (message, errorKind) => console.error(message, errorKind)
})

start().catch((error) => lifecycle.fail("startup", error))
