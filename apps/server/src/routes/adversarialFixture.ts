// Test support for the adversarial route suites (audit domain C). Builds one
// fully wired in-memory server with synthetic accounts and a stubbed Firebase
// verifier; nothing here contacts an external service.
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify"
import { mintAdminToken, createAdminTokenService, type AdminScope, type AdminSigningKey } from "../admin/adminTokenService"
import { createAuthService, type AuthService } from "../auth/authService"
import type { FirebaseAuthVerifier } from "../auth/firebaseAuth"
import { createChatService } from "../chat/chatService"
import { createConnectionService } from "../connections/connectionService"
import { createInMemoryMatchRepository, createInMemoryMatchStore } from "../matches/matchRepository"
import { createMatchService } from "../matches/matchService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createNotificationService } from "../notifications/notificationService"
import type { SharedRateBudget } from "../operations/sharedRateBudget"
import { createPresenceService } from "../presence/presenceService"
import { createConnectionManager } from "../realtime/connectionManager"
import { createRealtimeTicketService } from "../realtime/realtimeTicketService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"

export const ADMIN_KEY: AdminSigningKey = { keyId: "adversarial-k1", secret: Buffer.alloc(32, 7) }
export const FOREIGN_ADMIN_KEY: AdminSigningKey = { keyId: "adversarial-k2", secret: Buffer.alloc(32, 9) }
const TERMS = { version: "test-terms-v1", locale: "en" as const }

// Rate limiting is covered by its own suites; the sweeps must reach handlers.
const unlimitedBudget: SharedRateBudget = {
  async consumeUser() { return { allowed: true, retryAfterSeconds: 0 } },
  async purgeExpired() {}
}

/** Firebase id tokens are `fb|<uid>|<phone>|<authTimeSeconds>`; anything else is rejected. */
export function firebaseIdToken(uid: string, phoneNumber: string, authTime = Math.ceil(Date.now() / 1000) + 1): string {
  return `fb|${uid}|${phoneNumber}|${authTime}`
}

const stubFirebaseVerifier: FirebaseAuthVerifier = {
  async verifyIdToken(idToken) {
    const [prefix, uid, phoneNumber, authTime] = idToken.split("|")
    if (prefix !== "fb" || !uid || !phoneNumber || !authTime) throw new Error("invalid id token")
    return { uid, phoneNumber, authTime: Number(authTime) }
  }
}

export interface SyntheticAccount {
  userId: string
  accountId: string
  phoneNumber: string
  firebaseUid: string
  sessionToken: string
  sessionId: string
}

let addressCounter = 0
function nextAddress(): string {
  addressCounter += 1
  return `10.${(addressCounter >> 16) & 255}.${(addressCounter >> 8) & 255}.${addressCounter & 255}`
}

export function createAdversarialServer() {
  const authService = createAuthService()
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const matchService = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([]))
  })
  const notificationService = createNotificationService({ pushProvider: { async sendPush() {} } })
  let roomIndex = 0
  const miniRoomService = createMiniRoomService({
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService(),
    idFactory: () => `adv_${++roomIndex}`
  })
  const connectionService = createConnectionService({ miniRoomService, safetyService })
  const connectionManager = createConnectionManager()
  const realtimeTicketService = createRealtimeTicketService({ authService })
  const adminTokenService = createAdminTokenService({ keys: [ADMIN_KEY] })
  const app = createServer({
    authService,
    chatService,
    safetyService,
    matchService,
    notificationService,
    miniRoomService,
    connectionService,
    connectionManager,
    realtimeTicketService,
    adminTokenService,
    firebaseAuthVerifier: stubFirebaseVerifier,
    sharedRateLimiter: unlimitedBudget,
    // Store verification is never reached for real; every transaction stays pending.
    revenueCatPurchaseVerifier: {
      async verifyTransactions({ transactionIds }) {
        return transactionIds.map((transactionId) => ({ transactionId, kind: "pending" as const }))
      }
    },
    legalPagesEnabled: true,
    appLinks: { appleAppId: "TEAM.app.blumi", androidPackageName: "app.blumi", androidSha256CertFingerprints: [] }
  })
  const routes: string[] = []
  app.addHook("onRoute", (route) => {
    for (const method of [route.method].flat()) {
      if (method === "HEAD" || method === "OPTIONS") continue
      routes.push(`${method} ${route.url}`)
    }
  })

  let phoneCounter = 0
  async function createAccount(label: string, options: { eligible?: boolean } = {}): Promise<SyntheticAccount> {
    phoneCounter += 1
    const phoneNumber = `+1557${String(1_000_000 + phoneCounter * 7919 + (Date.now() % 1000)).slice(-7)}`
    const firebaseUid = `uid_${label}_${phoneCounter}`
    const signed = await authService.signInWithVerifiedPhone(phoneNumber, { acceptedTerms: TERMS, firebaseUid })
    if (options.eligible !== false) {
      await authService.updateProfile(signed.sessionToken, {
        displayName: label.slice(0, 20).padEnd(2, "x"),
        age: 25,
        gender: "woman",
        avatarPresetId: "avatar_v2_body_default"
      })
      for (const step of ["profile", "avatar", "room"] as const) {
        await authService.completeOnboardingStep(signed.sessionToken, step)
      }
    }
    return {
      userId: signed.account.userId,
      accountId: signed.account.accountId,
      phoneNumber,
      firebaseUid,
      sessionToken: signed.sessionToken,
      sessionId: signed.session.sessionId
    }
  }

  async function call(
    method: InjectOptions["method"],
    url: string,
    options: { token?: string; payload?: unknown; headers?: Record<string, string> } = {}
  ): Promise<LightMyRequestResponse> {
    return app.inject({
      method,
      url,
      remoteAddress: nextAddress(),
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers ?? {})
      },
      ...(options.payload !== undefined ? { payload: options.payload as InjectOptions["payload"] } : {})
    })
  }

  async function matchAndThread(left: SyntheticAccount, right: SyntheticAccount, matchId: string): Promise<string> {
    await matchService.repository.createMatch({
      matchId,
      participantUserIds: [left.userId, right.userId],
      matchedAt: "2026-09-30T10:00:00.000Z"
    })
    const threadId = `thread_match_${matchId}`
    await chatService.createThread({
      threadId,
      miniRoomId: `match_${matchId}`,
      participantUserIds: [left.userId, right.userId],
      participants: [
        { userId: left.userId, displayName: "Left" },
        { userId: right.userId, displayName: "Right" }
      ]
    })
    return threadId
  }

  async function banAccount(account: SyntheticAccount): Promise<void> {
    const record = await authService.repository.findAccountById(account.accountId)
    if (!record) throw new Error("missing account")
    await authService.repository.saveAccount({
      ...record,
      moderation: { status: "banned", updatedAt: new Date().toISOString() }
    })
  }

  /** Full Firebase re-auth plus DELETE /v1/account over HTTP. */
  async function deleteAccountOverHttp(account: SyntheticAccount): Promise<LightMyRequestResponse> {
    const challenge = await call("POST", "/v1/account/firebase/challenge", {
      token: account.sessionToken,
      payload: { purpose: "account_deletion" }
    })
    if (challenge.statusCode !== 200) return challenge
    const reauth = await call("POST", "/v1/account/firebase/reauth", {
      token: account.sessionToken,
      payload: {
        idToken: firebaseIdToken(account.firebaseUid, account.phoneNumber),
        purpose: "account_deletion",
        challengeId: challenge.json().challengeId
      }
    })
    if (reauth.statusCode !== 200) return reauth
    return call("DELETE", "/v1/account", {
      token: account.sessionToken,
      payload: { confirmationToken: reauth.json().confirmationToken }
    })
  }

  return {
    app,
    routes,
    authService: authService as AuthService,
    chatService,
    safetyService,
    matchService,
    notificationService,
    miniRoomService,
    connectionService,
    realtimeTicketService,
    createAccount,
    call,
    matchAndThread,
    banAccount,
    deleteAccountOverHttp
  }
}

export type AdversarialServer = ReturnType<typeof createAdversarialServer>

export function adminToken(options: {
  scopes: readonly AdminScope[]
  key?: AdminSigningKey
  now?: Date
  ttlSeconds?: number
}): string {
  return mintAdminToken({
    key: options.key ?? ADMIN_KEY,
    operatorId: "operator.adversarial",
    tokenId: `tok_${Math.random().toString(36).slice(2, 10)}`,
    scopes: options.scopes,
    now: options.now,
    ttlSeconds: options.ttlSeconds ?? 300
  })
}

/** Replaces each `:param` in a route pattern with the given id (or a synthetic one). */
export function fillRoute(pattern: string, ids: Record<string, string> = {}): string {
  return pattern.replace(/:([A-Za-z]+)/g, (_match, name: string) => encodeURIComponent(ids[name] ?? `adv_${name}_1`))
}

export function isServerError(statusCode: number): boolean {
  return statusCode >= 500
}

export type { FastifyInstance }
