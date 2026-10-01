import assert from "node:assert/strict"
import test from "node:test"
import { createAdminTokenService, mintAdminToken } from "../admin/adminTokenService"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"
import { createInMemoryAuthRepository } from "./authRepository"
import { createAuthService } from "./authService"
import { SESSION_REFRESH_REUSE_GRACE_MS, createBlumiBackendStore } from "./authStore"
import {
  createFirebaseAuthVerifier,
  type FirebaseAdminAuthClient,
  type FirebaseAuthVerifier
} from "./firebaseAuth"
import { createFirebaseSessionRevoker } from "./firebaseSessionRevocation"

const TERMS = { version: "test-terms-v1", locale: "en" as const }
const T0 = new Date("2026-10-01T10:00:00.000Z")

test("the Firebase verifier always checks revocation and exposes refresh-token revocation", async () => {
  const verifyCalls: Array<[string, boolean | undefined]> = []
  const revoked: string[] = []
  const verifier = createFirebaseAuthVerifier({
    authClient: {
      async verifyIdToken(idToken: string, checkRevoked?: boolean) {
        verifyCalls.push([idToken, checkRevoked])
        return { uid: "uid_1", phone_number: "+15550000001", auth_time: 1_700_000_000 }
      },
      async revokeRefreshTokens(uid: string) { revoked.push(uid) },
      async deleteUser() {}
    } as unknown as FirebaseAdminAuthClient
  })
  const identity = await verifier.verifyIdToken("id-token")
  assert.deepEqual(identity, { uid: "uid_1", phoneNumber: "+15550000001", authTime: 1_700_000_000 })
  assert.deepEqual(verifyCalls, [["id-token", true]], "revoked or disabled users must be rejected")
  await verifier.revokeRefreshTokens?.("uid_1")
  assert.deepEqual(revoked, ["uid_1"])
})

test("the revoker revokes only a bound uid and never throws or logs identifiers", async () => {
  const revoked: string[] = []
  const reported: unknown[][] = []
  const bindings = new Map([["user_bound", "uid_bound"], ["user_failing", "uid_failing"]])
  const revoker = createFirebaseSessionRevoker({
    findFirebaseUid: async (userId) => bindings.get(userId) ?? null,
    revokeRefreshTokens: async (uid) => {
      if (uid === "uid_failing") throw Object.assign(new Error("uid_failing exploded"), { code: "auth/internal-error" })
      revoked.push(uid)
    },
    reportError: (...args) => { reported.push(args) }
  })
  assert.equal(await revoker.revokeForUser("user_bound", "session_reuse"), "revoked")
  assert.equal(await revoker.revokeForUser("user_unbound", "session_reuse"), "unbound")
  assert.equal(await revoker.revokeForUser("user_failing", "moderation_ban"), "failed")
  assert.deepEqual(revoked, ["uid_bound"])
  assert.equal(reported.length, 1)
  const logged = JSON.stringify(reported)
  assert.equal(logged.includes("uid_failing"), false)
  assert.equal(logged.includes("user_failing"), false)
})

test("refresh reuse revokes the bound Firebase user's refresh tokens", async () => {
  const revoked: string[] = []
  const repository = createInMemoryAuthRepository(createBlumiBackendStore())
  const authService = createAuthService({ repository })
  const app = createServer({ authService, firebaseAuthVerifier: recordingVerifier(revoked) })
  try {
    const signed = await authService.signInWithVerifiedPhone(
      "+15550000002", { acceptedTerms: TERMS, firebaseUid: "uid_reuse" }, T0
    )
    const rotated = await authService.refreshSession(signed.sessionToken, T0)
    assert.ok(rotated)
    // A grace-window retry is not reuse and must keep Firebase untouched.
    assert.ok(await authService.refreshSession(signed.sessionToken, new Date(T0.getTime() + 1_000)))
    await flush()
    assert.deepEqual(revoked, [])
    const reused = await authService.refreshSession(
      signed.sessionToken,
      new Date(T0.getTime() + SESSION_REFRESH_REUSE_GRACE_MS + 1)
    )
    assert.equal(reused, null)
    await flush()
    assert.deepEqual(revoked, ["uid_reuse"])
  } finally {
    await app.close()
  }
})

test("an admin ban revokes the reported user's Firebase refresh tokens; a warning does not", async () => {
  const revoked: string[] = []
  const repository = createInMemoryAuthRepository(createBlumiBackendStore())
  const authService = createAuthService({ repository })
  const signingKey = { keyId: "active", secret: Buffer.alloc(32, 7) }
  const adminTokenService = createAdminTokenService({ keys: [signingKey] })
  let reportSequence = 0
  const safetyService = createSafetyService({ idFactory: () => `report_${++reportSequence}` })
  const app = createServer({
    authService,
    safetyService,
    adminTokenService,
    firebaseAuthVerifier: recordingVerifier(revoked)
  })
  try {
    const reported = await authService.signInWithVerifiedPhone(
      "+15550000003", { acceptedTerms: TERMS, firebaseUid: "uid_banned" }, T0
    )
    await safetyService.reportUser("reporter_a", { reportedUserId: reported.account.userId, reason: "spam" }, T0)
    await safetyService.reportUser("reporter_b", { reportedUserId: reported.account.userId, reason: "harassment" }, T0)
    const token = mintAdminToken({
      key: signingKey, operatorId: "moderator", tokenId: "token", scopes: ["reports:resolve"], ttlSeconds: 600
    })
    const warned = await app.inject({
      method: "POST",
      url: "/v1/admin/reports/report_1/resolve",
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "warn" }
    })
    assert.equal(warned.statusCode, 200)
    await flush()
    assert.deepEqual(revoked, [])
    const banned = await app.inject({
      method: "POST",
      url: "/v1/admin/reports/report_2/resolve",
      headers: { authorization: `Bearer ${token}` },
      payload: { action: "ban" }
    })
    assert.equal(banned.statusCode, 200)
    await flush()
    assert.deepEqual(revoked, ["uid_banned"])
  } finally {
    await app.close()
  }
})

function recordingVerifier(revoked: string[]): FirebaseAuthVerifier {
  return {
    async verifyIdToken() { throw new Error("not used") },
    async revokeRefreshTokens(uid) { revoked.push(uid) }
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
