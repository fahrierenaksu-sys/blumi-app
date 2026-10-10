import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { spawnSync } from "node:child_process"
import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { beforeSmsSent, HttpsError } from "firebase-functions/v2/identity"
import { createBeforeSmsHandler } from "./adapter.mjs"

test("the deployable export declares the blocking event and a separate bounded runtime", async () => {
  const { blumiBeforeSmsSent } = await import("./index.mjs")
  const endpoint = blumiBeforeSmsSent.__endpoint
  assert.equal(endpoint.blockingTrigger.eventType, "providers/cloud.auth/eventTypes/user.beforeSendSms")
  assert.equal(endpoint.timeoutSeconds, 6)
  assert.equal(endpoint.maxInstances, 2)
  assert.equal(endpoint.concurrency, 1)
  assert.ok(endpoint.serviceAccountEmail)
  assert.equal(endpoint.secretEnvironmentVariables.length, 2)
})

test("the deployed function refuses debug or emulator token verification", () => {
  const moduleUrl = new URL("./index.mjs", import.meta.url).href
  for (const change of [{ FIREBASE_DEBUG_MODE: "true" }, { FUNCTIONS_EMULATOR: "true" },
    { FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099" }]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval",
      `await import(${JSON.stringify(moduleUrl)})`], { env: { ...process.env, ...change }, encoding: "utf8" })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /refuses emulator or debug token verification/)
  }
})

test("the device callable has a separate bounded identity and rejects missing or replayed app proofs", async () => {
  const { blumiSmsDeviceGate } = await import("./index.mjs")
  const endpoint = blumiSmsDeviceGate.__endpoint
  assert.ok(endpoint.callableTrigger)
  assert.ok(endpoint.serviceAccountEmail)
  assert.equal(endpoint.timeoutSeconds, 15)
  assert.equal(endpoint.maxInstances, 2)
  assert.equal(endpoint.concurrency, 1)
  assert.equal(endpoint.secretEnvironmentVariables.length, 2)
  for (const app of [undefined, { appId: "fixture", alreadyConsumed: true }]) {
    await assert.rejects(blumiSmsDeviceGate.run({ app, data: { action: "challenge", platform: "android", phoneNumber: "+12025550101" } }),
      error => error.code === "permission-denied" && !error.message.includes("fixture"))
  }
})

// Exercise the installed SDK's HTTP wrapper and actual event conversion.
// Provider cryptography is mocked here; live invocation remains a release gate.
test("the signed provider wrapper passes the real SDK event shape to admission", async () => {
  const previous = process.env.GCLOUD_PROJECT
  process.env.GCLOUD_PROJECT = "fixture-project"
  if (!getApps().length) initializeApp({ projectId: "fixture-project" })
  const auth = getAuth()
  const payload = { aud: "https://fixture.run.app", event_type: "beforeSendSms",
    event_id: "fixture-event", iat: Math.floor(Date.now() / 1000),
    sms_type: "SIGN_IN_OR_SIGN_UP", phone_number: "+15550000001", ip_address: "203.0.113.7", recaptcha_score: 0.7 }
  const jwt = [Buffer.from('{"alg":"RS256"}').toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"), "fixture"].join(".")
  const verification = mock.method(auth, "_verifyAuthBlockingToken", async token => {
    assert.equal(token, jwt)
    return payload
  })
  let received
  const handler = beforeSmsSent(createBeforeSmsHandler(async event => {
    received = event
    return { allowed: false }
  }))
  const response = () => ({ statusCode: null, body: null,
    status(code) { this.statusCode = code; return this }, setHeader() {},
    send(body) { this.body = typeof body === "string" ? JSON.parse(body) : body; return this } })
  const request = { method: "POST", header: () => "application/json", body: { data: { jwt } } }
  try {
    const res = response()
    await handler(request, res)
    assert.equal(verification.mock.callCount(), 1)
    assert.equal(received.resource, "projects/fixture-project")
    assert.equal(received.phoneNumber, payload.phone_number)
    assert.equal(received.ipAddress, payload.ip_address)
    assert.equal(received.smsType, "SIGN_IN_OR_SIGN_UP")
    assert.equal(received.recaptchaScore, 0.7)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.recaptchaActionOverride, "BLOCK")

    received = null
    verification.mock.mockImplementation(async () => { throw new HttpsError("unauthenticated", "Rejected") })
    const rejected = response()
    await handler(request, rejected)
    assert.equal(received, null)
    assert.equal(rejected.statusCode, 401)
  } finally {
    verification.mock.restore()
    if (previous === undefined) delete process.env.GCLOUD_PROJECT
    else process.env.GCLOUD_PROJECT = previous
  }
})
