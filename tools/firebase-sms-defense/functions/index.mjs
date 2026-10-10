import { beforeSmsSent } from "firebase-functions/v2/identity"
import { defineSecret, defineString } from "firebase-functions/params"
import { createDatabasePool } from "./databasePool.mjs"
import { createPostgresSmsAdmission } from "./lib/admission.mjs"
import { createBeforeSmsHandler } from "./adapter.mjs"
import schemaLock from "./schema-lock.json" with { type: "json" }
import { smsHmacKey as hmacKey } from "./secrets.mjs"
export { blumiSmsDeviceGate } from "./deviceGate.mjs"

// This production blocking trigger must never accept emulator/debug tokens.
if (process.env.FIREBASE_DEBUG_MODE === "true" || process.env.FUNCTIONS_EMULATOR === "true" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("SMS defense refuses emulator or debug token verification.")
}

// Provision a dedicated least-privilege database identity; never copy the
// API's unrestricted database credential into this separate service.
const databaseUrl = defineSecret("BLUMI_SMS_DEFENSE_DATABASE_URL")
const serviceIdentity = defineString("BLUMI_SMS_DEFENSE_SERVICE_ACCOUNT", {
  description: "Dedicated same-project SMS defense service account; never the default account."
})
let reserve
function getReservation() {
  if (reserve) return reserve
  if (serviceIdentity.value() !== `blumi-sms-defense@${process.env.GCLOUD_PROJECT}.iam.gserviceaccount.com`) {
    throw new Error("A dedicated SMS defense service identity is required")
  }
  const pool = createDatabasePool(databaseUrl.value())
  reserve = createPostgresSmsAdmission({
    pool, hmacSecret: hmacKey.value(), projectId: process.env.GCLOUD_PROJECT,
    expectedMigrationChecksum: schemaLock.checksum
  })
  return reserve
}

export const blumiBeforeSmsSent = beforeSmsSent({
  region: "europe-west1", minInstances: 0, maxInstances: 2,
  concurrency: 1, timeoutSeconds: 6, memory: "256MiB", cpu: "gcf_gen1",
  serviceAccount: serviceIdentity,
  secrets: [databaseUrl, hmacKey]
}, createBeforeSmsHandler(event => getReservation()(event)))
