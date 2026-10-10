import { open } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { createInterface } from "node:readline"
import { resolve } from "node:path"
import WebSocket from "ws"

export const TARGET_ORIGIN = "https://blumi-app-production.up.railway.app"
export const STORAGE_KEY = "blumi.mobile.session_actor.v1"
const PACKAGE_NAME = "com.blumi.mobile"
const MAX_REQUESTS = 20
const IDLE_MS = 20 * 60_000
const RESPONSE_LIMIT = 256 * 1024
const TOKEN_SHAPE = /^dv_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const EVIDENCE_PATH = fileURLToPath(new URL("../../docs/quality/API_LIVE_AUTHENTICATED_EVIDENCE_2026-10-10.json", import.meta.url))

class AuditError extends Error {
  constructor(code) { super(code); this.code = code; this.name = "AuditError" }
}
const fail = (code) => { throw new AuditError(code) }
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
const identifier = (value) => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f\u007f]/.test(value)
const complete = (value) => object(value) && ["profile", "avatar", "room"].every(key => value[key] === "complete")
const safeCode = (error) => error instanceof AuditError ? error.code : "OPERATION_UNAVAILABLE"

export function validateInspectorUrl(input) {
  let url
  try { url = new URL(input) } catch { fail("NATIVE_INSPECTOR_REQUIRED") }
  if (!["ws:", "wss:"].includes(url.protocol) || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.port || url.username || url.password || url.hash || url.pathname !== "/inspector/debug") {
    fail("NATIVE_INSPECTOR_REQUIRED")
  }
  return url
}

async function readJsonBounded(response, maximum, signal) {
  const advertisedLength = response.headers.get("content-length")
  if (advertisedLength !== null && Number(advertisedLength) > maximum) fail("RESPONSE_TOO_LARGE")
  if (!response.body) fail("INVALID_RESPONSE")
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      if (signal?.aborted) fail("OPERATION_CANCELLED")
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) fail("RESPONSE_TOO_LARGE")
      chunks.push(value)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { fail("INVALID_RESPONSE") }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

// Capture is local-only. Neither the complete actor nor a Firebase ID token is returned.
// Missing Metro development metadata fails closed; no module is initialized to find it.
export function nativeCaptureExpression() {
  return `(async () => {
    try {
      const native = typeof globalThis.nativeCallSyncHook === 'function' || globalThis.RN$Bridgeless === true;
      if (!native || typeof globalThis.__r !== 'function' || typeof globalThis.__r.getModules !== 'function') return null;
      const modules = globalThis.__r.getModules();
      if (!modules || typeof modules.entries !== 'function') return null;
      const matches = [];
      for (const [id, module] of modules.entries()) {
        if (module.isInitialized === true && typeof module.verboseName === 'string' &&
            /(?:^|\\/)expo-secure-store\\/(?:build\\/|src\\/)?SecureStore\\.(?:js|ts)$/.test(module.verboseName)) matches.push(id);
      }
      if (matches.length !== 1) return null;
      const store = globalThis.__r(matches[0]);
      if (!store || typeof store.getItemAsync !== 'function') return null;
      const raw = await store.getItemAsync('${STORAGE_KEY}');
      if (typeof raw !== 'string' || raw.length > 262144) return null;
      const actor = JSON.parse(raw);
      return { session: { mode: actor?.session?.mode, sessionToken: actor?.session?.sessionToken,
        userId: actor?.session?.userId, expiresAt: actor?.session?.expiresAt,
        onboarding: { profile: actor?.session?.onboarding?.profile, avatar: actor?.session?.onboarding?.avatar,
          room: actor?.session?.onboarding?.room } }, profileUserId: actor?.profile?.userId };
    } catch { return null; }
  })()`
}

export function createNativeCapturer({ inspectorUrl, fetchImpl = fetch, Socket = WebSocket }) {
  const inspector = validateInspectorUrl(inspectorUrl)
  const listing = new URL(inspector.href)
  listing.protocol = inspector.protocol === "wss:" ? "https:" : "http:"
  listing.pathname = "/json/list"
  listing.search = ""
  return async (signal) => {
    const deadline = AbortSignal.any([AbortSignal.timeout(8_000), ...(signal ? [signal] : [])])
    try {
      const response = await fetchImpl(listing.href, { method: "GET", redirect: "error", signal: deadline, credentials: "omit" })
      if (response.status !== 200 || response.redirected ||
          (response.url && new URL(response.url).origin !== listing.origin)) fail("NATIVE_INSPECTOR_REQUIRED")
      const targets = await readJsonBounded(response, 64 * 1024, deadline)
      if (!Array.isArray(targets)) fail("NATIVE_INSPECTOR_REQUIRED")
      const selected = targets.filter(target => object(target) && target.webSocketDebuggerUrl === inspector.href &&
        target.type === "node" && (target.appId === PACKAGE_NAME ||
          (target.appId === undefined && target.description === "React Native Bridgeless [C++ connection]" &&
            typeof target.title === "string" && /^com\.blumi\.mobile \([^()\r\n\u0000]{1,128}\)$/.test(target.title))))
      if (selected.length !== 1) fail("NATIVE_INSPECTOR_REQUIRED")
      return await new Promise((resolve, reject) => {
        let finished = false
        const socket = new Socket(inspector.href, { maxPayload: 64 * 1024, followRedirects: false })
        const finish = (value, error) => {
          if (finished) return
          finished = true
          deadline.removeEventListener("abort", aborted)
          // Discard all raw CDP events and exception text; never print transport data.
          socket.removeAllListeners()
          socket.on("error", () => {})
          socket.close()
          if (error) reject(new AuditError(error)); else resolve(value)
        }
        const aborted = () => finish(null, "NATIVE_CAPTURE_UNAVAILABLE")
        deadline.addEventListener("abort", aborted, { once: true })
        if (deadline.aborted) return aborted()
        socket.on("open", () => {
          try {
            socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: {
              expression: nativeCaptureExpression(), awaitPromise: true, returnByValue: true
            } }))
          } catch { finish(null, "NATIVE_CAPTURE_UNAVAILABLE") }
        })
        socket.on("message", (data) => {
          try {
            if (Buffer.byteLength(data) > 64 * 1024) return finish(null, "NATIVE_CAPTURE_UNAVAILABLE")
            const packet = JSON.parse(data.toString())
            if (packet.id !== 1) return
            if (packet.error || packet.result?.exceptionDetails || !object(packet.result?.result?.value)) {
              return finish(null, "NATIVE_CAPTURE_UNAVAILABLE")
            }
            finish(packet.result.result.value)
          } catch { finish(null, "NATIVE_CAPTURE_UNAVAILABLE") }
        })
        socket.on("error", () => finish(null, "NATIVE_CAPTURE_UNAVAILABLE"))
        socket.on("close", () => finish(null, "NATIVE_CAPTURE_UNAVAILABLE"))
      })
    } catch (error) { throw new AuditError(error instanceof AuditError ? error.code : "NATIVE_CAPTURE_UNAVAILABLE") }
  }
}

export function parseAuditArguments(args) {
  const urls = { common: null, A: null, B: null }
  const flags = { "--inspector-url": "common", "--inspector-url-a": "A", "--inspector-url-b": "B" }
  let foreignMessageChecks = false
  for (let i = 0; i < args.length; i++) {
    const slot = Object.hasOwn(flags, args[i]) ? flags[args[i]] : null
    if (slot && urls[slot] === null && typeof args[i + 1] === "string" && !args[i + 1].startsWith("--")) {
      urls[slot] = validateInspectorUrl(args[++i]).href
    } else if (args[i] === "--foreign-message-checks") foreignMessageChecks = true
    else fail("CONTROL_ARGUMENTS_REQUIRED")
  }
  if ((urls.common && (urls.A || urls.B)) || (!urls.common && (!urls.A || !urls.B))) {
    fail("CONTROL_ARGUMENTS_REQUIRED")
  }
  return { inspectorUrls: { A: urls.common ?? urls.A, B: urls.common ?? urls.B }, foreignMessageChecks }
}

export function createLabelledNativeCapturer({ inspectorUrls, ...options }) {
  const capturers = Object.fromEntries(["A", "B"].map(label => [label,
    createNativeCapturer({ ...options, inspectorUrl: inspectorUrls[label] })]))
  return (signal, label) => {
    if (!["A", "B"].includes(label)) fail("CONTROL_COMMAND_REQUIRED")
    return capturers[label](signal)
  }
}

function validateActor(actor, now) {
  const session = actor?.session
  if (!object(session) || session.mode !== "production" || !TOKEN_SHAPE.test(session.sessionToken ?? "") ||
      !identifier(session.userId) || actor.profileUserId !== session.userId || !complete(session.onboarding) ||
      !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now) {
    fail("ACTIVE_PRODUCTION_TEST_SESSION_REQUIRED")
  }
  return { token: session.sessionToken, userId: session.userId, expiresAt: Date.parse(session.expiresAt) }
}

export function selectPrivateThread(threads, ownerId, otherId) {
  if (!Array.isArray(threads)) fail("INVALID_THREAD_RESPONSE")
  for (const thread of threads) {
    const participants = thread?.participantUserIds
    if (!Array.isArray(participants) || participants.length !== 2 || new Set(participants).size !== 2 ||
        !participants.every(identifier) || !participants.includes(ownerId)) {
      fail("THREAD_OWNERSHIP_MISMATCH")
    }
  }
  const thread = threads.find(thread => !thread.participantUserIds.includes(otherId) &&
    identifier(thread.threadId) && identifier(thread.lastMessage?.messageId))
  return thread ? { threadId: thread.threadId, before: thread.lastMessage.messageId } : null
}

export async function writeSafeEvidence(evidence, path = EVIDENCE_PATH) {
  // Refuse to overwrite another run or existing user work. Credentials never reach this function.
  const file = await open(path, "wx", 0o600)
  try { await file.writeFile(JSON.stringify(evidence, null, 2) + "\n") } finally { await file.close() }
}

export function createAuditController({ captureActor, fetchImpl = fetch, writeEvidence = writeSafeEvidence,
  clock = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), foreignMessageChecks = false }) {
  const slots = { A: null, B: null }
  const outcomes = []
  let lastActivity = clock()
  let lastRequest = null
  let requests = 0
  let epoch = 0
  let busy = false
  let finished = false
  let aborter = null
  let stopReason = null

  function clear() {
    slots.A = null
    slots.B = null
    epoch++
    aborter?.abort()
    lastActivity = clock()
  }
  function expire() {
    if (clock() - lastActivity >= IDLE_MS) clear()
  }
  function status() {
    expire()
    return { enrolledCount: Number(Boolean(slots.A)) + Number(Boolean(slots.B)),
      ready: Boolean(slots.A && slots.B && !finished), requestsExecuted: requests,
      remainingRequestBudget: MAX_REQUESTS - requests, finished, busy }
  }
  function begin() {
    expire()
    if (busy || finished) { clear(); fail("AUDIT_NOT_AVAILABLE") }
    busy = true
    lastActivity = clock()
    aborter = new AbortController()
    return { epoch, signal: aborter.signal }
  }
  function current(operation) {
    if (operation.epoch !== epoch || operation.signal.aborted) fail("OPERATION_CANCELLED")
  }
  async function request(label, path, template, operation, mode = "own") {
    current(operation)
    const credential = slots[label]
    if (!credential || credential.expiresAt <= clock()) fail("ACTIVE_PRODUCTION_TEST_SESSION_REQUIRED")
    if (requests >= MAX_REQUESTS) fail("REQUEST_BUDGET_EXHAUSTED")
    const url = new URL(path, TARGET_ORIGIN)
    if (url.origin !== TARGET_ORIGIN || url.username || url.password || !path.startsWith("/v1/") ||
        !(OWN_PATHS.includes(path) || (mode === "foreign" && /^\/v1\/threads\/[^/?#]+\/messages\?before=[^&#]+&limit=1$/.test(path)))) {
      fail("REQUEST_NOT_ALLOWLISTED")
    }
    if (lastRequest !== null) await sleep(Math.max(0, lastRequest + 1_200 - clock()))
    current(operation)
    lastRequest = clock()
    requests++
    const row = { label, routeTemplate: template, method: "GET", kind: mode, status: null }
    outcomes.push(row)
    const deadline = AbortSignal.any([operation.signal, AbortSignal.timeout(8_000)])
    try {
      const response = await fetchImpl(url.href, { method: "GET", redirect: "error", credentials: "omit",
        cache: "no-store", headers: { accept: "application/json", authorization: `Bearer ${credential.token}` }, signal: deadline })
      current(operation)
      row.status = response.status
      row.noStore = response.headers.get("cache-control")?.includes("no-store") ?? false
      if (response.redirected || (response.status >= 300 && response.status < 400) ||
          (response.url && new URL(response.url).origin !== TARGET_ORIGIN)) fail("REDIRECT_REFUSED")
      if (mode === "foreign" && response.status >= 200 && response.status < 300) {
        // Do not even read the private payload after an unexpected authorization success.
        await response.body?.cancel().catch(() => {})
        row.unexpectedForeignAuthorizationSuccessObserved = true
        row.privateDataDisclosureVerified = false
        fail("FOREIGN_PRIVATE_SUCCESS_STOP")
      }
      if (mode === "foreign" && [403, 404].includes(response.status)) {
        await response.body?.cancel().catch(() => {})
        row.accessDenied = true
        return null
      }
      if (response.status !== 200) fail(response.status === 429 ? "RATE_LIMITED" : "HTTP_ACCESS_UNAVAILABLE")
      const body = await readJsonBounded(response, RESPONSE_LIMIT, deadline)
      current(operation)
      return body
    } catch (error) {
      row.failureCode = safeCode(error)
      throw new AuditError(row.failureCode)
    }
  }

  async function capture(label) {
    if (!["A", "B"].includes(label)) { clear(); fail("CONTROL_COMMAND_REQUIRED") }
    const operation = begin()
    slots[label] = null
    let candidate
    try {
      candidate = validateActor(await captureActor(operation.signal, label), clock())
      current(operation)
      const other = slots[label === "A" ? "B" : "A"]
      if (other && candidate.userId === other.userId) fail("DISTINCT_TEST_ACCOUNTS_REQUIRED")
      slots[label] = candidate
      const body = await request(label, "/v1/users/me", "/v1/users/me", operation)
      const row = outcomes.at(-1)
      row.selfIdentityMatches = body?.profile?.userId === candidate.userId
      row.activeAccount = body?.moderation?.status === "active"
      row.onboardingComplete = complete(body?.onboarding)
      if (!row.selfIdentityMatches || !row.activeAccount || !row.onboardingComplete) fail("ACTIVE_TEST_ACCOUNT_PROOF_REQUIRED")
      current(operation)
      return { enrolled: true, label, enrolledCount: status().enrolledCount }
    } catch (error) {
      clear()
      throw new AuditError(safeCode(error))
    } finally {
      candidate = null
      busy = false
      aborter = null
    }
  }

  async function run() {
    expire()
    if (!slots.A || !slots.B || slots.A.userId === slots.B.userId) {
      clear()
      fail("TWO_DISTINCT_TEST_ACCOUNTS_REQUIRED")
    }
    const operation = begin()
    const threads = { A: null, B: null }
    const blocked = ["economy_and_inventory_reads", "own_newest_messages", "own_room_invites", "foreign_room_invites_without_independent_expiration_proof"]
    try {
      for (const path of OWN_PATHS.filter(path => path !== "/v1/users/me")) {
        for (const label of ["A", "B"]) {
          const body = await request(label, path, path, operation)
          const row = outcomes.at(-1)
          const userId = slots[label].userId
          if (path.startsWith("/v1/threads")) {
            if (body?.userId !== userId || !Array.isArray(body.threads) || body.threads.length > 10) fail("THREAD_OWNERSHIP_MISMATCH")
            selectPrivateThread(body.threads, userId, slots[label === "A" ? "B" : "A"].userId)
            threads[label] = body.threads
            row.allThreadsIncludeCaller = true
            row.recordCount = body.threads.length
          } else if (path === "/v1/users/me/room-decor") {
            if (body?.roomDecor !== null && (!object(body?.roomDecor) || body.roomDecor.userId !== userId)) fail("ROOM_OWNERSHIP_MISMATCH")
            row.roomOwnerMatchesCaller = true
            row.empty = body.roomDecor === null
          } else if (path === "/v1/safety/reports") {
            if (!Array.isArray(body?.reports)) fail("INVALID_RESPONSE")
            row.recordCount = body.reports.length
            row.ownershipNotIndependentlyProven = true
          } else if (path === "/v1/safety/blocks") {
            if (body?.userId !== userId || !Array.isArray(body.blocks)) fail("BLOCK_OWNERSHIP_MISMATCH")
            if (body.blocks.some(block => block.actorUserId !== userId)) fail("BLOCK_OWNERSHIP_MISMATCH")
            row.actorMatchesCaller = true
            row.recordCount = body.blocks.length
          } else if (path === "/v1/notification-preferences") {
            if (!object(body?.preferences) || !["likesEnabled", "messagesEnabled", "matchesEnabled", "discoveryWatchEnabled"]
              .every(key => typeof body.preferences[key] === "boolean")) fail("INVALID_RESPONSE")
            row.preferencesShapeValid = true
          } else {
            if (!object(body?.preferences) || typeof body.preferences.readReceiptsEnabled !== "boolean" ||
                typeof body.available !== "boolean") fail("INVALID_RESPONSE")
            row.preferencesShapeValid = true
          }
        }
      }
      for (const owner of ["A", "B"]) {
        const caller = owner === "A" ? "B" : "A"
        if (!foreignMessageChecks) { blocked.push(`foreign_messages_${caller}_to_${owner}_not_operator_enabled`); continue }
        const resource = selectPrivateThread(threads[owner], slots[owner].userId, slots[caller].userId)
        if (!resource) { blocked.push(`foreign_messages_${caller}_to_${owner}_no_private_cursor_fixture`); continue }
        const path = `/v1/threads/${encodeURIComponent(resource.threadId)}/messages?${new URLSearchParams({ before: resource.before, limit: "1" })}`
        await request(caller, path, "/v1/threads/:threadId/messages?before=:messageCursor&limit=1", operation, "foreign")
      }
    } catch (error) { stopReason = safeCode(error) }
    finally {
      threads.A = null
      threads.B = null
      clear()
      busy = false
      aborter = null
      finished = true
    }
    const evidence = { reviewDate: "2026-10-10", targetOrigin: TARGET_ORIGIN,
      status: stopReason ? "stopped" : "completed_with_open_gates", stopReason,
      requestsExecuted: requests, maximumRequests: MAX_REQUESTS, minimumRequestGapMs: 1_200,
      authenticatedAccountsVerified: new Set(outcomes.filter(row => row.routeTemplate === "/v1/users/me" &&
        row.selfIdentityMatches && row.activeAccount && row.onboardingComplete).map(row => row.label)).size,
      unexpectedForeignAuthorizationSuccessObserved: outcomes.some(row => row.unexpectedForeignAuthorizationSuccessObserved === true),
      privateDataDisclosureVerified: false,
      foreignPrivatePayloadRead: false, credentialsRetained: false, productMutationsRequested: false,
      requestBudgetAccountingMayWrite: true, blocked, outcomes }
    try { await writeEvidence(evidence) } catch { fail("SAFE_EVIDENCE_WRITE_UNAVAILABLE") }
    return evidence
  }
  return { capture, run, clear, status, expire }
}

const OWN_PATHS = ["/v1/users/me", "/v1/threads?limit=10", "/v1/users/me/room-decor",
  "/v1/safety/reports", "/v1/safety/blocks", "/v1/notification-preferences", "/v1/chat-preferences"]

async function cli() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") fail("TLS_VERIFICATION_REQUIRED")
  const { inspectorUrls, foreignMessageChecks } = parseAuditArguments(process.argv.slice(2))
  const captureActor = createLabelledNativeCapturer({ inspectorUrls })
  const controller = createAuditController({ captureActor, foreignMessageChecks })
  const input = createInterface({ input: process.stdin, terminal: false })
  const timer = setInterval(() => controller.expire(), 5_000)
  timer.unref()
  const stop = () => { controller.clear(); input.close() }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  process.stdout.write("Only control commands are accepted. Capture only after the owner confirms the selected existing TEST account.\n")
  try {
    for await (const line of input) {
      try {
        const command = line.trim()
        let result
        if (command === "capture-a" || command === "capture-b") result = await controller.capture(command === "capture-a" ? "A" : "B")
        else if (command === "status") result = controller.status()
        else if (command === "clear") { controller.clear(); result = { credentialsCleared: true } }
        else if (command === "run") {
          const evidence = await controller.run()
          result = { status: evidence.status, requestsExecuted: evidence.requestsExecuted,
            unexpectedForeignAuthorizationSuccessObserved: evidence.unexpectedForeignAuthorizationSuccessObserved,
            privateDataDisclosureVerified: false, credentialsCleared: true }
        } else if (command === "exit") { stop(); break }
        else fail("CONTROL_COMMAND_REQUIRED")
        process.stdout.write(JSON.stringify(result) + "\n")
      } catch (error) {
        controller.clear()
        process.stdout.write(JSON.stringify({ errorCode: safeCode(error), ...controller.status() }) + "\n")
      }
    }
  } finally {
    controller.clear()
    clearInterval(timer)
    process.removeListener("SIGINT", stop)
    process.removeListener("SIGTERM", stop)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  cli().catch(error => { process.stderr.write(JSON.stringify({ errorCode: safeCode(error) }) + "\n"); process.exitCode = 1 })
}
