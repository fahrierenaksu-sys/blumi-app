import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { isDeepStrictEqual, parseEnv as parseEnvironment } from "node:util"
import { randomInt, randomUUID, X509Certificate } from "node:crypto"
import { open, link, unlink, readFile } from "node:fs/promises"
import { createInterface } from "node:readline"
import pg from "pg"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"
import { createAuditController, TARGET_ORIGIN } from "./live-authenticated-audit.mjs"

const executeFile = promisify(execFile)
const GOOGLE_ORIGIN = "https://identitytoolkit.googleapis.com"
const PROJECT = "blumi-mobile-eren"
const CONFIG_PATH = `/admin/v2/projects/${PROJECT}/config`
const PLIST = "/Users/evrenevren/blumisonv2/apps/mobile/GoogleService-Info.plist"
const AUDIT_ENV = fileURLToPath(new URL("../../.env.local", import.meta.url))
const REPORT = fileURLToPath(new URL("../../docs/quality/API_LIVE_TEST_ACCOUNT_EVIDENCE_2026-10-10.json", import.meta.url))
const TERMS = "2026.09.28-r3"
const LIMIT = 256 * 1024
const TOKEN = /^dv_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const record = value => value !== null && typeof value === "object" && !Array.isArray(value)
class SetupError extends Error { constructor(code) { super(code); this.code = code } }
const fail = code => { throw new SetupError(code) }
const errorCode = error => error instanceof SetupError ? error.code : "OPERATION_UNAVAILABLE"
const allSteps = (status, expected) => record(status) && ["profile", "avatar", "room"].every(key => status[key] === expected)
export const createMockRecaptcha = () => {
  const alphabet = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  return Array.from({ length: 50 }, () => alphabet[randomInt(alphabet.length)]).join("")
}
export function createFictionalPairGenerator() {
  const first = randomInt(100, 200)
  const candidate = randomInt(100, 199)
  const pair = [first, candidate >= first ? candidate + 1 : candidate]
  return () => {
    if (pair.length === 0) fail("FICTIONAL_PAIR_REQUIRED")
    return `+1650555${String(pair.shift()).padStart(4, "0")}`
  }
}

// All returned credentials remain in the caller's process; subprocess output is never forwarded.
export async function loadPrivateConfiguration(runFile = executeFile) {
  try {
    const options = { encoding: "utf8", timeout: 8_000, maxBuffer: LIMIT }
    const project = (await runFile("/usr/bin/plutil", ["-extract", "PROJECT_ID", "raw", "-o", "-", PLIST], options)).stdout.trim()
    if (project !== PROJECT) fail("PROJECT_MISMATCH")
    const apiKey = (await runFile("/usr/bin/plutil", ["-extract", "API_KEY", "raw", "-o", "-", PLIST], options)).stdout.trim()
    const accessToken = (await runFile("gcloud", ["auth", "print-access-token", "--configuration=blumi-live-audit"], options)).stdout.trim()
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(apiKey) || !accessToken || accessToken.length > 16_384 || /\s/.test(accessToken)) fail("PRIVATE_CONFIGURATION_UNAVAILABLE")
    return { project, apiKey, accessToken }
  } catch (error) { throw new SetupError(errorCode(error)) }
}

export async function loadDatabaseCa(path, readCertificate = readFile) {
  try {
    if (typeof path !== "string" || !path || /[\u0000-\u001f]/.test(path)) fail("DATABASE_CA_INVALID")
    const data = await readCertificate(path)
    if (!Buffer.isBuffer(data) || data.length === 0 || data.length > LIMIT) fail("DATABASE_CA_INVALID")
    const pem = data.toString("utf8")
    if (/PRIVATE KEY/.test(pem)) fail("DATABASE_CA_INVALID")
    const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
    if (!certificates || certificates.length > 16 || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, "").trim()) fail("DATABASE_CA_INVALID")
    if (certificates.some(certificate => new X509Certificate(certificate).ca !== true)) fail("DATABASE_CA_INVALID")
    return pem
  } catch { fail("DATABASE_CA_INVALID") }
}

export async function openReadonlyProof(numbers, { readEnvironment = () => readFile(AUDIT_ENV, "utf8"), Client = pg.Client,
  databaseCaFile = null, readCertificate = readFile } = {}) {
  let client = null
  try {
    const dsn = parseEnvironment(await readEnvironment()).DATABASE_URL
    const url = new URL(dsn)
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
        !/\.(?:supabase\.co|supabase\.com)$/.test(url.hostname)) fail("READONLY_DATABASE_UNAVAILABLE")
    // pg connection-string SSL options can overwrite explicit SSL configuration. Remove them and
    // enforce certificate verification; startup defaults are defense in depth, while the
    // explicit transaction and server-side check below are authoritative for read-only mode.
    for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat", "options"]) url.searchParams.delete(key)
    const ca = databaseCaFile === null ? null : await loadDatabaseCa(databaseCaFile, readCertificate)
    client = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
      connectionTimeoutMillis: 8_000, query_timeout: 5_000,
      options: "-c default_transaction_read_only=on -c statement_timeout=5000" })
    client.on("error", () => {}) // Never emit a raw pg error, DSN or server response.
    await client.connect()
    // Poolers can ignore startup GUCs. Pin this transaction to read committed so each
    // later SELECT sees the normal API's committed signup, and verify the server's actual mode.
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY")
    await client.query("SET LOCAL statement_timeout = '5s'")
    const result = await client.query("SELECT current_setting('transaction_read_only') = 'on' AS readonly, NOT EXISTS (SELECT 1 FROM blumi_accounts WHERE phone_number = ANY($1::text[])) AS absent, clock_timestamp() AS checked_at", [numbers])
    if (result.rows.length !== 1 || result.rows[0].readonly !== true) fail("READONLY_TRANSACTION_REQUIRED")
    if (result.rows.length !== 1 || result.rows[0].absent !== true || !Number.isFinite(new Date(result.rows[0].checked_at).getTime())) fail("TEST_PHONE_ALREADY_PRESENT")
    const checkedAt = result.rows[0].checked_at
    let proofs = 0
    return {
      verifyCreated: async (phone, userId) => {
        try {
          if (++proofs > 2 || !numbers.includes(phone)) fail("READONLY_PROOF_SCOPE_REJECTED")
          const proof = await client.query("SELECT EXISTS (SELECT 1 FROM blumi_accounts WHERE phone_number = $1 AND user_id = $2 AND created_at >= $3::timestamptz) AS fresh", [phone, userId, checkedAt])
          return proof.rows.length === 1 && proof.rows[0].fresh === true
        } catch (error) { throw new SetupError(errorCode(error)) }
      },
      close: async () => {
        try { await client.query("ROLLBACK") }
        catch { fail("READONLY_DATABASE_CLOSE_FAILED") }
        finally { try { await client.end() } catch { fail("READONLY_DATABASE_CLOSE_FAILED") } }
      }
    }
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {})
      await client.end().catch(() => {})
    }
    throw new SetupError(errorCode(error))
  }
}

export async function writeRunnerEvidence(evidence, path = REPORT) {
  const temporary = `${path}.${randomUUID()}.tmp`
  let created = false
  try {
    const file = await open(temporary, "wx", 0o600)
    created = true
    try { await file.writeFile(JSON.stringify(evidence, null, 2) + "\n"); await file.sync() } finally { await file.close() }
    // link is atomic and refuses to replace an existing report.
    await link(temporary, path)
  } finally { if (created) await unlink(temporary) }
}

function configurationWithoutFixtures(config) {
  const copy = structuredClone(config)
  if (record(copy.signIn?.phoneNumber)) delete copy.signIn.phoneNumber.testPhoneNumbers
  return copy
}
function fixtureMap(config) {
  const map = config?.signIn?.phoneNumber?.testPhoneNumbers
  if (map === undefined) return {}
  if (!record(map) || Object.values(map).some(value => typeof value !== "string")) fail("INVALID_TEST_CONFIGURATION")
  return map
}
function starterV1(selection) {
  const loadout = selection?.loadout
  const keys = ["bodyId", "faceId", "eyesId", "noseId", "mouthId", "hairId", "topId", "bottomId", "shoesId"]
  if (selection?.revision !== 0 || !record(loadout) || ![1, 2].includes(loadout.schemaVersion) ||
      !keys.every(key => typeof loadout[key] === "string" && /^[a-z0-9_-]{1,120}$/.test(loadout[key])) ||
      selection.presetId !== loadout.bodyId || !Array.isArray(loadout.accessoryIds) || loadout.accessoryIds.length !== 0 ||
      (loadout.schemaVersion === 2 && (loadout.dressId !== null || loadout.outerwearId !== null))) fail("UNEXPECTED_STARTER_AVATAR")
  return { schemaVersion: 1, ...Object.fromEntries(keys.map(key => [key, loadout[key]])), accessoryIds: [] }
}
function assertNewActor(actor) {
  if (!record(actor?.session) || actor.session.mode !== "production" || !TOKEN.test(actor.session.sessionToken ?? "") ||
      typeof actor.session.userId !== "string" || !actor.session.userId || actor.session.userId.length > 256 ||
      actor.profile?.userId !== actor.session.userId || actor.profile.displayName !== "" || actor.profile.age !== undefined ||
      !allSteps(actor.session.onboarding, "incomplete") || !Number.isFinite(Date.parse(actor.session.expiresAt)) ||
      Date.parse(actor.session.expiresAt) <= Date.now()) fail("NEW_INCOMPLETE_ACCOUNT_REQUIRED")
  return starterV1(actor.profile.avatar)
}

export function createTestAccountRunner({ fetchImpl = fetch, loadConfiguration = loadPrivateConfiguration,
  databaseCaFile = null, exclusiveConfigWindowAcknowledged = false,
  readonlyProof = numbers => openReadonlyProof(numbers, { databaseCaFile }),
  writeEvidence = writeRunnerEvidence, clock = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  makeNumber = createFictionalPairGenerator(),
  makeCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0"),
  makeRecaptcha = createMockRecaptcha }) {
  let used = false
  let recovery = null
  let lastBlumi = null
  const outcomes = []
  const counts = { googleRequests: 0, blumiSetupRequests: 0, blumiCreateResponsesSuccessful: 0, firebaseNewAccountsConfirmed: 0,
    blumiNewAccountsConfirmed: 0, onboardingAccountsConfirmed: 0 }
  async function paceBlumi() {
    if (lastBlumi !== null && clock() - lastBlumi < 1_200) await sleep(1_200 - (clock() - lastBlumi))
    lastBlumi = clock()
  }

  async function request(origin, path, { method = "GET", body, bearer, apiKey, signal, stage }) {
    const allowedGoogle = (path === CONFIG_PATH && ["GET", "PATCH"].includes(method)) ||
      (["/v1/accounts:sendVerificationCode", "/v1/accounts:signInWithPhoneNumber"].includes(path) && method === "POST")
    const allowedBlumi = (path === "/v1/auth/firebase/complete" && method === "POST") ||
      (["/v1/users/me", "/v1/users/me/onboarding"].includes(path) && method === "PATCH") ||
      (["/v1/users/me/avatar", "/v1/users/me/room-decor"].includes(path) && method === "PUT")
    if (!(origin === GOOGLE_ORIGIN ? allowedGoogle : origin === TARGET_ORIGIN && allowedBlumi)) fail("REQUEST_SCOPE_REJECTED")
    const url = new URL(path, origin)
    if (apiKey) url.searchParams.set("key", apiKey)
    if (method === "PATCH" && origin === GOOGLE_ORIGIN) url.searchParams.set("updateMask", "signIn.phoneNumber.testPhoneNumbers")
    if (origin === TARGET_ORIGIN) {
      await paceBlumi()
      counts.blumiSetupRequests++
      if (counts.blumiSetupRequests > 14) fail("SETUP_REQUEST_LIMIT")
    } else {
      counts.googleRequests++
      // Additional requests are allowed only by an explicit recovery command after the first run.
      if (!recovery && counts.googleRequests > 10) fail("GOOGLE_REQUEST_LIMIT")
    }
    const deadline = AbortSignal.any([AbortSignal.timeout(8_000), ...(signal ? [signal] : [])])
    const outcome = { stage, method, routeTemplate: path === CONFIG_PATH ? "/admin/v2/projects/:projectId/config" : path, httpStatus: null }
    outcomes.push(outcome)
    let response
    try {
      response = await fetchImpl(url.href, { method, redirect: "error", credentials: "omit", signal: deadline,
        headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
          ...(origin === GOOGLE_ORIGIN && bearer ? { "x-goog-user-project": PROJECT } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      outcome.httpStatus = response.status
      if (origin === TARGET_ORIGIN && path === "/v1/auth/firebase/complete" && response.ok) counts.blumiCreateResponsesSuccessful++
      if (response.redirected || (response.url && new URL(response.url).origin !== origin)) fail("OFF_TARGET_RESPONSE")
      if (Number(response.headers.get("content-length") ?? 0) > LIMIT || !response.body) fail("INVALID_RESPONSE")
      const reader = response.body.getReader()
      const chunks = []
      let size = 0
      try {
        for (;;) {
          if (deadline.aborted) fail("OPERATION_CANCELLED")
          const result = await reader.read()
          if (result.done) break
          size += result.value.byteLength
          if (size > LIMIT) fail("RESPONSE_TOO_LARGE")
          chunks.push(result.value)
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      if (!response.ok) fail(`${stage}_HTTP_REJECTED`)
      try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { fail("INVALID_RESPONSE") }
    } catch (error) { outcome.failureCode = errorCode(error); throw new SetupError(errorCode(error)) }
  }

  async function execute({ signal } = {}) {
    if (used) fail("ONE_RUN_ONLY")
    used = true
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") fail("STRICT_TLS_REQUIRED")
    let credentials = null
    let owned = null
    let mutationAttempted = false
    let controller = null
    let actors = { A: null, B: null }
    let stopReason = null
    let cleanupError = null
    let cleanupVerified = false
    let fixturesAddedVerified = false
    let auditEvidence = null
    let databaseProof = null
    let databaseAbsenceVerified = false
    let databaseFreshRowsVerified = 0
    const cancelAudit = () => controller?.clear()
    signal?.addEventListener("abort", cancelAudit)
    try {
      if (exclusiveConfigWindowAcknowledged !== true) fail("EXCLUSIVE_CONFIG_WINDOW_REQUIRED")
      credentials = await loadConfiguration()
      if (credentials?.project !== PROJECT || !credentials.apiKey || !credentials.accessToken) fail("PROJECT_MISMATCH")
      const numbers = [makeNumber(), makeNumber()]
      const codes = [makeCode(), makeCode()]
      if (new Set(numbers).size !== 2 || !numbers.every(value => /^\+165055501\d{2}$/.test(value)) ||
          !codes.every(value => /^\d{6}$/.test(value))) fail("FICTIONAL_PAIR_REQUIRED")
      owned = Object.fromEntries(numbers.map((number, index) => [number, codes[index]]))
      databaseProof = await readonlyProof(numbers)
      databaseAbsenceVerified = true
      const config = await request(GOOGLE_ORIGIN, CONFIG_PATH, { bearer: credentials.accessToken, signal, stage: "CONFIG_READ" })
      if (config?.signIn?.phoneNumber?.enabled !== true || Object.keys(fixtureMap(config)).length !== 0) fail("EMPTY_ENABLED_TEST_CONFIGURATION_REQUIRED")
      mutationAttempted = true // A lost PATCH response may still mean the server applied it.
      await request(GOOGLE_ORIGIN, CONFIG_PATH, { method: "PATCH", bearer: credentials.accessToken,
        body: { signIn: { phoneNumber: { testPhoneNumbers: owned } } }, signal, stage: "CONFIG_ADD" })
      const updated = await request(GOOGLE_ORIGIN, CONFIG_PATH, { bearer: credentials.accessToken, signal, stage: "CONFIG_VERIFY" })
      if (!isDeepStrictEqual(fixtureMap(updated), owned) ||
          !isDeepStrictEqual(configurationWithoutFixtures(updated), configurationWithoutFixtures(config))) fail("CONFIGURATION_CHANGED_UNEXPECTEDLY")
      fixturesAddedVerified = true
      for (const [index, label] of ["A", "B"].entries()) {
        if (signal?.aborted) fail("OPERATION_CANCELLED")
        const recaptcha = makeRecaptcha()
        if (!/^[A-Za-z0-9]{50}$/.test(recaptcha)) fail("INVALID_MOCK_RECAPTCHA")
        const proof = await request(GOOGLE_ORIGIN, "/v1/accounts:sendVerificationCode", { method: "POST", apiKey: credentials.apiKey,
          body: { phoneNumber: numbers[index], recaptchaToken: recaptcha, clientType: "CLIENT_TYPE_WEB" }, signal, stage: "PHONE_CHALLENGE" })
        if (typeof proof.sessionInfo !== "string" || !proof.sessionInfo) fail("PHONE_PROOF_REQUIRED")
        let identity = await request(GOOGLE_ORIGIN, "/v1/accounts:signInWithPhoneNumber", { method: "POST", apiKey: credentials.apiKey,
          body: { sessionInfo: proof.sessionInfo, code: codes[index] }, signal, stage: "PHONE_CONFIRM" })
        if (typeof identity.idToken !== "string" || !identity.idToken || identity.phoneNumber !== numbers[index] || identity.isNewUser !== true) fail("NEW_FIREBASE_PHONE_ACCOUNT_REQUIRED")
        counts.firebaseNewAccountsConfirmed++
        const actor = await request(TARGET_ORIGIN, "/v1/auth/firebase/complete", { method: "POST",
          body: { idToken: identity.idToken, authIntent: "create", termsAcceptance: { version: TERMS, locale: "tr" } }, signal, stage: "BLUMI_CREATE" })
        identity = null
        const loadout = assertNewActor(actor)
        if (!await databaseProof.verifyCreated(numbers[index], actor.session.userId)) fail("NEW_DATABASE_ROW_PROOF_REQUIRED")
        databaseFreshRowsVerified++
        if (Object.values(actors).some(existing => existing?.session.userId === actor.session.userId)) fail("DISTINCT_NEW_ACCOUNTS_REQUIRED")
        counts.blumiNewAccountsConfirmed++
        actors[label] = actor
        const bearer = actor.session.sessionToken
        const profile = await request(TARGET_ORIGIN, "/v1/users/me", { method: "PATCH", bearer,
          body: { displayName: `Blumi Test ${label}`, age: 24, identityGender: index === 0 ? "woman" : "man" }, signal, stage: "PROFILE_SAVE" })
        if (profile.profile?.userId !== actor.session.userId) fail("PROFILE_IDENTITY_MISMATCH")
        actor.profile = profile.profile
        for (const step of ["profile", "avatar", "room"]) {
          if (step === "avatar") {
            const saved = await request(TARGET_ORIGIN, "/v1/users/me/avatar", { method: "PUT", bearer,
              body: { loadout, revision: 0 }, signal, stage: "AVATAR_SAVE" })
            if (!record(saved.avatar) || saved.avatar.revision !== 1 || saved.avatar.presetId !== loadout.bodyId) fail("STARTER_AVATAR_SAVE_UNCONFIRMED")
            actor.profile.avatar = saved.avatar
          }
          if (step === "room") {
            const savedRoom = await request(TARGET_ORIGIN, "/v1/users/me/room-decor", { method: "PUT", bearer,
              body: { expectedRevision: 0, decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] } }, signal, stage: "ROOM_SAVE" })
            if (savedRoom.roomDecor?.userId !== actor.session.userId || savedRoom.roomDecor.revision !== 1 ||
                savedRoom.roomDecor.decor?.roomShellId !== "room_v2_shell_blumi_world_v1" ||
                !Array.isArray(savedRoom.roomDecor.decor.placedItems) || savedRoom.roomDecor.decor.placedItems.length !== 0) fail("STARTER_ROOM_SAVE_UNCONFIRMED")
          }
          const progress = await request(TARGET_ORIGIN, "/v1/users/me/onboarding", { method: "PATCH", bearer,
            body: { step }, signal, stage: "ONBOARDING_COMPLETE" })
          if (!record(progress.onboarding) || ["profile", "avatar", "room"].some((key, offset) =>
              progress.onboarding[key] !== (offset <= ["profile", "avatar", "room"].indexOf(step) ? "complete" : "incomplete"))) fail("ONBOARDING_PROGRESS_UNCONFIRMED")
          actor.session.onboarding = progress.onboarding
        }
        counts.onboardingAccountsConfirmed++
      }
      if (signal?.aborted) fail("OPERATION_CANCELLED")
      controller = createAuditController({ fetchImpl: async (url, options) => {
        await paceBlumi()
        if (signal?.aborted) fail("OPERATION_CANCELLED")
        return fetchImpl(url, options)
      }, clock, sleep, foreignMessageChecks: false,
        captureActor: async (_signal, label) => ({ session: actors[label]?.session, profileUserId: actors[label]?.profile.userId }),
        writeEvidence: async evidence => { auditEvidence = evidence } })
      await controller.capture("A")
      await controller.capture("B")
      await controller.run()
      if (auditEvidence?.stopReason) fail("AUTHENTICATED_AUDIT_STOPPED")
    } catch (error) { stopReason = errorCode(error) }
    finally {
      controller?.clear()
      signal?.removeEventListener("abort", cancelAudit)
      actors.A = null
      actors.B = null
      if (databaseProof) {
        try { await databaseProof.close() } catch (error) { stopReason ??= errorCode(error) }
        databaseProof = null
      }
      // Cleanup deliberately ignores the cancelled audit signal and preserves concurrent unrelated fixtures.
      if (mutationAttempted && owned && credentials) {
        try {
          cleanupVerified = await cleanFixtures(credentials, owned)
        } catch (error) { cleanupError = errorCode(error) }
      }
      if (cleanupError) recovery = { credentials, owned, attempts: 0 }
      owned = null
      credentials = null
      actors = null
    }
    const evidence = { reviewDate: "2026-10-10", targetOrigin: TARGET_ORIGIN,
      status: stopReason || cleanupError ? "stopped" : "completed_with_open_gates", stopReason, cleanupError,
      fixturesAddedVerified, temporaryFixturesRemovedVerified: cleanupVerified,
      noConfigurationMutationAttempted: !mutationAttempted, credentialsRetained: recovery !== null,
      cleanupRecoveryPending: recovery !== null, accountCreationResponseLossMayLeaveUnconfirmedAccounts: stopReason !== null,
      databaseAbsenceVerified, databaseFreshRowsVerified,
      nativeVerificationPerformed: false, realSmsRequested: false, foreignAuthorizationTested: false,
      accountCreationAuthorized: true, normalOnboardingOnly: true, counts,
      exclusiveConfigWindowAcknowledged: exclusiveConfigWindowAcknowledged === true,
      concurrentConfigPreservationVerified: false, configAtomicityNotProven: true,
      configMapUpdateAtomicityNotProven: true, outcomes, authenticatedReadEvidence: auditEvidence }
    try { await writeEvidence(evidence) } catch { fail("SAFE_EVIDENCE_WRITE_UNAVAILABLE") }
    return evidence
  }
  async function cleanFixtures(credentials, owned) {
    const current = await request(GOOGLE_ORIGIN, CONFIG_PATH, { bearer: credentials.accessToken, stage: "CLEANUP_READ" })
    const currentMap = fixtureMap(current)
    const remaining = { ...currentMap }
    for (const [number, code] of Object.entries(owned)) if (remaining[number] === code) delete remaining[number]
    if (!isDeepStrictEqual(currentMap, remaining)) await request(GOOGLE_ORIGIN, CONFIG_PATH, { method: "PATCH", bearer: credentials.accessToken,
      body: { signIn: { phoneNumber: { testPhoneNumbers: remaining } } }, stage: "CLEANUP_REMOVE" })
    const verified = await request(GOOGLE_ORIGIN, CONFIG_PATH, { bearer: credentials.accessToken, stage: "CLEANUP_VERIFY" })
    const finalMap = fixtureMap(verified)
    if (Object.keys(owned).some(number => number in finalMap)) fail("CLEANUP_CONCURRENT_CONFLICT")
    if (!isDeepStrictEqual(configurationWithoutFixtures(verified), configurationWithoutFixtures(current)) ||
        !Object.entries(remaining).every(([number, code]) => finalMap[number] === code)) fail("CLEANUP_CONFIGURATION_CHANGED")
    return true
  }
  async function cleanup() {
    if (!recovery) return { temporaryFixturesRemovedVerified: true, cleanupRecoveryPending: false }
    if (++recovery.attempts > 2) return { temporaryFixturesRemovedVerified: false, cleanupRecoveryPending: true, cleanupError: "MANUAL_CLEANUP_ATTEMPT_LIMIT" }
    try {
      const refreshed = await loadConfiguration()
      if (refreshed?.project !== PROJECT || !refreshed.accessToken || !refreshed.apiKey) fail("PROJECT_MISMATCH")
      recovery.credentials = refreshed
      await cleanFixtures(recovery.credentials, recovery.owned)
      recovery = null
      return { temporaryFixturesRemovedVerified: true, cleanupRecoveryPending: false }
    } catch (error) { return { temporaryFixturesRemovedVerified: false, cleanupRecoveryPending: true, cleanupError: errorCode(error) } }
  }
  return { execute, cleanup, status: () => ({ cleanupRecoveryPending: recovery !== null }) }
}

export function parseRunnerArguments(args) {
  let execute = false
  let databaseCaFile = null
  let exclusiveConfigWindowAcknowledged = false
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === "--execute" && !execute) execute = true
    else if (argument === "--exclusive-config-window" && !exclusiveConfigWindowAcknowledged) exclusiveConfigWindowAcknowledged = true
    else if (argument === "--database-ca-file" && databaseCaFile === null && args[index + 1] && !args[index + 1].startsWith("--")) databaseCaFile = resolve(args[++index])
    else fail("CONTROL_ARGUMENTS_REQUIRED")
  }
  if (!execute) fail("EXPLICIT_EXECUTION_FLAG_REQUIRED")
  return { databaseCaFile, exclusiveConfigWindowAcknowledged }
}

async function main() {
  const options = parseRunnerArguments(process.argv.slice(2))
  const aborter = new AbortController()
  const abort = () => aborter.abort()
  process.on("SIGINT", abort)
  process.on("SIGTERM", abort)
  const runner = createTestAccountRunner(options)
  let recoveryHold = null
  try {
    let evidence
    try { evidence = await runner.execute({ signal: aborter.signal }) }
    catch {
      if (!runner.status().cleanupRecoveryPending) throw new SetupError("OPERATION_UNAVAILABLE")
      evidence = { status: "stopped", cleanupRecoveryPending: true, temporaryFixturesRemovedVerified: false }
    }
    process.stdout.write(JSON.stringify({ status: evidence.status, stopReason: evidence.stopReason,
      cleanupError: evidence.cleanupError, temporaryFixturesRemovedVerified: evidence.temporaryFixturesRemovedVerified,
      counts: evidence.counts }) + "\n")
    if (evidence.status === "stopped") process.exitCode = 1
    if (runner.status().cleanupRecoveryPending) {
      process.stdout.write('{"cleanupRecoveryPending":true,"control":"cleanup"}\n')
      const input = createInterface({ input: process.stdin, terminal: false })
      // Preserve the cleanup lease even if stdin closes or a termination signal arrives.
      recoveryHold = setInterval(() => {}, 60_000)
      for await (const command of input) {
        if (command.trim() !== "cleanup") { process.stdout.write('{"reason":"CLEANUP_CONTROL_REQUIRED"}\n'); continue }
        const result = await runner.cleanup()
        process.stdout.write(JSON.stringify(result) + "\n")
        if (!result.cleanupRecoveryPending) { input.close(); clearInterval(recoveryHold); recoveryHold = null; break }
      }
    }
  } finally {
    if (!runner.status().cleanupRecoveryPending) { process.off("SIGINT", abort); process.off("SIGTERM", abort) }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stdout.write('{"status":"stopped","reason":"OPERATION_UNAVAILABLE"}\n'); process.exitCode = 1 })
}
