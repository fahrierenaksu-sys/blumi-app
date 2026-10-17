import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret, defineString } from "firebase-functions/params"
import { GoogleAuth } from "google-auth-library"
import { createDatabasePool } from "./databasePool.mjs"
import { createSmsDeviceGate } from "./lib/device-gate.mjs"
import { createSmsDeviceProofVerifier } from "./lib/device-proof.mjs"
import schemaLock from "./schema-lock.json" with { type: "json" }
import { smsHmacKey as hmacKey } from "./secrets.mjs"
import { createCallableBudget } from "./callBudget.mjs"
import { APP_CHECK_REJECTED, CALL_BUDGET_REJECTED, logSmsRefusal, smsGateRefusalReason } from "./refusalLog.mjs"
import { randomBytes } from "node:crypto"
const withinCallBudget = createCallableBudget({ secret: randomBytes(32), report: counts => console.info(counts) })

const databaseUrl = defineSecret("BLUMI_SMS_DEVICE_GATE_DATABASE_URL")
const serviceIdentity = defineString("BLUMI_SMS_DEVICE_GATE_SERVICE_ACCOUNT")
const appleTeamId = defineString("BLUMI_SMS_APPLE_TEAM_ID")
const androidCertificates = defineString("BLUMI_SMS_ANDROID_CERTIFICATE_HASHES")
const appleAppId = defineString("BLUMI_SMS_APPLE_FIREBASE_APP_ID")
const androidAppId = defineString("BLUMI_SMS_ANDROID_FIREBASE_APP_ID")
let gate
function getGate() {
  if (gate) return gate
  if (serviceIdentity.value() !== `blumi-sms-device-gate@${process.env.GCLOUD_PROJECT}.iam.gserviceaccount.com`) {
    throw new Error("A dedicated SMS device gate identity is required")
  }
  const pool = createDatabasePool(databaseUrl.value())
  const google = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/playintegrity"] })
  const verifyProof = createSmsDeviceProofVerifier({ appleTeamId: appleTeamId.value(), bundleId: "com.blumi.mobile",
    androidCertificateHashes: androidCertificates.value().split(",").map(value => value.trim()),
    decodePlayIntegrity: async token => {
      const client = await google.getClient()
      const response = await client.request({
        url: "https://playintegrity.googleapis.com/v1/com.blumi.mobile:decodeIntegrityToken", method: "POST",
        data: { integrity_token: token }, timeout: 5000, retry: false
      })
      return response.data
    }
  })
  gate = createSmsDeviceGate({ pool, projectId: process.env.GCLOUD_PROJECT,
    hmacSecret: hmacKey.value(), expectedMigrationChecksum: schemaLock.checksum, verifyProof })
  return gate
}

export const blumiSmsDeviceGate = onCall({
  region: "europe-west1", minInstances: 0, maxInstances: 2, concurrency: 1,
  timeoutSeconds: 15, memory: "256MiB", cpu: "gcf_gen1", serviceAccount: serviceIdentity,
  secrets: [databaseUrl, hmacKey], enforceAppCheck: true, consumeAppCheckToken: true
}, async request => {
  const data = request.data
  try {
    if (!data || typeof data !== "object" || Array.isArray(data) ||
      !["ios", "android"].includes(data.platform) || typeof data.phoneNumber !== "string" ||
      data.phoneNumber.length > 16) {
      throw new Error("Rejected")
    }
    if (!request.app || request.app.alreadyConsumed ||
      request.app.appId !== (data.platform === "ios" ? appleAppId.value() : androidAppId.value())) {
      throw new Error(APP_CHECK_REJECTED)
    }
    if (!withinCallBudget(request.rawRequest.ip)) throw new Error(CALL_BUDGET_REJECTED)
    if (data.action === "challenge") {
      if (data.installationId !== undefined && (typeof data.installationId !== "string" || data.installationId.length > 64)) throw new Error("Rejected")
      return await getGate().challenge({ platform: data.platform, installationId: data.installationId,
        phoneNumber: data.phoneNumber, ipAddress: request.rawRequest.ip })
    }
    if (data.action === "permit" && typeof data.installationId === "string" && data.installationId.length <= 64 &&
      typeof data.challenge === "string" && data.challenge.length === 43 &&
      typeof data.proof === "string" && data.proof.length <= 130_000) {
      return await getGate().permit({ platform: data.platform, installationId: data.installationId,
        challenge: data.challenge, phoneNumber: data.phoneNumber, proof: data.proof })
    }
    throw new Error("Rejected")
  } catch (error) {
    // No raw request, proof, key, phone, IP or provider error in logs/errors:
    // only a fixed reason code, so an expired price is not mistaken for App Check.
    logSmsRefusal("blumi_sms_gate_refused", smsGateRefusalReason(error))
    throw new HttpsError("permission-denied", "SMS verification is unavailable. Try again later.")
  }
})
