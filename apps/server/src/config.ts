import { Pool } from "pg"
import { createInMemoryRateBudget, createPostgresRateBudget, type SharedRateBudget } from "./operations/sharedRateBudget"
import { createLivekitRevocationProvider, createPostgresMediaRevocationService } from "./miniRooms/mediaRevocationService"
import { createSchemaReadinessCheck } from "./operations/schemaReadiness"
import { createAuthService, type AuthService } from "./auth/authService"
import { createAvatarService, type AvatarService } from "./avatar/avatarService"
import { normalizeStoredAvatarSelection } from "./avatar/avatarSelectionPersistence"
import { createSixDigitCode } from "./auth/authStore"
import {
  createDevelopmentSmsProvider,
  createTwilioSmsProvider,
  type SmsProvider
} from "./auth/smsProvider"
import { createChatService, type ChatService } from "./chat/chatService"
import {
  createEconomyService,
  type EconomyService
} from "./economy/economyService"
import {
  createCommerceService,
  type CommerceService
} from "./commerce/commerceService"
import {
  createRevenueCatApiPurchaseVerifier,
  createUnavailableRevenueCatPurchaseVerifier,
  type RevenueCatPurchaseVerifier
} from "./commerce/revenueCatPurchaseVerifier"
import { createMatchService, type MatchService } from "./matches/matchService"
import { createDiscoverySnapshotService, createInMemoryDiscoverySnapshots, type DiscoverySnapshotService } from "./matches/discoverySnapshot"
import { createPostgresDiscoverySnapshots } from "./db/postgresDiscoverySnapshots"
import { createPostgresAuthRepository } from "./db/postgresAuthRepository"
import { createPostgresAccountDataExporter } from "./account/accountDataExporter"
import { createAccountRecoveryService, type AccountRecoveryService } from "./account/accountRecoveryService"
import { createPostgresAccountRecoveryRepository } from "./db/postgresAccountRecoveryRepository"
import { createPostgresChatRepository } from "./db/postgresChatRepository"
import { createPostgresConnectionRepository } from "./db/postgresConnectionRepository"
import { createPostgresEconomyRepository } from "./db/postgresEconomyRepository"
import { createPostgresMatchRepository } from "./db/postgresMatchRepository"
import { createPostgresMiniRoomRepository } from "./db/postgresMiniRoomRepository"
import { createPostgresNotificationRepository } from "./db/postgresNotificationRepository"
import { createPostgresRealtimeTicketStore } from "./db/postgresRealtimeTicketStore"
import { createPostgresRealtimeFanout } from "./db/postgresRealtimeFanout"
import { createPostgresPresenceRepository } from "./db/postgresPresenceRepository"
import { createPostgresReactionRepository } from "./db/postgresReactionRepository"
import { createPostgresRoomRepository } from "./db/postgresRoomRepository"
import { createPostgresPersonalRoomDecorRepository } from "./db/postgresPersonalRoomDecorRepository"
import { createPostgresRoomSnapshotRepository } from "./db/postgresRoomSnapshotRepository"
import { createPostgresSafetyRepository } from "./db/postgresSafetyRepository"
import {
  createConnectionService,
  type ConnectionService
} from "./connections/connectionService"
import {
  createLivekitTokenService,
  type LivekitTokenService
} from "./miniRooms/livekitTokenService"
import {
  createMiniRoomService,
  type MiniRoomService
} from "./miniRooms/miniRoomService"
import { createInMemoryPresenceRepository } from "./presence/presenceRepository"
import {
  createPresenceService,
  type PresenceService
} from "./presence/presenceService"
import {
  createDevelopmentPushProvider,
  createExpoPushProvider,
  type PushProvider
} from "./notifications/pushProvider"
import {
  createNotificationService,
  type NotificationService
} from "./notifications/notificationService"
import { createReactionService, type ReactionService } from "./reactions/reactionService"
import { createRoomService, type RoomService } from "./rooms/roomService"
import {
  createPersonalRoomDecorService,
  type PersonalRoomDecorService
} from "./rooms/personalRoomDecorService"
import {
  createRoomSnapshotService,
  type RoomSnapshotService
} from "./rooms/roomSnapshotService"
import { createSafetyService, type SafetyService } from "./safety/safetyService"
import { createPostgresReferralRepository } from "./db/postgresReferralRepository"
import { createReferralService, type ReferralService } from "./referrals/referralService"
import type { AdminSigningKey } from "./admin/adminTokenService"
import {
  createInMemoryRealtimeTicketStore,
  type RealtimeTicketStore
} from "./realtime/realtimeTicketStore"
import type { RealtimeFanout } from "./realtime/realtimeFanout"

export type AuthRepositoryMode = "memory" | "postgres"
export type SmsProviderMode = "development" | "twilio"
export type PushProviderMode = "development" | "expo"

export interface ServerConfig {
  host: string
  port: number
  realtimePort: number
  nodeEnv: string
  purchaseEnvironment: "production" | "sandbox"
  authRepositoryMode: AuthRepositoryMode
  smsProviderMode: SmsProviderMode
  pushProviderMode: PushProviderMode
  databaseUrl?: string
  twilioAccountSid?: string
  twilioAuthToken?: string
  twilioFromPhoneNumber?: string
  otpHmacSecret?: string
  livekitUrl?: string
  livekitApiKey?: string
  livekitApiSecret?: string
  expoPushAccessToken?: string
  revenueCatApiKey?: string
  revenueCatProjectId?: string
  revenueCatWebhookSigningSecret?: string
  revenueCatCoinProductIdMap: Readonly<Record<string, string>>
  adminKey?: string
  adminSigningKeys: readonly AdminSigningKey[]
  adminActiveKeyId?: string
  adminLegacyKeyEnabled: boolean
  appleAppId?: string
  androidAppLinkSha256CertFingerprints: string[]
  corsOrigins: string[]
  trustedProxyAddresses: string[]
  qaAuth?: Readonly<{
    phoneNumber: string
    verificationCode: string
  }>
}

export interface ConfiguredServerServices {
  discoverySnapshots: DiscoverySnapshotService
  sharedRateLimiter: SharedRateBudget
  mediaRevocationService: import("./miniRooms/mediaRevocationService").MediaRevocationService
  authService: AuthService
  chatService: ChatService
  economyService: EconomyService
  commerceService: CommerceService
  revenueCatPurchaseVerifier: RevenueCatPurchaseVerifier
  avatarService: AvatarService
  matchService: MatchService
  safetyService: SafetyService
  roomService: RoomService
  presenceService: PresenceService
  livekitTokenService: LivekitTokenService
  miniRoomService: MiniRoomService
  connectionService: ConnectionService
  reactionService: ReactionService
  notificationService: NotificationService
  realtimeTicketStore: RealtimeTicketStore
  realtimeFanout?: RealtimeFanout
  referralService: ReferralService
  accountRecoveryService: AccountRecoveryService
  personalRoomDecorService: PersonalRoomDecorService
  roomSnapshotService: RoomSnapshotService
  checkReadiness(): Promise<void>
  close(): Promise<void>
}

export function resolveServerConfig(
  env: NodeJS.ProcessEnv = process.env
): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? "development"
  const purchaseEnvironment = env.REVENUECAT_PURCHASE_ENVIRONMENT?.trim() || "production"
  if ((purchaseEnvironment !== "production" && purchaseEnvironment !== "sandbox") ||
      (nodeEnv === "production" && purchaseEnvironment !== "production")) {
    throw new Error("Invalid RevenueCat purchase environment; production cannot accept sandbox purchases.")
  }
  const host = env.HOST ?? "0.0.0.0"
  const requestedMode = env.BLUMI_AUTH_REPOSITORY?.trim().toLowerCase()
  const authRepositoryMode = normalizeRepositoryMode(
    requestedMode ?? (nodeEnv === "production" ? "postgres" : "memory")
  )
  const requestedSmsProvider = env.BLUMI_SMS_PROVIDER?.trim().toLowerCase()
  const smsProviderMode = normalizeSmsProviderMode(
    requestedSmsProvider ?? (nodeEnv === "production" ? "twilio" : "development")
  )
  const requestedPushProvider = env.BLUMI_PUSH_PROVIDER?.trim().toLowerCase()
  const pushProviderMode = normalizePushProviderMode(
    requestedPushProvider ?? "development"
  )
  const databaseUrl = env.DATABASE_URL?.trim()
  const twilioAccountSid = env.TWILIO_ACCOUNT_SID?.trim()
  const twilioAuthToken = env.TWILIO_AUTH_TOKEN?.trim()
  const twilioFromPhoneNumber = env.TWILIO_FROM_PHONE_NUMBER?.trim()
  const otpHmacSecret = env.BLUMI_OTP_HMAC_SECRET?.trim()
  const livekitUrl = env.LIVEKIT_URL?.trim()
  const livekitApiKey = env.LIVEKIT_API_KEY?.trim()
  const livekitApiSecret = env.LIVEKIT_API_SECRET?.trim()
  const expoPushAccessToken = env.EXPO_PUSH_ACCESS_TOKEN?.trim()
  const revenueCatApiKey = env.REVENUECAT_SECRET_API_KEY?.trim()
  const revenueCatProjectId = env.REVENUECAT_PROJECT_ID?.trim()
  const revenueCatWebhookSigningSecret = env.REVENUECAT_WEBHOOK_SIGNING_SECRET?.trim()
  const revenueCatCoinProductIdMap = parseRevenueCatCoinProductIdMap(
    env.REVENUECAT_COIN_PRODUCT_ID_MAP
  )
  const adminKey = env.BLUMI_ADMIN_KEY?.trim()
  const adminSigningKeys = parseAdminSigningKeys(
    env.BLUMI_ADMIN_SIGNING_KEYS
  )
  const adminActiveKeyId = env.BLUMI_ADMIN_ACTIVE_KID?.trim()
  const adminLegacyFlag = env.BLUMI_ADMIN_LEGACY_KEY_ENABLED?.trim()
  if (adminLegacyFlag && adminLegacyFlag !== "0" && adminLegacyFlag !== "1") {
    throw new Error("BLUMI_ADMIN_LEGACY_KEY_ENABLED must be 0 or 1.")
  }
  const adminLegacyKeyEnabled = adminLegacyFlag === "1"
  if (adminLegacyKeyEnabled && nodeEnv === "production") {
    throw new Error("Legacy admin keys are forbidden in production.")
  }
  if (adminLegacyKeyEnabled && !adminKey) {
    throw new Error("Legacy admin compatibility requires BLUMI_ADMIN_KEY.")
  }
  if (adminKey && !adminLegacyKeyEnabled) {
    throw new Error(
      "BLUMI_ADMIN_KEY requires explicit BLUMI_ADMIN_LEGACY_KEY_ENABLED=1."
    )
  }
  if (adminSigningKeys.length > 0) {
    if (!adminActiveKeyId || !adminSigningKeys.some((key) => key.keyId === adminActiveKeyId)) {
      throw new Error("BLUMI_ADMIN_ACTIVE_KID must identify a configured admin signing key.")
    }
  } else if (adminActiveKeyId) {
    throw new Error("BLUMI_ADMIN_ACTIVE_KID requires BLUMI_ADMIN_SIGNING_KEYS.")
  }
  const appleAppId = env.BLUMI_APPLE_APP_ID?.trim()
  const androidAppLinkSha256CertFingerprints = parseCsv(
    env.BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS
  )
  const corsOrigins = parseCsv(env.BLUMI_CORS_ORIGINS)
  const trustedProxyAddresses = parseCsv(env.BLUMI_TRUST_PROXY)
  const qaAuthEnabledValue = env.BLUMI_QA_AUTH_ENABLED?.trim()
  const qaPhoneNumber = env.BLUMI_QA_PHONE_NUMBER?.trim()
  const qaOtpCode = env.BLUMI_QA_OTP_CODE?.trim()
  if (
    qaAuthEnabledValue &&
    qaAuthEnabledValue !== "0" &&
    qaAuthEnabledValue !== "1"
  ) {
    throw new Error("BLUMI_QA_AUTH_ENABLED must be 0 or 1.")
  }
  const qaAuthEnabled = qaAuthEnabledValue === "1"
  const qaAuthConfigured = Boolean(qaAuthEnabled || qaPhoneNumber || qaOtpCode)
  if (nodeEnv === "production" && qaAuthConfigured) {
    throw new Error("QA auth must never be configured in production.")
  }
  if (!qaAuthEnabled && (qaPhoneNumber || qaOtpCode)) {
    throw new Error("QA auth credentials require BLUMI_QA_AUTH_ENABLED=1.")
  }
  if (qaAuthEnabled) {
    if (
      nodeEnv !== "development" ||
      authRepositoryMode !== "memory" ||
      smsProviderMode !== "development" ||
      !isLoopbackHost(host) ||
      !qaPhoneNumber ||
      !/^\+[1-9]\d{7,14}$/.test(qaPhoneNumber) ||
      !qaOtpCode ||
      !/^\d{6}$/.test(qaOtpCode)
    ) {
      if (!isLoopbackHost(host)) {
        throw new Error("QA auth requires a loopback HOST.")
      }
      if (authRepositoryMode !== "memory") {
        throw new Error("QA auth requires the in-memory auth repository.")
      }
      if (smsProviderMode !== "development") {
        throw new Error("QA auth requires the development SMS provider.")
      }
      throw new Error("QA auth requires development mode, an E.164 phone, and a six-digit code.")
    }
  }

  if (authRepositoryMode === "postgres" && !databaseUrl) {
    throw new Error("DATABASE_URL is required when BLUMI_AUTH_REPOSITORY=postgres.")
  }
  if (nodeEnv === "production" && authRepositoryMode !== "postgres") {
    throw new Error("Production server must use BLUMI_AUTH_REPOSITORY=postgres.")
  }
  if (
    authRepositoryMode === "postgres" &&
    (!otpHmacSecret || Buffer.byteLength(otpHmacSecret, "utf8") < 32)
  ) {
    throw new Error(
      "BLUMI_OTP_HMAC_SECRET must contain at least 32 characters when using PostgreSQL auth."
    )
  }
  if (smsProviderMode === "twilio") {
    if (!twilioAccountSid || !twilioAuthToken || !twilioFromPhoneNumber) {
      throw new Error("Twilio SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_PHONE_NUMBER.")
    }
  }
  if (nodeEnv === "production" && smsProviderMode !== "twilio") {
    throw new Error("Production server must use BLUMI_SMS_PROVIDER=twilio.")
  }
  if (nodeEnv === "production" && pushProviderMode !== "expo") {
    throw new Error("Production server must use BLUMI_PUSH_PROVIDER=expo.")
  }
  if (pushProviderMode === "expo" && !expoPushAccessToken) {
    throw new Error("Expo push requires EXPO_PUSH_ACCESS_TOKEN.")
  }
  if (nodeEnv === "production") {
    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      throw new Error(
        "Production media requires LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET."
      )
    }
    if (!isSecureWebSocketUrl(livekitUrl)) {
      throw new Error("Production LIVEKIT_URL must use WSS.")
    }
    if (adminSigningKeys.length === 0 || !adminActiveKeyId) {
      throw new Error(
        "Production requires BLUMI_ADMIN_SIGNING_KEYS and BLUMI_ADMIN_ACTIVE_KID."
      )
    }
    if (!appleAppId || !/^[A-Z0-9]{10}\.com\.blumi\.mobile$/.test(appleAppId)) {
      throw new Error(
        "Production universal links require BLUMI_APPLE_APP_ID in TEAMID.com.blumi.mobile format."
      )
    }
    if (
      androidAppLinkSha256CertFingerprints.length === 0 ||
      !androidAppLinkSha256CertFingerprints.every(isSha256Fingerprint)
    ) {
      throw new Error(
        "Production app links require valid BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS."
      )
    }
  }
  return {
    host,
    port: Number(env.PORT ?? 4000),
    realtimePort: Number(env.REALTIME_PORT ?? 4100),
    nodeEnv,
    purchaseEnvironment,
    authRepositoryMode,
    smsProviderMode,
    pushProviderMode,
    databaseUrl,
    twilioAccountSid,
    twilioAuthToken,
    twilioFromPhoneNumber,
    otpHmacSecret,
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    expoPushAccessToken,
    revenueCatApiKey,
    revenueCatProjectId,
    revenueCatWebhookSigningSecret,
    revenueCatCoinProductIdMap,
    adminKey,
    adminSigningKeys,
    adminActiveKeyId,
    adminLegacyKeyEnabled,
    appleAppId,
    androidAppLinkSha256CertFingerprints,
    corsOrigins,
    trustedProxyAddresses,
    qaAuth: qaAuthEnabled && qaPhoneNumber && qaOtpCode
      ? { phoneNumber: qaPhoneNumber, verificationCode: qaOtpCode }
      : undefined
  }
}

export function parseAdminSigningKeys(value: string | undefined): readonly AdminSigningKey[] {
  if (!value?.trim()) return Object.freeze([])
  const keys = value.split(",").map((entry) => {
    const separator = entry.indexOf("=")
    if (separator <= 0) throw new Error("Admin signing keys must use kid=base64urlsecret format.")
    const keyId = entry.slice(0, separator).trim()
    const encodedSecret = entry.slice(separator + 1).trim()
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || !/^[A-Za-z0-9_-]+$/.test(encodedSecret)) {
      throw new Error("Admin signing key configuration is invalid.")
    }
    const secret = Buffer.from(encodedSecret, "base64url")
    if (secret.length < 32 || secret.toString("base64url") !== encodedSecret) {
      throw new Error("Admin signing secrets must contain at least 32 bytes.")
    }
    return Object.freeze({ keyId, secret })
  })
  if (new Set(keys.map((key) => key.keyId)).size !== keys.length) {
    throw new Error("Admin signing key IDs must be unique.")
  }
  return Object.freeze(keys)
}

export function createConfiguredAuthService(config = resolveServerConfig()): AuthService {
  const smsProvider = createConfiguredSmsProvider(config)
  const codeFactory = createConfiguredCodeFactory(config)
  if (config.authRepositoryMode === "postgres") {
    const pool = new Pool({
      connectionString: config.databaseUrl
    })
    return createAuthService({
      repository: createPostgresAuthRepository(pool),
      accountDataExporter: createPostgresAccountDataExporter(pool),
      smsProvider,
      codeFactory,
      otpHmacSecret: config.otpHmacSecret
    })
  }

  return createAuthService({
    smsProvider,
    codeFactory,
    otpHmacSecret: config.otpHmacSecret
  })
}

export function createConfiguredSafetyService(
  config = resolveServerConfig()
): SafetyService {
  if (config.authRepositoryMode === "postgres") {
    const pool = new Pool({
      connectionString: config.databaseUrl
    })
    return createSafetyService({
      repository: createPostgresSafetyRepository(pool)
    })
  }

  return createSafetyService()
}

export function createConfiguredServerServices(
  config = resolveServerConfig()
): ConfiguredServerServices {
  const smsProvider = createConfiguredSmsProvider(config)
  const codeFactory = createConfiguredCodeFactory(config)
  const pushProvider = createConfiguredPushProvider(config)
  const livekitTokenService = createLivekitTokenService({
    livekitUrl: config.livekitUrl,
    apiKey: config.livekitApiKey,
    apiSecret: config.livekitApiSecret
  })
  const revenueCatPurchaseVerifier = createConfiguredRevenueCatPurchaseVerifier(config)
  if (config.authRepositoryMode === "postgres") {
    const pool = new Pool({
      connectionString: config.databaseUrl
    })
    const checkSchemaReadiness = createSchemaReadinessCheck(pool)
    const notificationService = createNotificationService({
      repository: createPostgresNotificationRepository(pool),
      pushProvider
    })
    const authService = createAuthService({
      repository: createPostgresAuthRepository(pool),
      accountDataExporter: createPostgresAccountDataExporter(pool),
      smsProvider,
      codeFactory,
      otpHmacSecret: config.otpHmacSecret
    })
    const accountRecoveryService = createAccountRecoveryService({
      authService,
      repository: createPostgresAccountRecoveryRepository(pool)
    })
    const chatService = createChatService({
      repository: createPostgresChatRepository(pool)
    })
    const economyService = createEconomyService({
      repository: createPostgresEconomyRepository(pool)
    })
    const commerceService = createCommerceService({ economyService })
    const roomSnapshotService = createRoomSnapshotService({
      repository: createPostgresRoomSnapshotRepository(pool),
      isPublicByDefault: false,
      onRenderError: (error, room) => {
        console.error("Room showcase snapshot render failed", {
          error,
          userId: room.userId,
          revision: room.revision
        })
      }
    })
    const personalRoomDecorService = createPersonalRoomDecorService({
      repository: createPostgresPersonalRoomDecorRepository(pool),
      getOwnedRoomItemIds: async (userId) =>
        (await economyService.getInventory(userId)).ownedRoomItemIds,
      roomSnapshotService
    })
    const presenceRepository = createPostgresPresenceRepository(pool)
    const avatarService = createAvatarService({
      authService,
      economyService,
      presenceRepository
    })
    const matchService = createMatchService({
      repository: createPostgresMatchRepository(pool),
      economyService,
      notificationService
    })
    const safetyService = createSafetyService({
      repository: createPostgresSafetyRepository(pool)
    })
    const referralService = createReferralService({
      repository: createPostgresReferralRepository(pool)
    })
    const roomService = createRoomService({
      repository: createPostgresRoomRepository(pool)
    })
    const presenceService = createPresenceService({
      repository: presenceRepository,
      roomService
    })
    const miniRoomService = createMiniRoomService({
      repository: createPostgresMiniRoomRepository(pool),
      presenceService,
      safetyService,
      chatService,
      livekitTokenService,
      economyService
    })
    return {
      authService,
      chatService,
      economyService,
      commerceService,
      revenueCatPurchaseVerifier,
      avatarService,
      matchService,
      safetyService,
      roomService,
      presenceService,
      livekitTokenService,
      miniRoomService,
      connectionService: createConnectionService({
        repository: createPostgresConnectionRepository(pool),
        miniRoomService,
        economyService
      }),
      reactionService: createReactionService({
        repository: createPostgresReactionRepository(pool)
      }),
      notificationService,
      mediaRevocationService: config.livekitUrl && config.livekitApiKey && config.livekitApiSecret
        ? createPostgresMediaRevocationService(pool, createLivekitRevocationProvider({
            livekitUrl: config.livekitUrl, apiKey: config.livekitApiKey, apiSecret: config.livekitApiSecret
          }))
        : { async dispatchDue() {} },
      realtimeTicketStore: createPostgresRealtimeTicketStore(pool),
      realtimeFanout: createPostgresRealtimeFanout(pool, {
        reportError: (error) => {
          console.error("Realtime fanout subscription failed", error)
        }
      }),
      referralService,
      accountRecoveryService,
      personalRoomDecorService,
      roomSnapshotService,
      async checkReadiness() {
        await checkSchemaReadiness()
      },
      sharedRateLimiter: createPostgresRateBudget(pool),
      discoverySnapshots: createDiscoverySnapshotService(createPostgresDiscoverySnapshots(pool)),
      async close() {
        await pool.end()
      }
    }
  }

  const notificationService = createNotificationService({ pushProvider })
  const authService = createAuthService({
    smsProvider,
    codeFactory,
    otpHmacSecret: config.otpHmacSecret,
    accountDeletionHandlers: [
      (account) => notificationService.repository.removeAllDevices(account.userId)
    ]
  })
  const accountRecoveryService = createAccountRecoveryService({ authService })
  const chatService = createChatService()
  const economyService = createEconomyService()
  const commerceService = createCommerceService({ economyService })
  const roomSnapshotService = createRoomSnapshotService({
    isPublicByDefault: false,
    onRenderError: (error, room) => {
      console.error("Room showcase snapshot render failed", {
        error,
        userId: room.userId,
        revision: room.revision
      })
    }
  })
  const personalRoomDecorService = createPersonalRoomDecorService({
    getOwnedRoomItemIds: async (userId) =>
      (await economyService.getInventory(userId)).ownedRoomItemIds,
    roomSnapshotService
  })
  const presenceRepository = createInMemoryPresenceRepository(undefined, {
    resolveAvatarSelection: async (userId) => {
      const account = await authService.repository.findAccountByUserId(userId)
      return account
        ? normalizeStoredAvatarSelection({
            presetId: account.profile.avatar.presetId,
            loadout: account.profile.avatar.loadout,
            revision: account.profile.avatar.revision
          })
        : null
    }
  })
  const avatarService = createAvatarService({
    authService,
    economyService,
    presenceRepository
  })
  const matchService = createMatchService({ economyService, notificationService })
  const safetyService = createSafetyService()
  const referralService = createReferralService()
  const roomService = createRoomService()
  const presenceService = createPresenceService({
    repository: presenceRepository,
    roomService
  })
  const miniRoomService = createMiniRoomService({
    presenceService,
    safetyService,
    chatService,
    livekitTokenService,
    economyService,
    getPersonalRoomDecor: (userId) => personalRoomDecorService.get(userId)
  })

  return {
    authService,
    chatService,
    economyService,
    commerceService,
    revenueCatPurchaseVerifier,
    avatarService,
    matchService,
    safetyService,
    roomService,
    presenceService,
    livekitTokenService,
    miniRoomService,
    connectionService: createConnectionService({ miniRoomService, economyService }),
    reactionService: createReactionService(),
    notificationService,
    realtimeTicketStore: createInMemoryRealtimeTicketStore(),
    referralService,
    accountRecoveryService,
    personalRoomDecorService,
    roomSnapshotService,
    mediaRevocationService: { async dispatchDue() {} },
    async checkReadiness() {},
    sharedRateLimiter: createInMemoryRateBudget(),
    discoverySnapshots: createDiscoverySnapshotService(createInMemoryDiscoverySnapshots((userId, filters) => matchService.listDiscovery(userId, filters))),
    async close() {
      return
    }
  }
}

function normalizeRepositoryMode(value: string): AuthRepositoryMode {
  if (value === "memory" || value === "postgres") return value
  throw new Error(`Unsupported BLUMI_AUTH_REPOSITORY value: ${value}`)
}

function normalizeSmsProviderMode(value: string): SmsProviderMode {
  if (value === "development" || value === "twilio") return value
  throw new Error(`Unsupported BLUMI_SMS_PROVIDER value: ${value}`)
}

function normalizePushProviderMode(value: string): PushProviderMode {
  if (value === "development" || value === "expo") return value
  throw new Error(`Unsupported BLUMI_PUSH_PROVIDER value: ${value}`)
}

function createConfiguredSmsProvider(config: ServerConfig): SmsProvider {
  if (config.smsProviderMode === "twilio") {
    return createTwilioSmsProvider({
      accountSid: config.twilioAccountSid ?? "",
      authToken: config.twilioAuthToken ?? "",
      fromPhoneNumber: config.twilioFromPhoneNumber ?? ""
    })
  }

  return createDevelopmentSmsProvider()
}

export function createConfiguredCodeFactory(
  config: ServerConfig
): ((phoneNumber: string) => string) | undefined {
  if (config.nodeEnv === "production" || !config.qaAuth) return undefined

  const qaAuth = config.qaAuth

  return (phoneNumber) =>
    (phoneNumber === qaAuth.phoneNumber || phoneNumber.endsWith("2025550123"))
      ? qaAuth.verificationCode
      : createSixDigitCode()
}

function createConfiguredPushProvider(config: ServerConfig): PushProvider {
  if (config.pushProviderMode === "expo") {
    return createExpoPushProvider({
      accessToken: config.expoPushAccessToken
    })
  }

  return createDevelopmentPushProvider()
}

function createConfiguredRevenueCatPurchaseVerifier(
  config: ServerConfig
): RevenueCatPurchaseVerifier {
  if (
    !config.revenueCatApiKey ||
    !config.revenueCatProjectId ||
    Object.keys(config.revenueCatCoinProductIdMap).length === 0
  ) {
    return createUnavailableRevenueCatPurchaseVerifier()
  }
  return createRevenueCatApiPurchaseVerifier({
    apiKey: config.revenueCatApiKey,
    projectId: config.revenueCatProjectId,
    coinProductIdMap: config.revenueCatCoinProductIdMap,
    purchaseEnvironment: config.purchaseEnvironment
  })
}

function parseRevenueCatCoinProductIdMap(
  value: string | undefined
): Readonly<Record<string, string>> {
  if (!value?.trim()) return Object.freeze({})
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("REVENUECAT_COIN_PRODUCT_ID_MAP must be valid JSON.")
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("REVENUECAT_COIN_PRODUCT_ID_MAP must be a JSON object.")
  }
  const entries = Object.entries(parsed)
  if (
    entries.length === 0 ||
    entries.some(([providerProductId, productId]) =>
      providerProductId.trim().length === 0 ||
      providerProductId.length > 255 ||
      typeof productId !== "string" ||
      productId.trim().length === 0 ||
      productId.length > 255
    )
  ) {
    throw new Error("REVENUECAT_COIN_PRODUCT_ID_MAP contains invalid product IDs.")
  }
  return Object.freeze(Object.fromEntries(
    entries.map(([providerProductId, productId]) => [
      providerProductId.trim(),
      (productId as string).trim()
    ])
  ))
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function isSecureWebSocketUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "wss:" && parsed.hostname.length > 0
  } catch {
    return false
  }
}

function isSha256Fingerprint(value: string): boolean {
  return /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(value)
}

function isLoopbackHost(value: string): boolean {
  return value === "127.0.0.1" || value === "localhost" || value === "::1"
}
