/**
 * Local realtime latency and capacity harness (RT-10).
 *
 * Starts the real Fastify API and realtime server in this process, wired like
 * `src/index.ts`, against in-memory repositories or a disposable local
 * PostgreSQL database (optionally behind a TCP proxy that injects database
 * round-trip latency), then drives simulated phones from worker threads:
 * MiniRoom moves, in-room chat, HTTP chat, idle connected users and an
 * optional deploy-style reconnect storm. It reports p50/p95/p99 latencies,
 * database round trips, pool queueing, event-loop delay and per-stage chat
 * timings (`BLUMI_CHAT_LATENCY_DIAGNOSTICS`).
 *
 * Local only: it refuses production settings and any non-loopback database,
 * creates and drops its own database, and never logs message bodies or ids.
 *
 *   node --import tsx apps/server/scripts/realtime-load/harness.ts \
 *     --repo postgres --admin-url postgresql://blumi@127.0.0.1:56731/postgres \
 *     --db-rtt-ms 20 --users 5000 --rooms 500 --duration-s 60 --storm
 */
import { randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
import type { AddressInfo } from "node:net"
import { monitorEventLoopDelay } from "node:perf_hooks"
import { parseArgs } from "node:util"
import { Worker } from "node:worker_threads"
import pg from "pg"
import { formatSummaryTable, round, summarize, type LatencySummary } from "./stats"
import type { SimulatedUser, WorkerConfig } from "./clientWorker"

const { values: args } = parseArgs({
  options: {
    repo: { type: "string", default: "memory" },
    "admin-url": { type: "string" },
    "db-rtt-ms": { type: "string", default: "0" },
    "pool-max": { type: "string" },
    users: { type: "string", default: "200" },
    rooms: { type: "string", default: "50" },
    "dm-pairs": { type: "string", default: "0" },
    "duration-s": { type: "string", default: "30" },
    "move-interval-ms": { type: "string", default: "2000" },
    "room-chat-interval-ms": { type: "string", default: "5000" },
    "dm-interval-ms": { type: "string", default: "10000" },
    "users-per-address": { type: "string", default: "1" },
    "connect-rate": { type: "string", default: "400" },
    workers: { type: "string", default: "3" },
    storm: { type: "boolean", default: false },
    // restart: deploy-style server restart (1012); drop: every socket cut at
    // once without a close frame (edge proxy or network drop, clients see 1006).
    "storm-kind": { type: "string", default: "restart" },
    "storm-timeout-s": { type: "string", default: "180" },
    out: { type: "string" },
    label: { type: "string", default: "run" }
  }
})

const repo = args.repo === "postgres" ? "postgres" : "memory"
const dbRttMs = Number(args["db-rtt-ms"])
const userCount = Number(args.users)
const roomCount = Number(args.rooms)
const dmPairCount = Number(args["dm-pairs"])
const durationMs = Number(args["duration-s"]) * 1000
const workerCount = Math.max(1, Number(args.workers))
const usersPerAddress = Math.max(1, Number(args["users-per-address"]))
if (roomCount * 2 + dmPairCount * 2 > userCount) throw new Error("Not enough users for the rooms and DM pairs.")
if (process.env.NODE_ENV === "production" || process.env.BLUMI_DEPLOY_ENV) {
  throw new Error("The load harness never runs with production settings.")
}

const now = () => performance.timeOrigin + performance.now()
const log = (message: string) => process.stderr.write(`[harness] ${message}\n`)

// ── Database instrumentation (round trips and pool queueing) ─────────────
let roundTrips = 0
const originalClientQuery = pg.Client.prototype.query
pg.Client.prototype.query = function instrumentedQuery(this: pg.Client, ...queryArgs: unknown[]) {
  roundTrips += 1
  return (originalClientQuery as (...values: unknown[]) => unknown).apply(this, queryArgs)
} as typeof pg.Client.prototype.query
const pools = new Set<pg.Pool>()
const originalPoolConnect = pg.Pool.prototype.connect
pg.Pool.prototype.connect = function instrumentedConnect(this: pg.Pool, ...connectArgs: unknown[]) {
  pools.add(this)
  return (originalPoolConnect as (...values: unknown[]) => unknown).apply(this, connectArgs)
} as typeof pg.Pool.prototype.connect

// ── Chat stage timings from the server's own diagnostics ─────────────────
const chatPhases: Record<string, number[]> = {}
const originalInfo = console.info
console.info = (...values: unknown[]) => {
  if (values[0] === "Local chat latency") {
    const sample = values[1] as { phase: string; durationMs: number }
    ;(chatPhases[sample.phase] ??= []).push(sample.durationMs)
    return
  }
  originalInfo(...values)
}

async function prepareDatabase(): Promise<{ databaseUrl: string; directUrl: string; drop(): Promise<void> }> {
  const adminUrl = args["admin-url"]
  if (!adminUrl) throw new Error("--admin-url is required with --repo postgres")
  const parsed = new URL(adminUrl)
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error("The load harness only uses a loopback PostgreSQL cluster.")
  }
  const name = `blumi_rt_load_${Date.now()}`
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 })
  await admin.query(`CREATE DATABASE ${name}`)
  for (const role of ["anon", "authenticated"]) {
    await admin.query(`DO $$ BEGIN CREATE ROLE ${role} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`)
  }
  const directUrl = new URL(adminUrl)
  directUrl.pathname = `/${name}`
  const migrateModule = await import("../../src/db/migrate") as typeof import("../../src/db/migrate") & { default?: typeof import("../../src/db/migrate") }
  const { runMigrations } = migrateModule.default ?? migrateModule
  await runMigrations({ databaseUrl: directUrl.toString() })
  const direct = new pg.Pool({ connectionString: directUrl.toString(), max: 1 })
  await direct.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements").catch(() => undefined)
  await direct.end()
  let databaseUrl = directUrl.toString()
  let proxy: Worker | undefined
  if (dbRttMs > 0) {
    const listenPort = 20_000 + Math.floor(Math.random() * 20_000)
    proxy = new Worker(new URL("./workerBootstrap.mjs", import.meta.url), {
      workerData: {
        entry: new URL("./delayProxy.ts", import.meta.url).href,
        listenPort,
        targetHost: parsed.hostname,
        targetPort: Number(parsed.port || 5432),
        oneWayDelayMs: dbRttMs / 2
      }
    })
    await new Promise<void>((resolve, reject) => {
      proxy!.once("message", () => resolve())
      proxy!.once("error", reject)
    })
    const proxied = new URL(databaseUrl)
    proxied.port = String(listenPort)
    databaseUrl = proxied.toString()
  }
  return {
    databaseUrl,
    directUrl: directUrl.toString(),
    async drop() {
      await proxy?.terminate()
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      await admin.end()
    }
  }
}

async function main(): Promise<void> {
  const database = repo === "postgres" ? await prepareDatabase() : undefined
  process.env.NODE_ENV = "development"
  process.env.BLUMI_CHAT_LATENCY_DIAGNOSTICS = "1"
  process.env.BLUMI_TRUST_PROXY = "127.0.0.1"
  process.env.HOST = "127.0.0.1"
  process.env.BLUMI_AUTH_REPOSITORY = repo
  if (database) {
    process.env.DATABASE_URL = database.databaseUrl
    process.env.BLUMI_OTP_HMAC_SECRET = randomBytes(32).toString("hex")
  }
  if (args["pool-max"]) process.env.BLUMI_DB_POOL_MAX = args["pool-max"]

  const { createConfiguredServerServices, resolveServerConfig } = await import("../../src/config")
  const { createServer } = await import("../../src/server")
  const { createRealtimeServer } = await import("../../src/realtime/realtimeServer")
  const { createConnectionManager } = await import("../../src/realtime/connectionManager")
  const { createRealtimeTicketService } = await import("../../src/realtime/realtimeTicketService")
  const { createChatMessageDeliveryService } = await import("../../src/chat/chatMessageDeliveryService")
  const { startChatDeliveryWorker } = await import("../../src/chat/chatDeliveryWorker")
  const { createAccountRecord, createSessionRecord, createSessionToken } = await import("../../src/auth/authStore")

  const config = resolveServerConfig(process.env)
  const services = createConfiguredServerServices(config)
  const connectionManager = createConnectionManager({
    fanout: services.realtimeFanout,
    reportFanoutError: () => log("fanout publish failed")
  })
  // Same setup gate as src/index.ts (absent in trees that predate it).
  const gateModule = await import("../../src/realtime/connectionSetupGate").catch(() => undefined)
  const realtimeTicketService = createRealtimeTicketService({
    authService: services.authService,
    store: services.realtimeTicketStore,
    ...(gateModule ? {
      setupGate: gateModule.createConnectionSetupGate(repo === "postgres"
        ? gateModule.connectionSetupLimitForPool(config.databasePool.max)
        : gateModule.DEFAULT_CONNECTION_SETUP_LIMIT)
    } : {})
  })
  const chatDeliveryWorker = startChatDeliveryWorker({
    deliveryService: createChatMessageDeliveryService({
      chatService: services.chatService,
      safetyService: services.safetyService,
      notificationService: services.notificationService,
      connectionManager
    }),
    reportError: () => log("chat delivery worker failed")
  })
  const app = createServer({
    discoverySnapshots: services.discoverySnapshots,
    sharedRateLimiter: services.sharedRateLimiter,
    isAccepting: () => true,
    authService: services.authService,
    chatService: services.chatService,
    economyService: services.economyService,
    commerceService: services.commerceService,
    revenueCatPurchaseVerifier: services.revenueCatPurchaseVerifier,
    avatarService: services.avatarService,
    notificationService: services.notificationService,
    referralService: services.referralService,
    miniRoomService: services.miniRoomService,
    connectionService: services.connectionService,
    connectionManager,
    realtimeTicketService,
    matchService: services.matchService,
    safetyService: services.safetyService,
    accountRecoveryService: services.accountRecoveryService,
    personalRoomDecorService: services.personalRoomDecorService,
    roomSnapshotService: services.roomSnapshotService,
    logger: false,
    nodeEnv: "development",
    trustedProxyAddresses: config.trustedProxyAddresses
  })
  const createRealtime = () => createRealtimeServer({
    authService: services.authService,
    chatService: services.chatService,
    safetyService: services.safetyService,
    presenceService: services.presenceService,
    miniRoomService: services.miniRoomService,
    connectionService: services.connectionService,
    reactionService: services.reactionService,
    notificationService: services.notificationService,
    connectionManager,
    realtimeTicketService,
    trustedProxyAddresses: config.trustedProxyAddresses,
    httpServer: app.server
  })
  await app.listen({ port: 0, host: "127.0.0.1" })
  let realtimeServer = createRealtime()
  await realtimeServer.listen({ port: 0, host: "127.0.0.1" })
  const port = (app.server.address() as AddressInfo).port
  log(`server on ${port} (${repo}${database ? `, db rtt +${dbRttMs} ms` : ""})`)

  // ── Seed accounts, sessions, rooms and threads ─────────────────────────
  const seedPool = database ? new pg.Pool({ connectionString: database.directUrl, max: 8 }) : undefined
  const authRepository = seedPool
    ? (await import("../../src/db/postgresAuthRepository")).createPostgresAuthRepository(seedPool)
    : services.authService.repository
  const miniRoomRepository = seedPool
    ? (await import("../../src/db/postgresMiniRoomRepository")).createPostgresMiniRoomRepository(seedPool)
    : services.miniRoomService.repository
  const chatRepository = seedPool
    ? (await import("../../src/db/postgresChatRepository")).createPostgresChatRepository(seedPool)
    : services.chatService.repository
  const seededAt = new Date()
  const users: { userId: string; sessionToken: string; displayName: string }[] = []
  const seedBatch = 64
  for (let start = 0; start < userCount; start += seedBatch) {
    await Promise.all(Array.from({ length: Math.min(seedBatch, userCount - start) }, async (_, offset) => {
      const index = start + offset
      const account = createAccountRecord(`+9055${String(10_000_000 + index).padStart(8, "0")}`, seededAt)
      const displayName = `Load ${index}`
      account.profile = { ...account.profile, displayName, age: 25, gender: index % 2 ? "man" : "woman" }
      account.onboarding = { profile: "complete", avatar: "complete", room: "complete" }
      await authRepository.saveAccount(account)
      const sessionToken = createSessionToken()
      await authRepository.saveSession(createSessionRecord(account, sessionToken, seededAt))
      users[index] = { userId: account.userId, sessionToken, displayName }
    }))
  }
  const pairs: { miniRoomId: string; threadId: string; a: number; b: number; kind: "room" | "dm" }[] = []
  for (let index = 0; index < roomCount + dmPairCount; index += 1) {
    pairs.push({
      miniRoomId: `load-room-${index}`,
      threadId: `load-thread-${index}`,
      a: index * 2,
      b: index * 2 + 1,
      kind: index < roomCount ? "room" : "dm"
    })
  }
  for (let start = 0; start < pairs.length; start += seedBatch) {
    await Promise.all(pairs.slice(start, start + seedBatch).map(async (pair) => {
      const a = users[pair.a]!, b = users[pair.b]!
      const at = seededAt.toISOString()
      await miniRoomRepository.saveInvite({
        inviteId: `load-invite-${pair.miniRoomId}`, senderUserId: a.userId,
        recipientUserId: b.userId, status: "pending", createdAt: at
      })
      await miniRoomRepository.acceptPendingInvite({
        inviteId: `load-invite-${pair.miniRoomId}`, decidedAt: at,
        miniRoom: {
          miniRoomId: pair.miniRoomId, lobbyRoomId: "retired", livekitRoomName: `load-${pair.miniRoomId}`,
          participantUserIds: [a.userId, b.userId], startedAt: at
        }
      })
      await chatRepository.saveThread({
        threadId: pair.threadId,
        miniRoomId: pair.miniRoomId,
        participantUserIds: [a.userId, b.userId],
        participants: [
          { userId: a.userId, displayName: a.displayName },
          { userId: b.userId, displayName: b.displayName }
        ],
        createdAt: at
      })
    }))
  }
  await seedPool?.end()
  log(`seeded ${users.length} users, ${roomCount} rooms, ${dmPairCount} DM pairs`)

  // ── Assign simulated phones to workers (pairs stay together) ───────────
  const simulated: SimulatedUser[] = users.map((user, index) => ({
    userId: user.userId,
    sessionToken: user.sessionToken,
    address: `10.${Math.floor(index / usersPerAddress / 65_536) % 256}.${Math.floor(index / usersPerAddress / 256) % 256}.${Math.floor(index / usersPerAddress) % 256}`,
    role: "idle"
  }))
  for (const pair of pairs) {
    const a = simulated[pair.a]!, b = simulated[pair.b]!
    for (const [self, other, sender] of [[a, b, true], [b, a, false]] as const) {
      self.role = pair.kind
      self.partnerUserId = other.userId
      self.threadId = pair.threadId
      self.miniRoomId = pair.kind === "room" ? pair.miniRoomId : undefined
      self.chatSender = sender
    }
  }
  const buckets: SimulatedUser[][] = Array.from({ length: workerCount }, () => [])
  for (let index = 0; index < simulated.length; index += 2) {
    const bucket = buckets[(index / 2) % workerCount]!
    bucket.push(simulated[index]!)
    if (simulated[index + 1]) bucket.push(simulated[index + 1]!)
  }
  const workers = buckets.map((bucket) => {
    const workerConfig: WorkerConfig = {
      httpUrl: `http://127.0.0.1:${port}`,
      wsUrl: `ws://127.0.0.1:${port}`,
      users: bucket,
      moveIntervalMs: Number(args["move-interval-ms"]),
      roomChatIntervalMs: Number(args["room-chat-interval-ms"]),
      dmIntervalMs: Number(args["dm-interval-ms"]),
      connectRatePerSecond: Math.max(1, Math.round(Number(args["connect-rate"]) / workerCount))
    }
    return new Worker(new URL("./workerBootstrap.mjs", import.meta.url), {
      workerData: { ...workerConfig, entry: new URL("./clientWorker.ts", import.meta.url).href },
      resourceLimits: { maxOldGenerationSizeMb: 2048 }
    })
  })
  const request = <T>(worker: Worker, command: object, reply: string, timeoutMs = 600_000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { worker.off("message", onMessage); reject(new Error(`timeout waiting for ${reply}`)) }, timeoutMs)
      const onMessage = (message: { type: string }) => {
        if (message.type !== reply) return
        clearTimeout(timer)
        worker.off("message", onMessage)
        resolve(message as T)
      }
      worker.on("message", onMessage)
      worker.postMessage(command)
    })

  const collectGarbage = (globalThis as { gc?: () => void }).gc
  collectGarbage?.()
  const heapBefore = process.memoryUsage()
  const connectStarted = now()
  await Promise.all(workers.map((worker) => request(worker, { type: "connect" }, "connected")))
  const connectSeconds = (now() - connectStarted) / 1000
  await new Promise((resolve) => setTimeout(resolve, 3000))
  collectGarbage?.()
  const heapConnected = process.memoryUsage()
  log(`all ${userCount} connected in ${round(connectSeconds)} s`)

  // ── Steady load ─────────────────────────────────────────────────────────
  for (const phase of Object.keys(chatPhases)) chatPhases[phase] = []
  const statementsPool = database ? new pg.Pool({ connectionString: database.directUrl, max: 1 }) : undefined
  await statementsPool?.query("SELECT pg_stat_statements_reset()").catch(() => undefined)
  const loop = monitorEventLoopDelay({ resolution: 1 })
  loop.enable()
  const poolSamples: number[] = []
  const poolTimer = setInterval(() => {
    let waiting = 0
    for (const pool of pools) waiting += pool.waitingCount
    poolSamples.push(waiting)
  }, 100)
  const roundTripsBefore = roundTrips
  const cpuBefore = process.cpuUsage()
  const loadStarted = now()
  await Promise.all(workers.map((worker) => request(worker, { type: "start-load" }, "load-started")))
  await new Promise((resolve) => setTimeout(resolve, durationMs))
  await Promise.all(workers.map((worker) => request(worker, { type: "stop-load" }, "load-stopped")))
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const loadSeconds = (now() - loadStarted) / 1000
  const cpu = process.cpuUsage(cpuBefore)
  const loadRoundTrips = roundTrips - roundTripsBefore
  loop.disable()
  clearInterval(poolTimer)
  const statements = statementsPool
    ? (await statementsPool.query(
        `SELECT calls, round(mean_exec_time::numeric, 2) AS mean_ms, left(regexp_replace(query, '\\s+', ' ', 'g'), 110) AS query
           FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          ORDER BY calls DESC LIMIT 20`
      ).catch(() => ({ rows: [] }))).rows
    : []

  // ── Reconnect storm (deploy-style restart of the realtime server) ──────
  let stormRecoverySeconds: number | undefined
  let stormRoundTrips: number | undefined
  if (args.storm) {
    const stormBefore = roundTrips
    const stormAt = now()
    for (const worker of workers) worker.postMessage({ type: "storm-mark", at: stormAt })
    if (args["storm-kind"] === "drop") {
      for (const connection of connectionManager.listConnections()) connection.socket.terminate()
    } else {
      await realtimeServer.close({ preserveFanout: true })
      realtimeServer = createRealtime()
      await realtimeServer.listen({ port, host: "127.0.0.1" })
    }
    const recovered = await Promise.allSettled(workers.map((worker) =>
      request<{ at: number }>(worker, { type: "noop" }, "storm-recovered", Number(args["storm-timeout-s"]) * 1000)))
    const finished = recovered.every((result) => result.status === "fulfilled")
    stormRecoverySeconds = finished
      ? round((Math.max(...recovered.map((result) => (result as PromiseFulfilledResult<{ at: number }>).value.at)) - stormAt) / 1000)
      : Number.POSITIVE_INFINITY
    stormRoundTrips = roundTrips - stormBefore
  }

  const reports = await Promise.all(workers.map((worker) => request<{
    samples: Record<string, number[]>
    counters: Record<string, number>
    closeCodes: Record<string, number>
    connected: number
    pending: Record<string, number>
  }>(worker, { type: "report" }, "report")))
  const merged: Record<string, number[]> = {}
  const counters: Record<string, number> = {}
  const closeCodes: Record<string, number> = {}
  const pending: Record<string, number> = {}
  let connectedAtEnd = 0
  for (const report of reports) {
    for (const [name, values] of Object.entries(report.samples)) (merged[name] ??= []).push(...values)
    for (const [name, value] of Object.entries(report.counters)) counters[name] = (counters[name] ?? 0) + value
    for (const [name, value] of Object.entries(report.closeCodes)) closeCodes[name] = (closeCodes[name] ?? 0) + value
    for (const [name, value] of Object.entries(report.pending)) pending[name] = (pending[name] ?? 0) + value
    connectedAtEnd += report.connected
  }
  const latency: Record<string, LatencySummary> = {}
  for (const [name, values] of Object.entries(merged)) if (values.length) latency[name] = summarize(values)
  for (const [phase, values] of Object.entries(chatPhases)) if (values.length) latency[`server_${phase}`] = summarize(values)
  const summary = {
    label: args.label,
    repo,
    dbRttMs,
    poolMax: args["pool-max"] ?? "default",
    users: userCount,
    rooms: roomCount,
    dmPairs: dmPairCount,
    usersPerAddress,
    connectSeconds: round(connectSeconds),
    loadSeconds: round(loadSeconds),
    serverHeapPerConnectionKb: round(((heapConnected.heapUsed + heapConnected.external) -
      (heapBefore.heapUsed + heapBefore.external)) / userCount / 1024),
    serverCpuPercentOfOneCore: round((cpu.user + cpu.system) / 1000 / (loadSeconds * 1000) * 100),
    eventLoopDelayMs: {
      p50: round(loop.percentile(50) / 1e6), p99: round(loop.percentile(99) / 1e6), max: round(loop.max / 1e6)
    },
    dbRoundTripsPerSecond: round(loadRoundTrips / loadSeconds),
    poolWaitingMax: Math.max(0, ...poolSamples),
    poolWaitingMean: round(poolSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, poolSamples.length)),
    stormKind: args.storm ? args["storm-kind"] : undefined,
    stormRecoverySeconds,
    stormRoundTrips,
    connectedAtEnd,
    counters,
    closeCodes,
    pending,
    latency,
    topStatements: statements
  }
  process.stdout.write(`\n=== ${summary.label}: ${repo}${database ? ` rtt+${dbRttMs}ms` : ""}, ${userCount} users, ${roomCount} rooms, ${dmPairCount} dm pairs ===\n`)
  process.stdout.write(formatSummaryTable(latency) + "\n")
  const { latency: _latency, topStatements: _statements, ...rest } = summary
  process.stdout.write(JSON.stringify(rest, null, 1) + "\n")
  if (statements.length) {
    process.stdout.write("top statements by calls:\n")
    for (const row of statements) process.stdout.write(`  ${String(row.calls).padStart(7)}  ${String(row.mean_ms).padStart(6)} ms  ${row.query}\n`)
  }
  if (args.out) writeFileSync(args.out, JSON.stringify(summary, null, 2))

  for (const worker of workers) worker.postMessage({ type: "shutdown" })
  await new Promise((resolve) => setTimeout(resolve, 500))
  await Promise.allSettled(workers.map((worker) => worker.terminate()))
  await realtimeServer.close()
  await chatDeliveryWorker.stop()
  await app.close()
  await services.close()
  await statementsPool?.end()
  await database?.drop()
}

main().then(() => process.exit(0), (error: unknown) => {
  process.stderr.write(`[harness] failed: ${error instanceof Error ? error.stack : String(error)}\n`)
  process.exit(1)
})
