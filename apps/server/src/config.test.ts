import assert from "node:assert/strict"
import test from "node:test"
import {
  createConfiguredServerServices,
  createConfiguredAuthService,
  createConfiguredCodeFactory,
  resolveServerConfig
} from "./config"
import { CommerceProviderUnavailableError } from "./commerce/revenueCatPurchaseVerifier"

test("purchase environments default to production and cannot enable sandbox in production", () => {
  assert.equal(resolveServerConfig({}).purchaseEnvironment, "production")
  assert.equal(resolveServerConfig({ REVENUECAT_PURCHASE_ENVIRONMENT: "sandbox" }).purchaseEnvironment, "sandbox")
  assert.throws(() => resolveServerConfig({ NODE_ENV: "production", REVENUECAT_PURCHASE_ENVIRONMENT: "sandbox" }), /purchase environment/i)
  assert.throws(() => resolveServerConfig({ REVENUECAT_PURCHASE_ENVIRONMENT: "unknown" }), /purchase environment/i)
})

const ADMIN_SIGNING_SECRET = Buffer.alloc(32, 7).toString("base64url")
const ADMIN_SIGNING_ENV = {
  BLUMI_ADMIN_SIGNING_KEYS: `active=${ADMIN_SIGNING_SECRET}`,
  BLUMI_ADMIN_ACTIVE_KID: "active"
}

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

  const service = createConfiguredAuthService(config)
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
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_FROM_PHONE_NUMBER: "+15551234567",
    BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
    BLUMI_PUSH_PROVIDER: "expo",
    EXPO_PUSH_ACCESS_TOKEN: "expo-access-token",
    LIVEKIT_URL: "wss://live.blumi.app",
    LIVEKIT_API_KEY: "livekit-key",
    LIVEKIT_API_SECRET: "livekit-secret",
    ...ADMIN_SIGNING_ENV,
    BLUMI_APPLE_APP_ID: "TEAMID1234.com.blumi.mobile",
    BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
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
  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      BLUMI_SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "token",
      TWILIO_FROM_PHONE_NUMBER: "+15551234567",
      ...validQa
    }),
    /development SMS/i
  )
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
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_FROM_PHONE_NUMBER: "+15551234567",
    BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
    BLUMI_PUSH_PROVIDER: "expo",
    EXPO_PUSH_ACCESS_TOKEN: "expo-access-token",
    LIVEKIT_URL: "wss://live.blumi.app",
    LIVEKIT_API_KEY: "livekit-key",
    LIVEKIT_API_SECRET: "livekit-secret",
    ...ADMIN_SIGNING_ENV,
    BLUMI_APPLE_APP_ID: "TEAMID1234.com.blumi.mobile",
    BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"
  })
  assert.equal(config.authRepositoryMode, "postgres")
  assert.equal(config.smsProviderMode, "twilio")
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

test("twilio mode requires provider credentials", () => {
  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "development",
      BLUMI_SMS_PROVIDER: "twilio"
    }),
    /Twilio/
  )
})

test("production requires twilio sms provider", () => {
  assert.throws(
    () => resolveServerConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
      BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
      BLUMI_SMS_PROVIDER: "development"
    }),
    /BLUMI_SMS_PROVIDER/
  )
})

test("production requires the Expo push provider and access token", () => {
  const productionBase = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_FROM_PHONE_NUMBER: "+15551234567",
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

test("production requires secure LiveKit and moderation configuration", () => {
  const productionBase = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://blumi:test@localhost:5432/blumi",
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_FROM_PHONE_NUMBER: "+15551234567",
    BLUMI_OTP_HMAC_SECRET: "otp-hmac-secret-that-is-at-least-32-characters",
    BLUMI_PUSH_PROVIDER: "expo",
    EXPO_PUSH_ACCESS_TOKEN: "expo-access-token"
  }

  assert.throws(
    () => resolveServerConfig(productionBase),
    /LIVEKIT_URL/
  )
  assert.throws(
    () => resolveServerConfig({
      ...productionBase,
      LIVEKIT_URL: "https://live.blumi.app",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret"
    }),
    /WSS/
  )
  assert.throws(
    () => resolveServerConfig({
      ...productionBase,
      LIVEKIT_URL: "wss://live.blumi.app",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
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
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_FROM_PHONE_NUMBER: "+15551234567",
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
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_FROM_PHONE_NUMBER: "+15551234567"
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
