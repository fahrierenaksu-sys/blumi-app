import assert from "node:assert/strict"
import test from "node:test"
import {
  createConfiguredServerServices,
  createConfiguredCodeFactory,
  resolveServerConfig
} from "./config"
import { CommerceProviderUnavailableError } from "./commerce/revenueCatPurchaseVerifier"
import { createAccountRecord } from "./auth/authStore"
import { createLivekitTokenService } from "./miniRooms/livekitTokenService"

test("purchase environments default to production and reject unknown values", () => {
  assert.equal(resolveServerConfig({}).purchaseEnvironment, "production")
  assert.equal(resolveServerConfig({ REVENUECAT_PURCHASE_ENVIRONMENT: "sandbox" }).purchaseEnvironment, "sandbox")
  assert.throws(() => resolveServerConfig({ REVENUECAT_PURCHASE_ENVIRONMENT: "unknown" }), /purchase environment/i)
})

const ADMIN_SIGNING_SECRET = Buffer.alloc(32, 7).toString("base64url")
const ADMIN_SIGNING_ENV = {
  BLUMI_ADMIN_SIGNING_KEYS: `active=${ADMIN_SIGNING_SECRET}`,
  BLUMI_ADMIN_ACTIVE_KID: "active"
}
const REVENUECAT_ENV = {
  REVENUECAT_SECRET_API_KEY: "server_secret",
  REVENUECAT_PROJECT_ID: "project_1",
  REVENUECAT_WEBHOOK_SIGNING_SECRET: "webhook_secret",
  REVENUECAT_COIN_PRODUCT_ID_MAP: JSON.stringify({
    rc_product_500: "com.blumi.mobile.coins.500"
  })
}
const VALID_PRODUCTION_ENV = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
  BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
  BLUMI_PUSH_PROVIDER: "expo",
  EXPO_PUSH_ACCESS_TOKEN: "expo-access-token",
  LIVEKIT_URL: "wss://live.blumi.app",
  LIVEKIT_API_KEY: "livekit-key",
  LIVEKIT_API_SECRET: "livekit-secret",
  ...ADMIN_SIGNING_ENV,
  BLUMI_APPLE_APP_ID: "TEAMID1234.com.blumi.mobile",
  BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
  BLUMI_TRUST_PROXY: "100.64.0.0/10",
  ...REVENUECAT_ENV
}

test("production can explicitly disable voice without LiveKit credentials", () => {
  const config = resolveServerConfig({
    ...VALID_PRODUCTION_ENV,
    BLUMI_VOICE_ENABLED: "0",
    LIVEKIT_URL: undefined,
    LIVEKIT_API_KEY: undefined,
    LIVEKIT_API_SECRET: undefined
  })
  assert.equal(config.livekitUrl, undefined)
  assert.equal(config.livekitApiKey, undefined)
  assert.equal(config.livekitApiSecret, undefined)
  const media = createLivekitTokenService({
    livekitUrl: config.livekitUrl,
    apiKey: config.livekitApiKey,
    apiSecret: config.livekitApiSecret
  }).createMediaSession({
    miniRoom: { miniRoomId: "text-only-room", livekitRoomName: "unused" } as Parameters<ReturnType<typeof createLivekitTokenService>["createMediaSession"]>[0]["miniRoom"],
    userId: "text-only-user"
  })
  assert.equal(media.livekitUrl, "wss://demo.livekit.invalid")
  assert.equal(media.token, "demo-token-text-only-room-text-only-user")
})

test("disabled voice ignores existing credentials and invalid voice flags fail closed", () => {
  const config = resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_VOICE_ENABLED: "0" })
  assert.equal(config.livekitUrl, undefined)
  assert.equal(config.livekitApiKey, undefined)
  assert.equal(config.livekitApiSecret, undefined)
  assert.throws(() => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_VOICE_ENABLED: "false" }), /BLUMI_VOICE_ENABLED/)
  assert.throws(() => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_VOICE_ENABLED: "1", LIVEKIT_API_KEY: undefined }), /Live voice and microphone access are disabled/)
})

test("production voice defaults off even when LiveKit credentials are present", () => {
  const config = resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_VOICE_ENABLED: undefined })
  assert.equal(config.livekitUrl, undefined)
  assert.equal(config.livekitApiKey, undefined)
  assert.equal(config.livekitApiSecret, undefined)
})

test("production-mode staging accepts only an explicit sandbox purchase environment", () => {
  const staging = resolveServerConfig({
    ...VALID_PRODUCTION_ENV,
    BLUMI_DEPLOY_ENV: "staging",
    REVENUECAT_PURCHASE_ENVIRONMENT: "sandbox"
  })
  assert.equal(staging.deployEnvironment, "staging")
  assert.equal(staging.purchaseEnvironment, "sandbox")
  assert.equal(resolveServerConfig(VALID_PRODUCTION_ENV).deployEnvironment, "production")
  assert.throws(
    () => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_DEPLOY_ENV: "staging" }),
    /Staging purchases require.*sandbox/
  )
  assert.throws(
    () => resolveServerConfig({ ...VALID_PRODUCTION_ENV, REVENUECAT_PURCHASE_ENVIRONMENT: "sandbox" }),
    /sandbox.*staging|staging.*sandbox/i
  )
  assert.throws(
    () => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_DEPLOY_ENV: "production", REVENUECAT_PURCHASE_ENVIRONMENT: "sandbox" }),
    /sandbox.*staging|staging.*sandbox/i
  )
  assert.throws(
    () => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_DEPLOY_ENV: "unknown" }),
    /BLUMI_DEPLOY_ENV/
  )
})

test("disabled payments discard provider credentials and fail closed", async () => {
  const config = resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_PAYMENTS_ENABLED: "0" })
  assert.equal(config.revenueCatApiKey, undefined)
  assert.equal(config.revenueCatProjectId, undefined)
  assert.equal(config.revenueCatWebhookSigningSecret, undefined)
  assert.deepEqual(config.revenueCatCoinProductIdMap, {})
  const services = createConfiguredServerServices(config)
  try {
    await assert.rejects(services.revenueCatPurchaseVerifier.verifyTransactions({
      userId: "user_a", transactionIds: ["transaction_1"]
    }), CommerceProviderUnavailableError)
  } finally {
    await services.close()
  }
  for (const key of Object.keys(REVENUECAT_ENV)) {
    assert.doesNotThrow(() => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_PAYMENTS_ENABLED: "0", [key]: undefined }))
  }
  assert.throws(() => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_PAYMENTS_ENABLED: "false" }), /BLUMI_PAYMENTS_ENABLED/)
  assert.doesNotThrow(() => resolveServerConfig({
    ...VALID_PRODUCTION_ENV,
    BLUMI_PAYMENTS_ENABLED: "0",
    BLUMI_VOICE_ENABLED: "0",
    LIVEKIT_URL: undefined,
    LIVEKIT_API_KEY: undefined,
    LIVEKIT_API_SECRET: undefined
  }))
  assert.throws(() => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_PAYMENTS_ENABLED: "0", EXPO_PUSH_ACCESS_TOKEN: undefined }), /EXPO_PUSH_ACCESS_TOKEN/)
})

test("staging can omit unverified app-link identities without weakening production", () => {
  const staging = resolveServerConfig({
    ...VALID_PRODUCTION_ENV,
    BLUMI_DEPLOY_ENV: "staging",
    REVENUECAT_PURCHASE_ENVIRONMENT: "sandbox",
    BLUMI_PAYMENTS_ENABLED: "0",
    BLUMI_VOICE_ENABLED: "0",
    BLUMI_APPLE_APP_ID: undefined,
    BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS: undefined
  })
  assert.equal(staging.appleAppId, undefined)
  assert.deepEqual(staging.androidAppLinkSha256CertFingerprints, [])
  assert.throws(() => resolveServerConfig({
    ...VALID_PRODUCTION_ENV,
    BLUMI_APPLE_APP_ID: undefined
  }), /BLUMI_APPLE_APP_ID/)
})

test("production-mode purchases require the complete server-only RevenueCat configuration", () => {
  for (const key of Object.keys(REVENUECAT_ENV) as (keyof typeof REVENUECAT_ENV)[]) {
    const incomplete = { ...VALID_PRODUCTION_ENV }
    delete incomplete[key]
    assert.throws(() => resolveServerConfig(incomplete), new RegExp(key))
  }
  assert.throws(
    () => resolveServerConfig({ ...VALID_PRODUCTION_ENV, REVENUECAT_COIN_PRODUCT_ID_MAP: "{}" }),
    /REVENUECAT_COIN_PRODUCT_ID_MAP/
  )
  assert.equal(resolveServerConfig(VALID_PRODUCTION_ENV).revenueCatProjectId, "project_1")
})

test("server uses in-memory auth repository outside production by default", () => {
  const config = resolveServerConfig({
    NODE_ENV: "development"
  })

  assert.equal(config.authRepositoryMode, "memory")
  assert.equal(config.smsProviderMode, "development")
  assert.equal(config.port, 4000)
  assert.deepEqual(config.trustedProxyAddresses, [])
})

test("RevenueCat reconciliation fails closed until the server-only provider configuration exists", async () => {
  const unavailableServices = createConfiguredServerServices(
    resolveServerConfig({ NODE_ENV: "development" })
  )
  await assert.rejects(
    unavailableServices.revenueCatPurchaseVerifier.verifyTransactions({
      userId: "user_a",
      transactionIds: ["transaction_1"]
    }),
    CommerceProviderUnavailableError
  )
  await unavailableServices.close()

  const configuredServices = createConfiguredServerServices(
    resolveServerConfig({
      NODE_ENV: "development",
      REVENUECAT_SECRET_API_KEY: "server_secret",
      REVENUECAT_PROJECT_ID: "project_1",
      REVENUECAT_COIN_PRODUCT_ID_MAP: JSON.stringify({
        rc_product_500: "com.blumi.mobile.coins.500"
      })
    })
  )
  assert.notEqual(
    configuredServices.revenueCatPurchaseVerifier,
    unavailableServices.revenueCatPurchaseVerifier
  )
  await configuredServices.close()
})

test("configured chat hides a blocked pair's thread from both users, including for the realtime server", async () => {
  // index.ts hands this same chatService to createServer and createRealtimeServer.
  const services = createConfiguredServerServices(resolveServerConfig({ NODE_ENV: "development" }))
  try {
    await services.chatService.createThread({
      threadId: "thread_config_block", miniRoomId: "room_config_block",
      participantUserIds: ["user_a", "user_b"], participants: [{ userId: "user_a" }, { userId: "user_b" }]
    })
    // Blocks need existing accounts (2026-10-01).
    for (const [userId, phoneNumber] of [["user_a", "+905551119901"], ["user_b", "+905551119902"]] as const) {
      services.authService.store.accountsByPhone.set(phoneNumber, { ...createAccountRecord(phoneNumber), userId })
    }
    await services.safetyService.blockUser("user_b", "user_a")
    for (const userId of ["user_a", "user_b"]) {
      assert.deepEqual((await services.chatService.listThreadsPage(userId)).threads, [])
      await assert.rejects(services.chatService.listMessages(userId, "thread_config_block"), /not available/)
    }
    await services.safetyService.unblockUser("user_b", "user_a")
    assert.deepEqual((await services.chatService.listThreadsPage("user_a")).threads.map((thread) => thread.threadId),
      ["thread_config_block"])
  } finally {
    await services.close()
  }
})

test("admin signing keyrings rotate by kid and legacy access is explicit development-only", () => {
  const oldSecret = Buffer.alloc(32, 3).toString("base64url")
  const activeSecret = Buffer.alloc(32, 4).toString("base64url")
  const rotating = resolveServerConfig({
    NODE_ENV: "development",
    BLUMI_ADMIN_SIGNING_KEYS: `old=${oldSecret},active=${activeSecret}`,
    BLUMI_ADMIN_ACTIVE_KID: "active"
  })
  assert.deepEqual(rotating.adminSigningKeys.map((key) => key.keyId), ["old", "active"])
  assert.equal(rotating.adminActiveKeyId, "active")

  const legacy = resolveServerConfig({
    NODE_ENV: "development",
    BLUMI_ADMIN_KEY: "development-only",
    BLUMI_ADMIN_LEGACY_KEY_ENABLED: "1"
  })
  assert.equal(legacy.adminLegacyKeyEnabled, true)

  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "development",
      BLUMI_ADMIN_KEY: "silently-enabled-is-unsafe"
    }),
    /explicit/
  )
  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "production",
      BLUMI_ADMIN_KEY: "legacy",
      BLUMI_ADMIN_LEGACY_KEY_ENABLED: "1"
    }),
    /forbidden/
  )
})

test("trusted proxies are explicit addresses instead of blanket trust", () => {
  const config = resolveServerConfig({
    NODE_ENV: "development",
    BLUMI_TRUST_PROXY: "127.0.0.1, 10.0.0.0/8"
  })

  assert.deepEqual(config.trustedProxyAddresses, ["127.0.0.1", "10.0.0.0/8"])
})

test("production fails fast without an explicit trusted proxy list", () => {
  // Without it request.ip is the edge peer, so every per-IP limit would key
  // all clients together.
  assert.throws(
    () => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_TRUST_PROXY: undefined }),
    /BLUMI_TRUST_PROXY is required in production/
  )
  assert.throws(
    () => resolveServerConfig({ ...VALID_PRODUCTION_ENV, BLUMI_TRUST_PROXY: " , " }),
    /BLUMI_TRUST_PROXY is required in production/
  )
  assert.deepEqual(
    resolveServerConfig(VALID_PRODUCTION_ENV).trustedProxyAddresses,
    ["100.64.0.0/10"]
  )
})

test("trusted proxies must be IP addresses or CIDR ranges and never trust everyone", () => {
  for (const value of ["true", "*", "0.0.0.0/0", "::/0", "10.0.0.0/33", "10.0.0/8", "proxy.internal", "fe80::/129", "10.0.0.0/"]) {
    assert.throws(
      () => resolveServerConfig({ NODE_ENV: "development", BLUMI_TRUST_PROXY: value }),
      /BLUMI_TRUST_PROXY/,
      value
    )
  }
  assert.deepEqual(
    resolveServerConfig({ NODE_ENV: "development", BLUMI_TRUST_PROXY: "::1, fd00::/8, 192.168.1.1/32" }).trustedProxyAddresses,
    ["::1", "fd00::/8", "192.168.1.1/32"]
  )
})

test("local QA auth requires a complete loopback-only development setup", async () => {
  const config = resolveServerConfig({
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    BLUMI_SMS_PROVIDER: "development",
    BLUMI_QA_AUTH_ENABLED: "1",
    BLUMI_QA_PHONE_NUMBER: "+12025550123",
    BLUMI_QA_OTP_CODE: "246810"
  })

  assert.deepEqual(config.qaAuth, {
    phoneNumber: "+12025550123",
    verificationCode: "246810"
  })

  const service = createConfiguredServerServices(config).authService
  const now = new Date("2026-07-14T10:00:00.000Z")
  await service.sendCode(config.qaAuth.phoneNumber, now)
  const signedIn = await service.verifyCode(
    config.qaAuth.phoneNumber,
    config.qaAuth.verificationCode,
    now
  )
  assert.equal(signedIn.account.phoneNumber, config.qaAuth.phoneNumber)
})

test("default development auth delegates OTP creation to the normal random factory", () => {
  const config = resolveServerConfig({
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    BLUMI_SMS_PROVIDER: "development",
    BLUMI_QA_AUTH_ENABLED: "0"
  })

  assert.equal(createConfiguredCodeFactory(config), undefined)
})

test("an explicit disabled QA flag is safe in production", () => {
  const config = resolveServerConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
    BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
    BLUMI_PUSH_PROVIDER: "expo",
    EXPO_PUSH_ACCESS_TOKEN: "expo-access-token",
    LIVEKIT_URL: "wss://live.blumi.app",
    LIVEKIT_API_KEY: "livekit-key",
    LIVEKIT_API_SECRET: "livekit-secret",
    ...ADMIN_SIGNING_ENV,
    BLUMI_APPLE_APP_ID: "TEAMID1234.com.blumi.mobile",
    BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    BLUMI_TRUST_PROXY: "100.64.0.0/10",
    ...REVENUECAT_ENV,
    BLUMI_QA_AUTH_ENABLED: "0"
  })

  assert.equal(config.qaAuth, undefined)
})

test("local QA auth refuses persistent repositories", () => {
  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
      BLUMI_AUTH_REPOSITORY: "postgres",
      BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
      BLUMI_SMS_PROVIDER: "development",
      BLUMI_QA_AUTH_ENABLED: "1",
      BLUMI_QA_PHONE_NUMBER: "+12025550123",
      BLUMI_QA_OTP_CODE: "246810"
    }),
    /in-memory auth repository/i
  )
})

test("local QA auth fails closed outside its exact development boundary", () => {
  const validQa = {
    BLUMI_QA_AUTH_ENABLED: "1",
    BLUMI_QA_PHONE_NUMBER: "+12025550123",
    BLUMI_QA_OTP_CODE: "246810"
  }

  assert.throws(
    () => resolveServerConfig({ NODE_ENV: "production", ...validQa }),
    /QA auth/i
  )
  assert.throws(
    () => resolveServerConfig({ NODE_ENV: "development", HOST: "0.0.0.0", ...validQa }),
    /loopback/i
  )
  const firebaseOnlyDevelopment = resolveServerConfig({
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    ...validQa
  })
  assert.deepEqual(firebaseOnlyDevelopment.qaAuth, {
    phoneNumber: "+12025550123",
    verificationCode: "246810"
  })
  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      BLUMI_QA_AUTH_ENABLED: "1",
      BLUMI_QA_PHONE_NUMBER: "2025550123",
      BLUMI_QA_OTP_CODE: "abc123"
    }),
    /QA auth/i
  )
  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "development",
      BLUMI_QA_PHONE_NUMBER: "+12025550123"
    }),
    /QA auth/i
  )
})

test("production requires a postgres repository and database url", () => {
  assert.throws(
    () => resolveServerConfig({ NODE_ENV: "production" }),
    /DATABASE_URL/
  )

  const config = resolveServerConfig({
    NODE_ENV: "production",
    PORT: "8080",
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
    BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
    BLUMI_PUSH_PROVIDER: "expo",
    EXPO_PUSH_ACCESS_TOKEN: "expo-access-token",
    LIVEKIT_URL: "wss://live.blumi.app",
    LIVEKIT_API_KEY: "livekit-key",
    LIVEKIT_API_SECRET: "livekit-secret",
    ...ADMIN_SIGNING_ENV,
    BLUMI_APPLE_APP_ID: "TEAMID1234.com.blumi.mobile",
    BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    BLUMI_TRUST_PROXY: "100.64.0.0/10",
    ...REVENUECAT_ENV
  })
  assert.equal(config.authRepositoryMode, "postgres")
  assert.equal(config.smsProviderMode, "development")
  assert.equal(config.port, 8080)
  assert.equal(config.realtimePort, 8080)

  const legacySplitPorts = resolveServerConfig({
    NODE_ENV: "production",
    PORT: "8080",
    REALTIME_PORT: "4100",
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
    BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
    BLUMI_PUSH_PROVIDER: "expo",
    EXPO_PUSH_ACCESS_TOKEN: "expo-access-token",
    LIVEKIT_URL: "wss://live.blumi.app",
    LIVEKIT_API_KEY: "livekit-key",
    LIVEKIT_API_SECRET: "livekit-secret",
    ...ADMIN_SIGNING_ENV,
    BLUMI_APPLE_APP_ID: "TEAMID1234.com.blumi.mobile",
    BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    BLUMI_TRUST_PROXY: "100.64.0.0/10",
    ...REVENUECAT_ENV
  })
  assert.equal(legacySplitPorts.realtimePort, 4100)
})

test("postgres mode requires database url in every environment", () => {
  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "development",
      BLUMI_AUTH_REPOSITORY: "postgres"
    }),
    /DATABASE_URL/
  )
})

test("unsupported repository mode fails fast", () => {
  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "development",
      BLUMI_AUTH_REPOSITORY: "sqlite"
    }),
    /Unsupported/
  )
})

test("production requires the Expo push provider and access token", () => {
  const productionBase = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
    BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters"
  }

  assert.throws(
    () => resolveServerConfig(productionBase),
    /BLUMI_PUSH_PROVIDER/
  )
  assert.throws(
    () => resolveServerConfig({
      ...productionBase,
      BLUMI_PUSH_PROVIDER: "expo"
    }),
    /EXPO_PUSH_ACCESS_TOKEN/
  )
})

test("production refuses live voice and still validates operator signing secrets", () => {
  const productionBase = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
    BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
    BLUMI_PUSH_PROVIDER: "expo",
    EXPO_PUSH_ACCESS_TOKEN: "expo-access-token"
  }

  assert.throws(
    () => resolveServerConfig({ ...productionBase, BLUMI_VOICE_ENABLED: "1" }),
    /Live voice and microphone access are disabled/
  )
  assert.throws(
    () => resolveServerConfig({
      ...productionBase,
      BLUMI_ADMIN_SIGNING_KEYS: "active=too-short",
      BLUMI_ADMIN_ACTIVE_KID: "active"
    }),
    /32 bytes/
  )
})

test("production requires verified universal-link identities", () => {
  const production = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
    BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
    BLUMI_PUSH_PROVIDER: "expo",
    EXPO_PUSH_ACCESS_TOKEN: "expo-access-token",
    LIVEKIT_URL: "wss://live.blumi.app",
    LIVEKIT_API_KEY: "livekit-key",
    LIVEKIT_API_SECRET: "livekit-secret",
    ...ADMIN_SIGNING_ENV
  }
  assert.throws(() => resolveServerConfig(production), /BLUMI_APPLE_APP_ID/)
  assert.throws(
    () => resolveServerConfig({
      ...production,
      BLUMI_APPLE_APP_ID: "TEAMID1234.com.blumi.mobile"
    }),
    /BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS/
  )
})

test("production requires a dedicated high-entropy OTP HMAC secret", () => {
  const productionBase = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
  }

  assert.throws(() => resolveServerConfig(productionBase), /BLUMI_OTP_HMAC_SECRET/)
  assert.throws(
    () => resolveServerConfig({
      ...productionBase,
      BLUMI_OTP_HMAC_SECRET: "too-short"
    }),
    /BLUMI_OTP_HMAC_SECRET/
  )
})

test("the session cache and request budget default to in-process, with switches for scaling out", () => {
  const defaults = resolveServerConfig({})
  assert.equal(defaults.sessionCacheTtlMs, 15_000)
  assert.equal(defaults.rateBudgetStore, "memory")
  assert.equal(resolveServerConfig({ BLUMI_SESSION_CACHE_TTL_MS: "0" }).sessionCacheTtlMs, 0)
  assert.equal(resolveServerConfig({ BLUMI_RATE_BUDGET_STORE: "postgres" }).rateBudgetStore, "postgres")
  assert.throws(() => resolveServerConfig({ BLUMI_SESSION_CACHE_TTL_MS: "60000" }), /BLUMI_SESSION_CACHE_TTL_MS/)
  assert.throws(() => resolveServerConfig({ BLUMI_SESSION_CACHE_TTL_MS: "-1" }), /BLUMI_SESSION_CACHE_TTL_MS/)
  assert.throws(() => resolveServerConfig({ BLUMI_RATE_BUDGET_STORE: "redis" }), /BLUMI_RATE_BUDGET_STORE/)
})
