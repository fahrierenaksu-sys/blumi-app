import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { runInNewContext } from "node:vm"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createAuditController, createLabelledNativeCapturer, createNativeCapturer, nativeCaptureExpression,
  parseAuditArguments, selectPrivateThread, STORAGE_KEY, TARGET_ORIGIN, validateInspectorUrl,
  writeSafeEvidence } from "./live-authenticated-audit.mjs"

const inspectorUrl = "ws://127.0.0.1:8081/inspector/debug?device=fixture&page=1"
const identity = () => randomUUID()
const actor = () => {
  const userId = identity()
  return { session: { mode: "production", userId, sessionToken: `dv_${randomUUID()}_${randomUUID()}`,
    expiresAt: "2099-01-01T00:00:00.000Z", onboarding: { profile: "complete", avatar: "complete", room: "complete" } },
  profileUserId: userId }
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status,
  headers: { "content-type": "application/json", "cache-control": "no-store" } })

function fixture({ foreignStatus = 404, shared = false, foreignEnabled = true, responseOverride } = {}) {
  const actors = [actor(), actor()]
  const resources = actors.map(current => ({ threadId: identity(), participantUserIds: [current.session.userId, identity()],
    lastMessage: { messageId: identity(), body: identity() } }))
  const secretValues = actors.flatMap(a => [a.session.userId, a.session.sessionToken])
    .concat(resources.flatMap(r => [r.threadId, r.lastMessage.messageId, r.lastMessage.body]))
  let now = 0
  let selected = 0
  const calls = []
  const saved = []
  const controller = createAuditController({ foreignMessageChecks: foreignEnabled,
    captureActor: async () => actors[selected++], clock: () => now, sleep: async ms => { now += ms },
    writeEvidence: async evidence => saved.push(evidence),
    fetchImpl: async (url, options) => {
      assert.equal(options.method, "GET")
      assert.equal(options.redirect, "error")
      assert.equal(new URL(url).origin, TARGET_ORIGIN)
      const current = actors.find(a => options.headers.authorization === `Bearer ${a.session.sessionToken}`)
      assert.ok(current)
      calls.push({ url, options, startedAt: now })
      if (responseOverride) {
        const overridden = responseOverride(url, options, current)
        if (overridden) return overridden
      }
      const path = new URL(url).pathname
      if (path === "/v1/users/me") return json({ profile: { userId: current.session.userId, displayName: identity() },
        moderation: { status: "active" }, onboarding: current.session.onboarding })
      if (path === "/v1/threads") return json({ userId: current.session.userId,
        threads: shared ? [{ ...resources[0], participantUserIds: actors.map(a => a.session.userId) }] :
          resources.filter(r => r.participantUserIds.includes(current.session.userId)) })
      if (path === "/v1/users/me/room-decor") return json({ roomDecor: null })
      if (path === "/v1/safety/reports") return json({ reports: [] })
      if (path === "/v1/safety/blocks") return json({ userId: current.session.userId, blocks: [] })
      if (path === "/v1/notification-preferences") return json({ preferences: { likesEnabled: false, messagesEnabled: true,
        matchesEnabled: true, discoveryWatchEnabled: false } })
      if (path === "/v1/chat-preferences") return json({ preferences: { readReceiptsEnabled: false }, available: false })
      if (path.endsWith("/messages")) return json({ messages: [{ body: identity() }] }, foreignStatus)
      assert.fail("unexpected route")
    } })
  return { controller, actors, calls, saved, resources, secretValues,
    select: index => { selected = index }, advance: ms => { now += ms } }
}

async function enroll(f) { await f.controller.capture("A"); await f.controller.capture("B") }

test("native inspector input excludes remote, browser, credential-bearing and ambiguous URLs", () => {
  assert.equal(validateInspectorUrl(inspectorUrl).hostname, "127.0.0.1")
  for (const input of ["https://127.0.0.1:8081/inspector/debug", "ws://example.test:8081/inspector/debug",
    "ws://127.0.0.1:8081/devtools/page/fixture", "ws://user:password@localhost:8081/inspector/debug",
    "ws://localhost/inspector/debug", `${inspectorUrl}#fragment`]) {
    assert.throws(() => validateInspectorUrl(input), { message: "NATIVE_INSPECTOR_REQUIRED" })
  }
})

test("native expression reads only the already initialized SecureStore module and returns minimal session fields", async () => {
  const minimal = actor()
  const rawActor = { session: minimal.session, profile: { userId: minimal.profileUserId,
    phoneNumber: identity(), displayName: identity(), bio: identity() } }
  let reads = 0
  const requireModule = id => {
    assert.equal(id, 10)
    return { getItemAsync: async key => { assert.equal(key, STORAGE_KEY); reads++; return JSON.stringify(rawActor) } }
  }
  requireModule.getModules = () => new Map([[10, { isInitialized: true,
    verboseName: "node_modules/expo-secure-store/build/SecureStore.js" }]])
  const context = { __r: requireModule, RN$Bridgeless: true }
  const result = await runInNewContext(nativeCaptureExpression(), context)
  assert.deepEqual(JSON.parse(JSON.stringify(result)), minimal)
  assert.equal(reads, 1)
  requireModule.getModules = () => new Map([[10, { isInitialized: false,
    verboseName: "node_modules/expo-secure-store/build/SecureStore.js" }]])
  assert.equal(await runInNewContext(nativeCaptureExpression(), context), null)
  assert.equal(await runInNewContext(nativeCaptureExpression(), { __r: requireModule }), null)
  assert.equal(await runInNewContext(nativeCaptureExpression(), { RN$Bridgeless: true }), null)
  assert.equal(reads, 1)
})

test("CDP capture pins the advertised native package and discards raw console and exception content", async () => {
  const minimal = actor()
  let closed = false
  class Socket extends EventEmitter {
    constructor(url, options) { super(); assert.equal(url, inspectorUrl); assert.equal(options.followRedirects, false);
      queueMicrotask(() => this.emit("open")) }
    send(raw) {
      const command = JSON.parse(raw)
      assert.equal(command.method, "Runtime.evaluate")
      assert.equal(command.params.returnByValue, true)
      this.emit("message", Buffer.from(JSON.stringify({ method: "Runtime.consoleAPICalled", params: { secret: minimal.session.sessionToken } })))
      this.emit("message", Buffer.from(JSON.stringify({ id: command.id, result: { result: { value: minimal } } })))
    }
    close() { closed = true }
  }
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).origin, "http://127.0.0.1:8081")
    assert.equal(options.method, "GET")
    assert.equal(options.redirect, "error")
    return json([{ type: "node", appId: "com.blumi.mobile", title: "Blumi", webSocketDebuggerUrl: inspectorUrl }])
  }
  const capture = createNativeCapturer({ inspectorUrl, fetchImpl, Socket })
  assert.equal((await capture()).session.sessionToken, minimal.session.sessionToken)
  assert.equal(closed, true)
  class FailingSocket extends Socket {
    send() { this.emit("message", Buffer.from(JSON.stringify({ id: 1, result: { exceptionDetails: { text: minimal.session.sessionToken } } }))) }
  }
  await assert.rejects(createNativeCapturer({ inspectorUrl, fetchImpl, Socket: FailingSocket })(),
    error => error.message === "NATIVE_CAPTURE_UNAVAILABLE" && !error.stack.includes(minimal.session.sessionToken))
  for (const target of [{ type: "page", appId: "com.blumi.mobile", webSocketDebuggerUrl: inspectorUrl },
    { type: "node", appId: "other.package", webSocketDebuggerUrl: inspectorUrl }]) {
    let socketCreated = false
    await assert.rejects(createNativeCapturer({ inspectorUrl, fetchImpl: async () => json([target]),
      Socket: class { constructor() { socketCreated = true } } })(), { message: "NATIVE_INSPECTOR_REQUIRED" })
    assert.equal(socketCreated, false)
  }
})

test("native Bridgeless metadata without appId requires the exact package title and connection description", async () => {
  const minimal = actor()
  const native = { type: "node", title: "com.blumi.mobile (Blumi iPhone 17)",
    description: "React Native Bridgeless [C++ connection]", webSocketDebuggerUrl: inspectorUrl }
  let sockets = 0
  class Socket extends EventEmitter {
    constructor() { super(); sockets++; queueMicrotask(() => this.emit("open")) }
    send(raw) { const command = JSON.parse(raw); this.emit("message",
      Buffer.from(JSON.stringify({ id: command.id, result: { result: { value: minimal } } }))) }
    close() {}
  }
  const capture = targets => createNativeCapturer({ inspectorUrl, Socket, fetchImpl: async () => json(targets) })()
  assert.deepEqual(await capture([native]), minimal)
  assert.equal(sockets, 1)
  for (const targets of [
    [{ ...native, title: "other.package (Blumi iPhone 17)" }],
    [{ ...native, title: "com.blumi.mobile.other (Blumi iPhone 17)" }],
    [{ ...native, title: "prefix com.blumi.mobile (Blumi iPhone 17)" }],
    [{ ...native, title: "com.blumi.mobile (Blumi iPhone 17)\n" }],
    [{ ...native, description: "Browser connection" }],
    [{ ...native, type: "page" }],
    [{ ...native, appId: "other.package" }],
    [{ ...native, appId: null }],
    [{ ...native, webSocketDebuggerUrl: `${inspectorUrl}&different=1` }],
    [native, { ...native }]
  ]) {
    await assert.rejects(capture(targets), { message: "NATIVE_INSPECTOR_REQUIRED" })
    assert.equal(sockets, 1)
  }
})

test("CLI inspector selection supports the legacy URL or a complete explicit pair and keeps foreign checks off", () => {
  const second = "ws://127.0.0.1:8081/inspector/debug?device=fixture&page=2"
  assert.deepEqual(parseAuditArguments(["--inspector-url", inspectorUrl]), {
    inspectorUrls: { A: inspectorUrl, B: inspectorUrl }, foreignMessageChecks: false
  })
  assert.deepEqual(parseAuditArguments(["--inspector-url-b", second, "--inspector-url-a", inspectorUrl]), {
    inspectorUrls: { A: inspectorUrl, B: second }, foreignMessageChecks: false
  })
  assert.equal(parseAuditArguments(["--inspector-url", inspectorUrl, "--foreign-message-checks"]).foreignMessageChecks, true)
  for (const args of [[], ["--inspector-url"], ["--inspector-url-a", inspectorUrl],
    ["--inspector-url", inspectorUrl, "--inspector-url-a", second],
    ["--inspector-url-a", inspectorUrl, "--inspector-url-a", inspectorUrl, "--inspector-url-b", second],
    ["--inspector-url", "--foreign-message-checks"], ["--session-token", "fixture"]]) {
    assert.throws(() => parseAuditArguments(args), { message: "CONTROL_ARGUMENTS_REQUIRED" })
  }
  for (const unsafe of ["ws://other.test:8081/inspector/debug", "ws://user:password@127.0.0.1:8081/inspector/debug",
    "ws://127.0.0.1:8081/devtools/page/fixture"]) {
    assert.throws(() => parseAuditArguments(["--inspector-url-a", inspectorUrl, "--inspector-url-b", unsafe]),
      { message: "NATIVE_INSPECTOR_REQUIRED" })
  }
})

test("two simultaneous native inspectors are selected by A or B without changing either runtime", async () => {
  const inspectorUrls = { A: inspectorUrl, B: "ws://127.0.0.1:8081/inspector/debug?device=fixture&page=2" }
  const actors = { A: actor(), B: actor() }
  const capturedUrls = []
  class Socket extends EventEmitter {
    constructor(url, options) {
      super(); this.label = url === inspectorUrls.A ? "A" : "B"; capturedUrls.push(url)
      assert.equal(options.followRedirects, false)
      assert.equal(options.maxPayload, 64 * 1024)
      queueMicrotask(() => this.emit("open"))
    }
    send(raw) {
      const command = JSON.parse(raw)
      assert.equal(command.method, "Runtime.evaluate")
      this.emit("message", Buffer.from(JSON.stringify({ id: command.id,
        result: { result: { value: actors[this.label] } } })))
    }
    close() {}
  }
  const captureActor = createLabelledNativeCapturer({ inspectorUrls, Socket, fetchImpl: async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8081/json/list")
    assert.equal(options.redirect, "error")
    return json(Object.entries(inspectorUrls).map(([label, webSocketDebuggerUrl]) => ({ type: "node",
      title: `com.blumi.mobile (Test runtime ${label})`, description: "React Native Bridgeless [C++ connection]",
      webSocketDebuggerUrl })))
  } })
  const controller = createAuditController({ captureActor, sleep: async () => {}, fetchImpl: async (url, options) => {
    assert.equal(url, `${TARGET_ORIGIN}/v1/users/me`)
    const current = Object.values(actors).find(candidate => options.headers.authorization === `Bearer ${candidate.session.sessionToken}`)
    assert.ok(current)
    return json({ profile: { userId: current.session.userId }, moderation: { status: "active" },
      onboarding: current.session.onboarding })
  } })
  await controller.capture("B")
  await controller.capture("A")
  assert.deepEqual(capturedUrls, [inspectorUrls.B, inspectorUrls.A])
  assert.equal(controller.status().enrolledCount, 2)
  controller.clear()
  assert.equal(controller.status().enrolledCount, 0)
})

test("demo, malformed and expired actors fail closed without a live request or Firebase fallback", async () => {
  for (const change of [a => { a.session.mode = "demo" }, a => { a.session.sessionToken = identity() },
    a => { a.session.expiresAt = "2000-01-01T00:00:00.000Z" }, a => { a.profileUserId = identity() }]) {
    const native = actor()
    change(native)
    let remoteCalls = 0
    const controller = createAuditController({ captureActor: async () => native,
      fetchImpl: async () => { remoteCalls++; throw new Error("must not run") } })
    await assert.rejects(controller.capture("A"), { message: "ACTIVE_PRODUCTION_TEST_SESSION_REQUIRED" })
    assert.equal(remoteCalls, 0)
    assert.equal(controller.status().enrolledCount, 0)
  }
})

test("remote identity, activity and setup are required, and two captures must be distinct", async () => {
  for (const response of [{ profile: { userId: identity() }, moderation: { status: "active" }, onboarding: actor().session.onboarding },
    { moderation: { status: "suspended" } }, { onboarding: { profile: "incomplete" } }]) {
    const f = fixture({ responseOverride: (url, _options, current) => new URL(url).pathname === "/v1/users/me" ?
      json({ profile: { userId: current.session.userId }, moderation: { status: "active" }, onboarding: current.session.onboarding, ...response }) : null })
    await assert.rejects(f.controller.capture("A"), { message: "ACTIVE_TEST_ACCOUNT_PROOF_REQUIRED" })
    assert.equal(f.controller.status().enrolledCount, 0)
  }
  const f = fixture()
  await f.controller.capture("A")
  f.select(0)
  await assert.rejects(f.controller.capture("B"), { message: "DISTINCT_TEST_ACCOUNTS_REQUIRED" })
  assert.equal(f.calls.length, 1)
  await assert.rejects(f.controller.run(), { message: "TWO_DISTINCT_TEST_ACCOUNTS_REQUIRED" })
})

test("the matrix uses paced GETs only, excludes mutation-sensitive reads, and persists no private values", async () => {
  const f = fixture({ foreignStatus: 403 })
  await enroll(f)
  const evidence = await f.controller.run()
  assert.equal(evidence.status, "completed_with_open_gates")
  assert.equal(evidence.authenticatedAccountsVerified, 2)
  const foreign = evidence.outcomes.filter(row => row.kind === "foreign")
  assert.ok(foreign.length > 0)
  assert.ok(foreign.every(row => row.accessDenied === true))
  for (let i = 1; i < f.calls.length; i++) assert.ok(f.calls[i].startedAt - f.calls[i - 1].startedAt >= 1_200)
  for (const call of f.calls) {
    const url = new URL(call.url)
    assert.ok(!/economy|inventory|room-invites/.test(url.pathname))
    if (url.pathname.endsWith("/messages")) {
      assert.ok(url.searchParams.get("before"))
      assert.equal(url.searchParams.get("limit"), "1")
    }
  }
  assert.ok(evidence.requestsExecuted <= evidence.maximumRequests)
  assert.equal(f.controller.status().enrolledCount, 0)
  assert.equal(f.saved.length, 1)
  const recorded = JSON.stringify([evidence, f.controller.status()])
  for (const privateValue of f.secretValues) assert.equal(recorded.includes(privateValue), false)
})

test("shared threads and missing cursors do not become foreign authorization fixtures", async () => {
  const owner = identity(), other = identity()
  assert.equal(selectPrivateThread([{ threadId: identity(), participantUserIds: [owner, other],
    lastMessage: { messageId: identity() } }], owner, other), null)
  assert.equal(selectPrivateThread([{ threadId: identity(), participantUserIds: [owner, identity()] }], owner, other), null)
  assert.throws(() => selectPrivateThread([{ participantUserIds: [other, identity()] }], owner, other), { message: "THREAD_OWNERSHIP_MISMATCH" })
  const f = fixture({ shared: true })
  await enroll(f)
  const evidence = await f.controller.run()
  assert.equal(evidence.outcomes.some(row => row.kind === "foreign"), false)
  assert.ok(evidence.blocked.some(code => code.includes("no_private_cursor_fixture")))
  const off = fixture({ foreignEnabled: false })
  await enroll(off)
  assert.equal((await off.controller.run()).outcomes.some(row => row.kind === "foreign"), false)
})

test("a private foreign 2xx stops every subsequent probe and cancels its body without reading it", async () => {
  let payloadRead = false, cancelled = false
  const f = fixture({ responseOverride: url => new URL(url).pathname.endsWith("/messages") ? {
    status: 200, redirected: false, headers: new Headers(), url,
    body: { cancel: async () => { cancelled = true }, getReader: () => { payloadRead = true; throw new Error("private") } }
  } : null })
  await enroll(f)
  const evidence = await f.controller.run()
  assert.equal(evidence.stopReason, "FOREIGN_PRIVATE_SUCCESS_STOP")
  assert.equal(evidence.unexpectedForeignAuthorizationSuccessObserved, true)
  assert.equal(evidence.privateDataDisclosureVerified, false)
  assert.equal(evidence.foreignPrivatePayloadRead, false)
  assert.equal(payloadRead, false)
  assert.equal(cancelled, true)
  assert.equal(f.calls.at(-1).url.includes("/messages?"), true)
  assert.equal(f.controller.status().enrolledCount, 0)
  await assert.rejects(f.controller.capture("A"), { message: "AUDIT_NOT_AVAILABLE" })
})

test("redirects, oversized responses and transport errors stop safely without leaking exception text", async () => {
  const cases = [
    () => new Response(null, { status: 302, headers: { location: "https://other.test/" } }),
    () => new Response("{}", { headers: { "content-length": String(256 * 1024 + 1) } }),
    () => new Response('"' + "x".repeat(256 * 1024) + '"')
  ]
  for (const response of cases) {
    const f = fixture({ responseOverride: () => response() })
    await assert.rejects(f.controller.capture("A"), error => !f.secretValues.some(value => error.stack.includes(value)))
    assert.equal(f.controller.status().enrolledCount, 0)
  }
  const native = actor()
  const controller = createAuditController({ captureActor: async () => native,
    fetchImpl: async () => { throw new Error(native.session.sessionToken) } })
  await assert.rejects(controller.capture("A"), { message: "OPERATION_UNAVAILABLE" })
  assert.equal(controller.status().enrolledCount, 0)
})

test("the global request cap, idle expiry and clear prevent token reuse or late enrollment", async () => {
  const f = fixture()
  for (let i = 0; i < 20; i++) { f.select(0); await f.controller.capture("A") }
  f.select(0)
  await assert.rejects(f.controller.capture("A"), { message: "REQUEST_BUDGET_EXHAUSTED" })
  assert.equal(f.calls.length, 20)
  const idle = fixture()
  await enroll(idle)
  idle.advance(20 * 60_000)
  assert.equal(idle.controller.status().enrolledCount, 0)
  await assert.rejects(idle.controller.run(), { message: "TWO_DISTINCT_TEST_ACCOUNTS_REQUIRED" })
  let release
  const controller = createAuditController({ captureActor: () => new Promise(resolve => { release = resolve }),
    fetchImpl: async () => { assert.fail("late capture must not call the live API") } })
  const pending = controller.capture("A")
  controller.clear()
  release(actor())
  await assert.rejects(pending, { message: "OPERATION_CANCELLED" })
  assert.equal(controller.status().enrolledCount, 0)
})

test("a failed second capture or premature run clears every previously enrolled credential", async () => {
  const first = actor()
  let captures = 0
  const controller = createAuditController({ captureActor: async () => {
    if (captures++ === 0) return first
    throw new Error(first.session.sessionToken)
  }, fetchImpl: async () => json({ profile: { userId: first.session.userId },
    moderation: { status: "active" }, onboarding: first.session.onboarding }) })
  await controller.capture("A")
  assert.equal(controller.status().enrolledCount, 1)
  await assert.rejects(controller.capture("B"), { message: "OPERATION_UNAVAILABLE" })
  assert.equal(controller.status().enrolledCount, 0)
  const early = fixture()
  await early.controller.capture("A")
  await assert.rejects(early.controller.run(), { message: "TWO_DISTINCT_TEST_ACCOUNTS_REQUIRED" })
  assert.equal(early.controller.status().enrolledCount, 0)
  assert.equal(early.calls.length, 1)
  const invalid = fixture()
  await enroll(invalid)
  await assert.rejects(invalid.controller.capture("not-a-control-label"), { message: "CONTROL_COMMAND_REQUIRED" })
  assert.equal(invalid.controller.status().enrolledCount, 0)
})

test("safe evidence has private permissions and refuses to overwrite another run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "blumi-safe-evidence-"))
  try {
    const path = join(directory, "evidence.json")
    const evidence = { requestsExecuted: 0, credentialsRetained: false }
    await writeSafeEvidence(evidence, path)
    assert.equal((await stat(path)).mode & 0o777, 0o600)
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), evidence)
    await assert.rejects(writeSafeEvidence({ requestsExecuted: 1 }, path), { code: "EEXIST" })
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), evidence)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
