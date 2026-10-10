import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { rootCertificates } from "node:tls"
import { mkdtemp, readFile, stat, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createTestAccountRunner, createMockRecaptcha, createFictionalPairGenerator, loadPrivateConfiguration, writeRunnerEvidence, openReadonlyProof, loadDatabaseCa, parseRunnerArguments } from "./live-test-account-runner.mjs"
import { TARGET_ORIGIN } from "./live-authenticated-audit.mjs"

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
function fixture({ existing = false, override, concurrentCleanup = false, sameKeyConflict = false, aborter, databaseUnavailable = false, freshRow = true, raceOnCleanup = false } = {}) {
  const secrets = [randomUUID(), randomUUID()]
  const credentials = { project: "blumi-mobile-eren", apiKey: secrets[0], accessToken: secrets[1] }
  const original = { name: "projects/blumi-mobile-eren/config", signIn: { phoneNumber: { enabled: true }, email: { enabled: false } }, quota: { marker: true } }
  let config = structuredClone(original)
  if (existing) config.signIn.phoneNumber.testPhoneNumbers = { [randomUUID()]: randomUUID() }
  let now = Date.now()
  let numbers = [100, 199]
  let codeIndex = 0
  const calls = []
  const evidence = []
  const actors = []
  let owned = null
  let added = false
  let concurrent = null
  const runner = createTestAccountRunner({ loadConfiguration: async () => credentials,
    exclusiveConfigWindowAcknowledged: true,
    readonlyProof: async phones => {
      if (databaseUnavailable) throw new Error(randomUUID())
      return { verifyCreated: async (phone, userId) => freshRow && phones.includes(phone) && actors.some(actor => actor.userId === userId && actor.phone === phone), close: async () => {} }
    },
    writeEvidence: async value => { evidence.push(value) }, clock: () => now, sleep: async ms => { now += ms },
    makeNumber: () => `+1650555${String(numbers.shift()).padStart(4, "0")}`,
    makeCode: () => String(814370 + codeIndex++), makeRecaptcha: createMockRecaptcha,
    fetchImpl: async (rawUrl, options) => {
      const url = new URL(rawUrl)
      assert.equal(options.redirect, "error")
      assert.equal(options.credentials, "omit")
      assert.ok(options.signal)
      const body = options.body ? JSON.parse(options.body) : null
      const call = { url, method: options.method, body, startedAt: now, aborted: options.signal.aborted }
      calls.push(call)
      if (override) {
        const overridden = await override(call, { config, actors, aborter, setConfig: value => { config = value } })
        if (overridden) return overridden
      }
      if (url.origin === "https://identitytoolkit.googleapis.com") {
        if (url.pathname.endsWith("/config")) {
          assert.equal(options.headers["x-goog-user-project"], "blumi-mobile-eren")
          assert.equal(options.headers.authorization, `Bearer ${credentials.accessToken}`)
          if (options.method === "PATCH") {
            assert.equal(url.searchParams.get("updateMask"), "signIn.phoneNumber.testPhoneNumbers")
            assert.deepEqual(Object.keys(body), ["signIn"])
            assert.deepEqual(Object.keys(body.signIn.phoneNumber), ["testPhoneNumbers"])
            if (raceOnCleanup && added && Object.keys(body.signIn.phoneNumber.testPhoneNumbers).length === 0) {
              // The provider offers no conditional update. A change after fresh GET can be lost;
              // the report must not claim that concurrent preservation was verified.
              concurrent = { number: randomUUID(), code: randomUUID() }
              config.signIn.phoneNumber.testPhoneNumbers[concurrent.number] = concurrent.code
            }
            config.signIn.phoneNumber.testPhoneNumbers = structuredClone(body.signIn.phoneNumber.testPhoneNumbers)
            if (!added) { owned = structuredClone(body.signIn.phoneNumber.testPhoneNumbers); added = true; secrets.push(...Object.keys(owned), ...Object.values(owned)) }
          } else if (added && calls.filter(c => c.url.pathname.endsWith("/config") && c.method === "GET").length >= 3) {
            if (concurrentCleanup && !concurrent) {
              concurrent = { number: randomUUID(), code: randomUUID() }
              config.signIn.phoneNumber.testPhoneNumbers[concurrent.number] = concurrent.code
            }
            if (sameKeyConflict) config.signIn.phoneNumber.testPhoneNumbers[Object.keys(owned)[0]] = "different-owner-code"
          }
          return json(config)
        }
        assert.equal(url.searchParams.get("key"), credentials.apiKey)
        assert.equal(options.headers["x-goog-user-project"], undefined)
        assert.equal(options.headers.authorization, undefined)
        if (url.pathname.endsWith(":sendVerificationCode")) {
          assert.equal(options.method, "POST")
          assert.ok(body.phoneNumber in owned)
          assert.match(body.recaptchaToken, /^[a-zA-Z0-9]{50}$/)
          assert.equal(body.clientType, "CLIENT_TYPE_WEB")
          const sessionInfo = randomUUID()
          secrets.push(sessionInfo)
          actors.push({ phone: body.phoneNumber, sessionInfo })
          return json({ sessionInfo })
        }
        assert.equal(url.pathname, "/v1/accounts:signInWithPhoneNumber")
        const current = actors.find(actor => actor.sessionInfo === body.sessionInfo)
        assert.equal(body.code, owned[current.phone])
        current.idToken = randomUUID()
        secrets.push(current.idToken)
        return json({ idToken: current.idToken, refreshToken: randomUUID(), phoneNumber: current.phone, isNewUser: true })
      }
      assert.equal(url.origin, TARGET_ORIGIN)
      if (url.pathname === "/v1/auth/firebase/complete") {
        assert.equal(body.authIntent, "create")
        assert.deepEqual(body.termsAcceptance, { version: "2026.09.28-r3", locale: "tr" })
        const current = actors.find(actor => actor.idToken === body.idToken)
        current.userId = randomUUID()
        current.token = `dv_${randomUUID()}_${randomUUID()}`
        secrets.push(current.userId, current.token)
        current.onboarding = { profile: "incomplete", avatar: "incomplete", room: "incomplete" }
        const loadout = { schemaVersion: 1, ...Object.fromEntries(["bodyId", "faceId", "eyesId", "noseId", "mouthId", "hairId", "topId", "bottomId", "shoesId"].map(key => [key, `starter_${key.toLowerCase()}`])), accessoryIds: [] }
        current.profile = { userId: current.userId, displayName: "", avatar: { presetId: loadout.bodyId, revision: 0, loadout } }
        return json({ session: { mode: "production", sessionToken: current.token, userId: current.userId,
          expiresAt: new Date(now + 3_600_000).toISOString(), onboarding: current.onboarding }, profile: current.profile })
      }
      const current = actors.find(actor => options.headers.authorization === `Bearer ${actor.token}`)
      assert.ok(current)
      if (url.pathname === "/v1/users/me" && options.method === "PATCH") {
        assert.equal(body.age, 24)
        assert.ok(["woman", "man"].includes(body.identityGender))
        current.profile = { ...current.profile, ...body }
        return json({ profile: current.profile })
      }
      if (url.pathname === "/v1/users/me/avatar") {
        assert.equal(options.method, "PUT")
        assert.equal(body.revision, 0)
        assert.equal(body.loadout.schemaVersion, 1)
        return json({ avatar: { presetId: body.loadout.bodyId, revision: 1, loadout: body.loadout } })
      }
      if (url.pathname === "/v1/users/me/room-decor" && options.method === "PUT") {
        assert.deepEqual(body, { expectedRevision: 0, decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] } })
        return json({ roomDecor: { userId: current.userId, revision: 1, decor: body.decor } })
      }
      if (url.pathname === "/v1/users/me/onboarding") {
        assert.equal(options.method, "PATCH")
        current.onboarding[body.step] = "complete"
        return json({ onboarding: current.onboarding })
      }
      assert.equal(options.method, "GET")
      if (url.pathname === "/v1/users/me") return json({ profile: current.profile, onboarding: current.onboarding, moderation: { status: "active" } })
      if (url.pathname === "/v1/users/me/room-decor") return json({ roomDecor: null })
      if (url.pathname === "/v1/threads") return json({ userId: current.userId, threads: [] })
      if (url.pathname === "/v1/safety/reports") return json({ reports: [] })
      if (url.pathname === "/v1/safety/blocks") return json({ userId: current.userId, blocks: [] })
      if (url.pathname === "/v1/notification-preferences") return json({ preferences: { likesEnabled: false, messagesEnabled: true, matchesEnabled: true, discoveryWatchEnabled: false } })
      if (url.pathname === "/v1/chat-preferences") return json({ preferences: { readReceiptsEnabled: false }, available: false })
      assert.fail("unexpected route")
    } })
  return { runner, calls, evidence, secrets, original, getConfig: () => config, getConcurrent: () => concurrent }
}

test("default SDK-wire mock token is exactly fifty alphanumeric characters", () => {
  for (let index = 0; index < 100; index++) assert.match(createMockRecaptcha(), /^[A-Za-z0-9]{50}$/)
  for (let index = 0; index < 100; index++) {
    const generate = createFictionalPairGenerator()
    const pair = [generate(), generate()]
    assert.equal(new Set(pair).size, 2)
    assert.ok(pair.every(value => /^\+165055501\d{2}$/.test(value)))
    assert.throws(generate, { message: "FICTIONAL_PAIR_REQUIRED" })
  }
})

test("normal signup and onboarding uses only bounded scoped calls, then read audit and exact cleanup", async () => {
  const f = fixture()
  const result = await f.runner.execute()
  assert.equal(result.status, "completed_with_open_gates")
  assert.equal(result.temporaryFixturesRemovedVerified, true)
  assert.equal(result.authenticatedReadEvidence.authenticatedAccountsVerified, 2)
  assert.equal(result.foreignAuthorizationTested, false)
  assert.equal(result.nativeVerificationPerformed, false)
  assert.deepEqual(f.getConfig().signIn.phoneNumber.testPhoneNumbers, {})
  assert.deepEqual(f.getConfig().quota, f.original.quota)
  const blumi = f.calls.filter(call => call.url.origin === TARGET_ORIGIN)
  for (let i = 1; i < blumi.length; i++) assert.ok(blumi[i].startedAt - blumi[i - 1].startedAt >= 1_200)
  const serialized = JSON.stringify(f.evidence)
  for (const value of f.secrets) assert.equal(serialized.includes(value), false)
  await assert.rejects(f.runner.execute(), { message: "ONE_RUN_ONLY" })
})

test("nonempty fictional configuration refuses all writes and phone requests", async () => {
  const f = fixture({ existing: true })
  const result = await f.runner.execute()
  assert.equal(result.stopReason, "EMPTY_ENABLED_TEST_CONFIGURATION_REQUIRED")
  assert.equal(result.noConfigurationMutationAttempted, true)
  assert.ok(f.calls.every(call => call.method === "GET"))
})

test("uncertain applied initial PATCH still arms cleanup before awaiting its response", async () => {
  let triggered = false
  const f = fixture({ override: (call, state) => {
    if (!triggered && call.method === "PATCH" && call.url.pathname.endsWith("/config")) {
      triggered = true
      const config = structuredClone(state.config)
      config.signIn.phoneNumber.testPhoneNumbers = call.body.signIn.phoneNumber.testPhoneNumbers
      state.setConfig(config)
      throw new Error(randomUUID())
    }
  } })
  const result = await f.runner.execute()
  assert.equal(result.status, "stopped")
  assert.equal(result.temporaryFixturesRemovedVerified, true)
  assert.deepEqual(f.getConfig().signIn.phoneNumber.testPhoneNumbers, {})
  assert.equal(f.calls.some(call => call.url.origin === TARGET_ORIGIN), false)
})

test("cleanup preserves concurrent unrelated entries and refuses to delete a changed same-key code", async () => {
  const f = fixture({ concurrentCleanup: true })
  const result = await f.runner.execute()
  assert.equal(result.temporaryFixturesRemovedVerified, true)
  const concurrent = f.getConcurrent()
  assert.equal(f.getConfig().signIn.phoneNumber.testPhoneNumbers[concurrent.number], concurrent.code)
  const conflicting = fixture({ sameKeyConflict: true })
  const conflictResult = await conflicting.runner.execute()
  assert.equal(conflictResult.cleanupError, "CLEANUP_CONCURRENT_CONFLICT")
  assert.equal(conflictResult.temporaryFixturesRemovedVerified, false)
  assert.ok(Object.values(conflicting.getConfig().signIn.phoneNumber.testPhoneNumbers).includes("different-owner-code"))
})

test("existing Firebase user or existing Blumi actor stops before profile mutations and still cleans fixtures", async () => {
  for (const point of ["firebase", "blumi"]) {
    const f = fixture({ override: call => {
      if (point === "firebase" && call.url.pathname.endsWith(":signInWithPhoneNumber")) return json({ isNewUser: false })
      if (point === "blumi" && call.url.pathname === "/v1/auth/firebase/complete") return json({ session: { onboarding: { profile: "complete" } } })
    } })
    const result = await f.runner.execute()
    assert.equal(result.temporaryFixturesRemovedVerified, true)
    assert.equal(result.counts.onboardingAccountsConfirmed, 0)
    assert.equal(f.calls.some(call => call.url.origin === TARGET_ORIGIN && call.method === "PATCH"), false)
  }
})

test("provider rejection is not retried, redirects and oversized bodies fail closed with cleanup", async () => {
  for (const response of [() => json({ error: randomUUID() }, 400),
    () => { const r = json({}); Object.defineProperty(r, "url", { value: "https://off-target.invalid/" }); return r },
    () => new Response("x".repeat(256 * 1024 + 1))]) {
    const f = fixture({ override: call => call.url.pathname.endsWith(":sendVerificationCode") ? response() : null })
    const result = await f.runner.execute()
    assert.equal(result.status, "stopped")
    assert.equal(result.temporaryFixturesRemovedVerified, true)
    assert.equal(f.calls.filter(call => call.url.pathname.endsWith(":sendVerificationCode")).length, 1)
    assert.equal(f.calls.some(call => call.url.pathname.endsWith(":signInWithPhoneNumber")), false)
  }
})

test("abort during authenticated reads stops following reads while cleanup ignores cancelled signal", async () => {
  const aborter = new AbortController()
  const f = fixture({ aborter, override: call => {
    if (call.url.pathname === "/v1/threads") { aborter.abort(); throw new Error(randomUUID()) }
  } })
  const result = await f.runner.execute({ signal: aborter.signal })
  assert.equal(result.status, "stopped")
  assert.equal(result.temporaryFixturesRemovedVerified, true)
  const firstThread = f.calls.findIndex(call => call.url.pathname === "/v1/threads")
  assert.ok(firstThread >= 0)
  assert.equal(f.calls.slice(firstThread + 1).some(call => call.url.origin === TARGET_ORIGIN), false)
  assert.ok(f.calls.slice(firstThread + 1).every(call => !call.aborted))
})

test("configuration loader keeps captured subprocess values private and rejects wrong project", async () => {
  const calls = []
  const values = ["blumi-mobile-eren", "A".repeat(30), randomUUID()]
  const privateConfig = await loadPrivateConfiguration(async (command, args) => { calls.push({ command, args }); return { stdout: values.shift() } })
  assert.equal(privateConfig.project, "blumi-mobile-eren")
  assert.equal(calls.at(-1).args.includes("--configuration=blumi-live-audit"), true)
  assert.equal(JSON.stringify(calls).includes(privateConfig.accessToken), false)
  await assert.rejects(loadPrivateConfiguration(async () => ({ stdout: "wrong-project" })), { message: "PROJECT_MISMATCH" })
  await assert.rejects(loadPrivateConfiguration(async () => { throw new Error(randomUUID()) }), { message: "OPERATION_UNAVAILABLE" })
})

test("readonly database unavailability refuses config writes; wrong database or legacy row refuses onboarding", async () => {
  const unavailable = fixture({ databaseUnavailable: true })
  const blocked = await unavailable.runner.execute()
  assert.equal(blocked.databaseAbsenceVerified, false)
  assert.equal(unavailable.calls.length, 0)
  const wrong = fixture({ freshRow: false })
  const stopped = await wrong.runner.execute()
  assert.equal(stopped.stopReason, "NEW_DATABASE_ROW_PROOF_REQUIRED")
  assert.equal(stopped.counts.blumiCreateResponsesSuccessful, 1)
  assert.equal(stopped.counts.blumiNewAccountsConfirmed, 0)
  assert.equal(stopped.temporaryFixturesRemovedVerified, true)
  assert.equal(wrong.calls.some(call => call.url.origin === TARGET_ORIGIN && call.method !== "POST"), false)
})

test("readonly database proof enforces TLS and SELECT-only narrow parameters", async () => {
  const queries = []
  let connection
  let ended = false
  let transactionReadonly = false // Model a pooler ignoring startup default_transaction_read_only.
  const numbers = [randomUUID(), randomUUID()]
  const userIds = [randomUUID(), randomUUID()]
  class Client {
    constructor(options) { connection = options }
    on() {}
    async connect() {}
    async query(sql, params) {
      queries.push({ sql, params })
      assert.equal(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER)\b/.test(sql), false)
      if (sql.startsWith("BEGIN ")) { transactionReadonly = /READ COMMITTED READ ONLY$/.test(sql); return { rows: [] } }
      if (sql.startsWith("SET LOCAL ")) return { rows: [] }
      if (sql === "ROLLBACK") { transactionReadonly = false; return { rows: [] } }
      assert.match(sql, /^SELECT /)
      return { rows: sql.includes("clock_timestamp") ? [{ readonly: transactionReadonly, absent: true, checked_at: new Date() }] : [{ fresh: true }] }
    }
    async end() { ended = true }
  }
  const proof = await openReadonlyProof(numbers, { Client,
    readEnvironment: async () => `DATABASE_URL=postgresql://fixture:fixture@db.fixture.supabase.co:5432/postgres?sslmode=disable&options=unsafe` })
  assert.equal(connection.ssl.rejectUnauthorized, true)
  assert.equal(new URL(connection.connectionString).searchParams.has("sslmode"), false)
  assert.equal(new URL(connection.connectionString).searchParams.has("options"), false)
  assert.match(connection.options, /default_transaction_read_only=on/)
  assert.equal(await proof.verifyCreated(numbers[0], userIds[0]), true)
  assert.equal(await proof.verifyCreated(numbers[1], userIds[1]), true)
  await assert.rejects(proof.verifyCreated(numbers[0], userIds[0]), { message: "READONLY_PROOF_SCOPE_REJECTED" })
  const selects = queries.filter(query => query.sql.startsWith("SELECT "))
  assert.equal(selects.length, 3)
  assert.deepEqual(selects[0].params, [numbers])
  assert.equal(selects[1].params[0], numbers[0])
  assert.equal(selects[1].params[1], userIds[0])
  await proof.close()
  assert.equal(ended, true)
  assert.equal(transactionReadonly, false)
  await assert.rejects(openReadonlyProof(numbers, { Client, readEnvironment: async () => "DATABASE_URL=postgres://fixture:fixture@localhost/db" }), { message: "READONLY_DATABASE_UNAVAILABLE" })
})

test("explicit public CA is trusted only by this PostgreSQL connection and invalid/private data is rejected", async () => {
  const certificate = rootCertificates[0]
  const previousGlobalTrust = process.env.NODE_EXTRA_CA_CERTS
  let connection
  class Client {
    constructor(options) { connection = options }
    on() {}
    async connect() {}
    async query() { return { rows: [{ readonly: true, absent: true, checked_at: new Date() }] } }
    async end() {}
  }
  const proof = await openReadonlyProof([randomUUID(), randomUUID()], { Client,
    readEnvironment: async () => "DATABASE_URL=postgresql://fixture:fixture@db.fixture.supabase.co/postgres?sslmode=disable",
    databaseCaFile: "/public-cert.pem", readCertificate: async () => Buffer.from(certificate) })
  assert.ok(connection.ssl.ca === certificate)
  assert.equal(connection.ssl.rejectUnauthorized, true)
  assert.equal(process.env.NODE_EXTRA_CA_CERTS, previousGlobalTrust)
  await proof.close()
  for (const invalid of [Buffer.from("-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----"),
    Buffer.from("not a certificate"), Buffer.from("-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----"),
    Buffer.from(certificate + "\ntrailing content"), Buffer.alloc(256 * 1024 + 1), Buffer.alloc(0)]) {
    await assert.rejects(loadDatabaseCa("/public-cert.pem", async () => invalid), { message: "DATABASE_CA_INVALID" })
  }
  await assert.rejects(loadDatabaseCa("/public-cert.pem", async () => { throw new Error(randomUUID()) }), { message: "DATABASE_CA_INVALID" })
})

test("server read-only FALSE fails before Firebase configuration and rolls back the connection", async () => {
  const sqlCommands = []
  let ended = false
  let networkRequested = false
  class Client {
    on() {}
    async connect() {}
    async query(sql) {
      sqlCommands.push(sql)
      return { rows: [{ readonly: false, absent: true, checked_at: new Date() }] }
    }
    async end() { ended = true }
  }
  const runner = createTestAccountRunner({ exclusiveConfigWindowAcknowledged: true,
    loadConfiguration: async () => ({ project: "blumi-mobile-eren", apiKey: randomUUID(), accessToken: randomUUID() }),
    readonlyProof: numbers => openReadonlyProof(numbers, { Client,
      readEnvironment: async () => "DATABASE_URL=postgresql://fixture:fixture@db.fixture.supabase.co/postgres" }),
    fetchImpl: async () => { networkRequested = true }, writeEvidence: async () => {} })
  const stopped = await runner.execute()
  assert.equal(stopped.stopReason, "READONLY_TRANSACTION_REQUIRED")
  assert.equal(stopped.noConfigurationMutationAttempted, true)
  assert.equal(networkRequested, false)
  assert.equal(ended, true)
  assert.equal(sqlCommands.at(-1), "ROLLBACK")
  assert.equal(sqlCommands.filter(sql => sql.startsWith("SELECT ")).length, 1)
})

test("exclusive configuration window must be explicitly acknowledged before any private read or network call", async () => {
  let touched = false
  const runner = createTestAccountRunner({ loadConfiguration: async () => { touched = true },
    readonlyProof: async () => { touched = true }, fetchImpl: async () => { touched = true }, writeEvidence: async () => {} })
  const stopped = await runner.execute()
  assert.equal(stopped.stopReason, "EXCLUSIVE_CONFIG_WINDOW_REQUIRED")
  assert.equal(stopped.noConfigurationMutationAttempted, true)
  assert.equal(stopped.exclusiveConfigWindowAcknowledged, false)
  assert.equal(touched, false)
  assert.deepEqual(parseRunnerArguments(["--execute"]), { databaseCaFile: null, exclusiveConfigWindowAcknowledged: false })
  const parsed = parseRunnerArguments(["--database-ca-file", "/public-cert.pem", "--exclusive-config-window", "--execute"])
  assert.equal(parsed.databaseCaFile, "/public-cert.pem")
  assert.equal(parsed.exclusiveConfigWindowAcknowledged, true)
  for (const invalid of [[], ["--execute", "--execute"], ["--execute", "--database-ca-file"],
    ["--execute", "--token", randomUUID()], ["--exclusive-config-window"]]) assert.throws(() => parseRunnerArguments(invalid))
})

test("cleanup absence cannot imply preservation of an update racing between configuration read and PATCH", async () => {
  const f = fixture({ raceOnCleanup: true })
  const result = await f.runner.execute()
  assert.equal(result.temporaryFixturesRemovedVerified, true)
  assert.equal(result.concurrentConfigPreservationVerified, false)
  assert.equal(result.configAtomicityNotProven, true)
  assert.equal(f.getConcurrent().number in f.getConfig().signIn.phoneNumber.testPhoneNumbers, false)
})

test("failed cleanup retains exact private lease until explicit bounded recovery verifies removal", async () => {
  let failed = false
  const f = fixture({ override: call => {
    if (!failed && call.method === "PATCH" && call.url.pathname.endsWith("/config") &&
        Object.keys(call.body.signIn.phoneNumber.testPhoneNumbers).length === 0) {
      failed = true
      return json({ error: randomUUID() }, 503)
    }
  } })
  const result = await f.runner.execute()
  assert.equal(result.cleanupRecoveryPending, true)
  assert.equal(result.credentialsRetained, true)
  assert.equal(result.temporaryFixturesRemovedVerified, false)
  assert.equal(result.outcomes.at(-1).httpStatus, 503)
  const recovery = await f.runner.cleanup()
  assert.equal(recovery.temporaryFixturesRemovedVerified, true)
  assert.equal(f.runner.status().cleanupRecoveryPending, false)
  assert.deepEqual(f.getConfig().signIn.phoneNumber.testPhoneNumbers, {})
  const serialized = JSON.stringify([result, recovery])
  for (const secret of f.secrets) assert.equal(serialized.includes(secret), false)
})

test("evidence is atomic private-mode JSON and cannot overwrite existing user work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blumi-runner-test-"))
  try {
    const path = join(directory, "evidence.json")
    await writeRunnerEvidence({ cleanupVerified: true }, path)
    assert.equal((await stat(path)).mode & 0o777, 0o600)
    const before = await readFile(path, "utf8")
    await assert.rejects(writeRunnerEvidence({ replaced: true }, path))
    assert.equal(await readFile(path, "utf8"), before)
    assert.deepEqual(await readdir(directory), ["evidence.json"])
  } finally { await rm(directory, { recursive: true }) }
})
