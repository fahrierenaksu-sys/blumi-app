import type { AfterResponseTasks } from "../operations/afterResponseTasks"
import type { FirebaseAuthVerifier } from "./firebaseAuth"

/**
 * Revokes a Blumi user's Firebase refresh tokens after a security event.
 *
 * A Blumi session can be revoked server-side, but the Firebase client SDK on
 * the same device keeps a refresh token and can mint a fresh ID token without
 * an SMS, which `/v1/auth/firebase/complete` would turn into a new session.
 * After refresh-token reuse (a stolen Blumi token) or a ban, the bound Firebase
 * user's refresh tokens are revoked as well; `verifyIdToken` checks revocation,
 * so only a new SMS verification signs the member in again.
 *
 * Best effort and post-commit: the Blumi revocation has already happened and
 * must not fail because Firebase is unreachable. Nothing identifying is logged.
 */
export type FirebaseSessionRevocationReason = "session_reuse" | "moderation_ban"

export type FirebaseSessionRevocationOutcome = "revoked" | "unbound" | "failed"

export interface FirebaseSessionRevoker {
  revokeForUser(
    userId: string,
    reason: FirebaseSessionRevocationReason
  ): Promise<FirebaseSessionRevocationOutcome>
}

export function createFirebaseSessionRevoker(input: {
  findFirebaseUid(userId: string): Promise<string | null>
  revokeRefreshTokens(uid: string): Promise<void>
  reportError?(message: string, details: { reason: FirebaseSessionRevocationReason; errorCode: string }): void
}): FirebaseSessionRevoker {
  const reportError = input.reportError ?? ((message, details) => console.error(message, details))
  return {
    async revokeForUser(userId, reason) {
      try {
        const uid = await input.findFirebaseUid(userId)
        if (!uid) return "unbound"
        await input.revokeRefreshTokens(uid)
        return "revoked"
      } catch (error) {
        reportError("Firebase refresh-token revocation failed", { reason, errorCode: safeErrorCode(error) })
        return "failed"
      }
    }
  }
}

/**
 * Server wiring: a fire-and-forget revocation run as an after-response task
 * (drained on shutdown), or undefined when no Firebase verifier can revoke.
 */
export function createFirebaseSessionRevocationHook(
  authService: { repository: { findFirebaseUidByUserId(userId: string): Promise<string | null> } },
  verifier: FirebaseAuthVerifier | undefined,
  tasks: Pick<AfterResponseTasks, "run">
): ((userId: string, reason: FirebaseSessionRevocationReason) => void) | undefined {
  const revokeRefreshTokens = verifier?.revokeRefreshTokens?.bind(verifier)
  if (!revokeRefreshTokens) return undefined
  const revoker = createFirebaseSessionRevoker({
    findFirebaseUid: (userId) => authService.repository.findFirebaseUidByUserId(userId),
    revokeRefreshTokens
  })
  return (userId, reason) => {
    tasks.run("firebase-session-revocation", () => revoker.revokeForUser(userId, reason))
  }
}

function safeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === "string" && /^[a-z0-9/_-]{1,64}$/i.test(code) ? code : "unknown"
}
