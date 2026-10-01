import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import { performance } from "node:perf_hooks"
import type { ClientEvent, ServerEvent } from "@blumi/contracts"
import { Pool } from "pg"
import WebSocket from "ws"
import type { FirebaseAuthVerifier } from "../auth/firebaseAuth"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"
import { startChatDeliveryWorker } from "../chat/chatDeliveryWorker"
import { createChatMessageDeliveryService } from "../chat/chatMessageDeliveryService"
import {
  createConfiguredServerServices,
  resolveServerConfig,
  type ConfiguredServerServices
} from "../config"
import { createDiscoverySnapshotService, createInMemoryDiscoverySnapshots } from "../matches/discoverySnapshot"
import { createInMemoryMatchRepository, createInMemoryMatchStore } from "../matches/matchRepository"
import { createMatchService } from "../matches/matchService"
import type { PushDelivery } from "../notifications/notificationRepository"
import { createConnectionManager } from "../realtime/connectionManager"
import { createRealtimeServer } from "../realtime/realtimeServer"
import { createRealtimeTicketService } from "../realtime/realtimeTicketService"
import { createServer } from "../server"

/**
 * End-to-end harness for the social loop (see socialLoop.e2e.test.ts).
 *
 * It boots the production service graph (`createConfiguredServerServices`, in
 * memory or on PostgreSQL), the real Fastify app on a loopback port, the real
 * websocket server on the same port (production's PORT === REALTIME_PORT
 * shape) and the chat delivery outbox worker, wired exactly as `index.ts`
 * wires them. Simulated people only use the public surface: HTTP through
 * `fetch` and websockets through `ws`, each from its own client address
 * (X-Forwarded-For behind a trusted loopback proxy, like phones behind the
 * Railway edge) so per-address limits apply per person.
 *
 * Deliberate differences from production, all test seams:
 * - Phone sign-in goes through `/v1/auth/firebase/complete` with a fake
 *   Firebase verifier that accepts `e2e-phone:<E.164>` tokens.
 * - In-memory storage has no accounts-backed Discover query (PostgreSQL reads
 *   `blumi_accounts`), so after onboarding the harness publishes the account
 *   as a Discover profile, mapped the way the PostgreSQL repository maps rows.
 * - The capability manifest rolls out `chat_read_receipts` to everyone;
 *   migration readiness stays the real runtime gate (static in memory, the
 *   migration 070 ledger probe on PostgreSQL).
 * - The push outbox worker is not started, so queued pushes stay inspectable
 *   through the repository (`pendingPushes`).
 */

export type SocialLoopStorage = "memory" | "postgres"

export const RECEIPTS_ROLLED_OUT_MANIFEST = JSON.stringify({
  rollouts: { db_chat_metadata_ready: 100, chat_read_receipts: 100 }
})
const TRUSTED_PROXY = ["127.0.0.1"]
const DEFAULT_WAIT_MS = 2_000

export type EventOf<T extends ServerEvent["type"]> = Extract<ServerEvent, { type: T }>
/** Distributes over ClientEvent, whose scene events share one member with a union `type`. */
export type ClientPayload<T extends ClientEvent["type"]> = ClientEvent extends infer Event
  ? Event extends { type: infer Type; payload: infer Payload } ? T extends Type ? Payload : never : never
  : never

export interface Received<T extends ServerEvent = ServerEvent> {
  event: T
  /** performance.now() when the frame was parsed on the simulated phone. */
  at: number
}

export interface HttpResult {
  status: number
  /** Parsed JSON body (untyped wire data); scenarios assert the fields they rely on. */
  body: any
  startedAt: number
  ms: number
}

let phoneCounter = 0
let addressCounter = 0
// Distinct per process run, so PostgreSQL databases reused across runs stay valid.
const runPrefix = String(Date.now() % 1000).padStart(3, "0")

function nextPhoneNumber(): string {
  phoneCounter += 1
  return `+90555${runPrefix}${String(phoneCounter).padStart(4, "0")}`
}

function nextClientAddress(): string {
  addressCounter += 1
  return `10.${(addressCounter >> 16) & 255}.${(addressCounter >> 8) & 255}.${addressCounter & 255}`
}

export class SimSocket {
  readonly events: Received[] = []
  readonly closed: Promise<number>
  private readonly listeners = new Set<() => void>()

  constructor(readonly ws: WebSocket, readonly owner: SimUser) {
    ws.on("message", (data) => {
      this.events.push({ event: JSON.parse(String(data)) as ServerEvent, at: performance.now() })
      this.notify()
    })
    ws.on("error", () => { /* Close codes are asserted through `closed`. */ })
    this.closed = new Promise((resolve) => ws.once("close", (code) => {
      resolve(code)
      this.notify()
    }))
  }

  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN
  }

  /** Sends a client frame and returns the send timestamp. */
  send<T extends ClientEvent["type"]>(type: T, payload: ClientPayload<T>): number {
    const at = performance.now()
    this.ws.send(JSON.stringify({ type, payload }))
    return at
  }

  mark(): number {
    return this.events.length
  }

  received<T extends ServerEvent["type"]>(type: T, since = 0): Array<Received<EventOf<T>>> {
    return this.events.slice(since).filter((entry): entry is Received<EventOf<T>> => entry.event.type === type)
  }

  waitFor<T extends ServerEvent["type"]>(
    type: T,
    predicate: (event: EventOf<T>) => boolean = () => true,
    options: { since?: number; timeoutMs?: number } = {}
  ): Promise<Received<EventOf<T>>> {
    const since = options.since ?? 0
    return this.waitUntil(
      () => this.received(type, since).find((entry) => predicate(entry.event)),
      `${this.owner.name}: ${type}`,
      options.timeoutMs
    )
  }

  waitForCount<T extends ServerEvent["type"]>(
    type: T,
    count: number,
    predicate: (event: EventOf<T>) => boolean = () => true,
    options: { since?: number; timeoutMs?: number } = {}
  ): Promise<Array<Received<EventOf<T>>>> {
    const since = options.since ?? 0
    return this.waitUntil(() => {
      const matches = this.received(type, since).filter((entry) => predicate(entry.event))
      return matches.length >= count ? matches : undefined
    }, `${this.owner.name}: ${count} x ${type}`, options.timeoutMs)
  }

  /**
   * Round trip on this socket. Every server event goes through one ordered
   * delivery queue per connection, so an event emitted before this call
   * returned (for example by an HTTP route that already answered) has
   * arrived once the listing comes back. Used to prove an event is absent.
   */
  async barrier(): Promise<void> {
    const since = this.mark()
    this.send("chat.list_threads", {})
    await this.waitFor("chat.thread_listed", () => true, { since })
  }

  close(): Promise<number> {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.close()
    return this.closed
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }

  private waitUntil<T>(find: () => T | undefined, label: string, timeoutMs = DEFAULT_WAIT_MS): Promise<T> {
    const existing = find()
    if (existing !== undefined) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = find()
        if (found === undefined) return
        clearTimeout(timer)
        this.listeners.delete(check)
        resolve(found)
      }
      const timer = setTimeout(() => {
        this.listeners.delete(check)
        reject(new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`))
      }, timeoutMs)
      this.listeners.add(check)
    })
  }
}

export class SimUser {
  constructor(
    readonly harness: SocialLoopHarness,
    readonly name: string,
    readonly userId: string,
    public sessionToken: string,
    readonly phoneNumber: string,
    readonly clientAddress: string
  ) {}

  http(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<HttpResult> {
    return this.harness.request(method, path, { body, sessionToken: this.sessionToken, clientAddress: this.clientAddress })
  }

  /** Opens a websocket the way the app does: a one-time ticket, then the upgrade. */
  async connect(): Promise<SimSocket> {
    const issued = await this.http("POST", "/v1/auth/realtime-ticket")
    assert.equal(issued.status, 201, `${this.name} realtime ticket: ${JSON.stringify(issued.body)}`)
    const ws = new WebSocket(`${this.harness.wsUrl}/ws`, [`ticket-${issued.body.ticket as string}`], {
      headers: { "x-forwarded-for": this.clientAddress }
    })
    const socket = new SimSocket(ws, this)
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve())
      ws.once("unexpected-response", (_request, response) => reject(new Error(`Upgrade refused: ${response.statusCode}`)))
      ws.once("error", reject)
    })
    return socket
  }
}

export interface SocialLoopHarness {
  storage: SocialLoopStorage
  baseUrl: string
  wsUrl: string
  services: ConfiguredServerServices
  /** Errors the chat delivery path reported (the inline dispatch and the worker). */
  deliveryErrors: unknown[]
  request(
    method: string,
    path: string,
    options?: { body?: unknown; sessionToken?: string; clientAddress?: string }
  ): Promise<HttpResult>
  signUp(displayName: string, options?: { gender?: "woman" | "man"; clientAddress?: string }): Promise<SimUser>
  /** Mutual like over HTTP: A likes B, then B likes A. */
  matchPair(a: SimUser, b: SimUser): Promise<{ matchId: string; threadId: string }>
  /** Chat-initiated room: A invites over HTTP, B accepts over HTTP. */
  openRoom(inviter: SimUser, invitee: SimUser, threadId: string): Promise<{ inviteId: string; miniRoomId: string }>
  pendingPushes(userId?: string): Promise<PushDelivery[]>
  /** Test-only time travel: moves an invite's expiry into the past. */
  expireInvite(inviteId: string): Promise<void>
  close(): Promise<void>
}

export async function startSocialLoop(options: { storage?: SocialLoopStorage } = {}): Promise<SocialLoopHarness> {
  const storage = options.storage ?? "memory"
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (storage === "postgres") assert.ok(databaseUrl, "PostgreSQL scenarios run through the isolated postgres gate")
  const config = resolveServerConfig(storage === "postgres"
    ? {
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        BLUMI_AUTH_REPOSITORY: "postgres",
        DATABASE_URL: databaseUrl,
        BLUMI_OTP_HMAC_SECRET: process.env.BLUMI_OTP_HMAC_SECRET ?? "e2e-social-loop-otp-secret-0123456789"
      }
    : { NODE_ENV: "test", HOST: "127.0.0.1" })
  const services = withCapabilityManifest(RECEIPTS_ROLLED_OUT_MANIFEST, () => createConfiguredServerServices(config))
  const publishDiscoverProfile = storage === "memory" ? useAccountBackedDiscovery(services) : async () => {}
  const timeTravelPool = storage === "postgres" ? new Pool({ connectionString: databaseUrl, max: 2 }) : undefined

  const firebaseAuthVerifier: FirebaseAuthVerifier = {
    async verifyIdToken(idToken) {
      const phoneNumber = /^e2e-phone:(\+\d{8,15})$/.exec(idToken)?.[1]
      if (!phoneNumber) throw new Error("Unknown test identity token.")
      return { uid: `e2e_${phoneNumber.slice(1)}`, phoneNumber, authTime: Math.floor(Date.now() / 1000) }
    }
  }
  const deliveryErrors: unknown[] = []
  const connectionManager = createConnectionManager({
    fanout: services.realtimeFanout,
    reportFanoutError: (error) => deliveryErrors.push(error)
  })
  const realtimeTicketService = createRealtimeTicketService({
    authService: services.authService,
    store: services.realtimeTicketStore
  })
  const app = createServer({
    discoverySnapshots: services.discoverySnapshots,
    sharedRateLimiter: services.sharedRateLimiter,
    authService: services.authService,
    capabilityService: services.capabilityService,
    firebaseAuthVerifier,
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
    nodeEnv: "test",
    trustedProxyAddresses: TRUSTED_PROXY
  })
  const realtimeServer = createRealtimeServer({
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
    trustedProxyAddresses: TRUSTED_PROXY,
    capabilityService: services.capabilityService,
    httpServer: app.server
  })
  // Same start order as index.ts: warm the receipt schema probe, then listen.
  await services.chatReceiptSchema.isReady()
  await app.listen({ port: 0, host: "127.0.0.1" })
  const { port } = app.server.address() as AddressInfo
  await realtimeServer.listen({ port, host: "127.0.0.1" })
  const chatDeliveryWorker = startChatDeliveryWorker({
    deliveryService: createChatMessageDeliveryService({
      chatService: services.chatService,
      safetyService: services.safetyService,
      notificationService: services.notificationService,
      connectionManager,
      reportError: (error) => deliveryErrors.push(error)
    }),
    reportError: (error) => deliveryErrors.push(error)
  })

  const baseUrl = `http://127.0.0.1:${port}`
  const harness: SocialLoopHarness = {
    storage,
    baseUrl,
    wsUrl: `ws://127.0.0.1:${port}`,
    services,
    deliveryErrors,
    async request(method, path, requestOptions = {}) {
      const startedAt = performance.now()
      const headers: Record<string, string> = {
        "x-forwarded-for": requestOptions.clientAddress ?? "10.255.255.254"
      }
      if (requestOptions.body !== undefined) headers["content-type"] = "application/json"
      if (requestOptions.sessionToken) headers.authorization = `Bearer ${requestOptions.sessionToken}`
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(requestOptions.body !== undefined ? { body: JSON.stringify(requestOptions.body) } : {})
      })
      const text = await response.text()
      return {
        status: response.status,
        body: text ? JSON.parse(text) : undefined,
        startedAt,
        ms: performance.now() - startedAt
      }
    },
    async signUp(displayName, signUpOptions = {}) {
      const phoneNumber = nextPhoneNumber()
      const clientAddress = signUpOptions.clientAddress ?? nextClientAddress()
      const signedIn = await harness.request("POST", "/v1/auth/firebase/complete", {
        clientAddress,
        body: {
          idToken: `e2e-phone:${phoneNumber}`,
          authIntent: "create",
          termsAcceptance: { version: "test-terms-v1", locale: "en" }
        }
      })
      assert.equal(signedIn.status, 200, `${displayName} sign-in: ${JSON.stringify(signedIn.body)}`)
      const user = new SimUser(harness, displayName, signedIn.body.session.userId, signedIn.body.session.sessionToken,
        phoneNumber, clientAddress)
      const profile = await user.http("PATCH", "/v1/users/me", {
        displayName,
        age: 24,
        gender: signUpOptions.gender ?? "woman",
        avatarPresetId: "avatar_v2_body_default"
      })
      assert.equal(profile.status, 200, `${displayName} profile: ${JSON.stringify(profile.body)}`)
      for (const step of ["profile", "avatar", "room"] as const) {
        const onboarding = await user.http("PATCH", "/v1/users/me/onboarding", { step })
        assert.equal(onboarding.status, 200, `${displayName} onboarding ${step}: ${JSON.stringify(onboarding.body)}`)
      }
      await publishDiscoverProfile(user.userId)
      return user
    },
    async matchPair(a, b) {
      const first = await a.http("POST", `/v1/discover/${b.userId}/like`, {})
      assert.equal(first.status, 200, `like: ${JSON.stringify(first.body)}`)
      const second = await b.http("POST", `/v1/discover/${a.userId}/like`, {})
      assert.equal(second.status, 200, `like back: ${JSON.stringify(second.body)}`)
      assert.equal(second.body.matched, true)
      const matchId = second.body.match.matchId as string
      return { matchId, threadId: `thread_match_${matchId}` }
    },
    async openRoom(inviter, invitee, threadId) {
      const invite = await inviter.http("POST", `/v1/threads/${threadId}/room-invites`, {})
      assert.equal(invite.status, 201, `invite: ${JSON.stringify(invite.body)}`)
      const inviteId = invite.body.invite.inviteId as string
      const accepted = await invitee.http("POST", `/v1/room-invites/${inviteId}/decision`, { status: "accepted" })
      assert.equal(accepted.status, 200, `accept: ${JSON.stringify(accepted.body)}`)
      return { inviteId, miniRoomId: accepted.body.miniRoom.miniRoomId as string }
    },
    async pendingPushes(userId) {
      const deliveries = await services.notificationService.repository.listPendingDeliveries()
      return userId ? deliveries.filter((delivery) => delivery.userId === userId) : deliveries
    },
    async expireInvite(inviteId) {
      const past = new Date(Date.now() - 1_000).toISOString()
      if (timeTravelPool) {
        await timeTravelPool.query("UPDATE blumi_mini_room_invites SET expires_at = $2 WHERE invite_id = $1", [inviteId, past])
        return
      }
      const invite = await services.miniRoomService.repository.findInvite(inviteId)
      assert.ok(invite)
      await services.miniRoomService.repository.saveInvite({ ...invite, expiresAt: past })
    },
    async close() {
      // index.ts drain order: realtime, HTTP, workers, then data.
      await realtimeServer.close()
      await app.close()
      await chatDeliveryWorker.stop()
      await timeTravelPool?.end()
      await services.close()
    }
  }
  return harness
}

function withCapabilityManifest<T>(manifest: string, create: () => T): T {
  const previous = process.env.BLUMI_CAPABILITY_MANIFEST
  process.env.BLUMI_CAPABILITY_MANIFEST = manifest
  try {
    return create()
  } finally {
    if (previous === undefined) delete process.env.BLUMI_CAPABILITY_MANIFEST
    else process.env.BLUMI_CAPABILITY_MANIFEST = previous
  }
}

/**
 * Replaces the in-memory match service with one whose Discover store the
 * harness fills from onboarded accounts, mapped like the PostgreSQL rows.
 */
function useAccountBackedDiscovery(services: ConfiguredServerServices): (userId: string) => Promise<void> {
  const store = createInMemoryMatchStore([])
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(store),
    economyService: services.economyService,
    notificationService: services.notificationService
  })
  services.matchService = matchService
  services.discoverySnapshots = createDiscoverySnapshotService(
    createInMemoryDiscoverySnapshots((userId, filters) => matchService.listDiscovery(userId, filters))
  )
  return async (userId) => {
    const account = await services.authService.repository.findAccountByUserId(userId)
    assert.ok(account, "onboarded account")
    const avatar = normalizeStoredAvatarSelection({
      presetId: account.profile.avatar.presetId,
      loadout: account.profile.avatar.loadout,
      revision: account.profile.avatar.revision
    })
    store.discoverProfiles.set(userId, {
      userId,
      displayName: account.profile.displayName,
      age: account.profile.age ?? 0,
      gender: account.profile.identityGender ?? account.profile.gender,
      distanceLabel: "Vibe match",
      vibeTags: [...(account.profile.interests ?? [])],
      avatar,
      avatarPresetId: avatar.presetId,
      updatedAt: new Date().toISOString()
    })
  }
}

/** Runs `task` over `items` with at most `limit` in flight, keeping input order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await task(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

export function percentile(values: readonly number[], fraction: number): number {
  assert.ok(values.length > 0, "percentile of an empty sample")
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]!
}

/** Every user id an event names, for cross-pair leakage checks. */
export function userIdsIn(event: ServerEvent): Set<string> {
  const found = new Set<string>()
  const visit = (value: unknown, key?: string) => {
    if (typeof value === "string") {
      if (key && /userid/i.test(key)) found.add(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key)
      return
    }
    if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey)
    }
  }
  visit(event.payload)
  return found
}
