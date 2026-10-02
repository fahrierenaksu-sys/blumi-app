import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App
} from "firebase-admin/app"
import { getAuth, type Auth } from "firebase-admin/auth"

export interface FirebasePhoneIdentity {
  uid: string
  phoneNumber: string
  authTime: number
}

export interface FirebaseAuthVerifier {
  /** Rejects revoked, disabled or deleted Firebase users (`checkRevoked`). */
  verifyIdToken(idToken: string): Promise<FirebasePhoneIdentity>
  /**
   * Invalidates every Firebase refresh token of the user, so the client SDK
   * can no longer mint ID tokens silently; ID tokens already minted fail the
   * revocation check in `verifyIdToken`. A new SMS verification is required.
   */
  revokeRefreshTokens?(uid: string): Promise<void>
}

/** The firebase-admin calls Blumi uses; injectable for tests. */
export type FirebaseAdminAuthClient = Pick<Auth, "verifyIdToken" | "revokeRefreshTokens" | "deleteUser">

export interface FirebaseAuthVerifierOptions {
  projectId?: string
  serviceAccountJson?: string
  serviceAccountJsonBase64?: string
  authClient?: FirebaseAdminAuthClient
  /**
   * Production: refuse to start without a credential (a service account, or
   * GOOGLE_APPLICATION_CREDENTIALS for the default credential). A given
   * service account is always parsed at construction, so a bad value fails
   * at startup instead of turning every sign-in into an error.
   */
  requireCredential?: boolean
  applicationDefaultCredentialsPath?: string
}

/**
 * A failure of the identity provider or of this server's credential, not of
 * the caller's token: answered 503 so it is retried later and never counted
 * as a failed sign-in.
 */
export class FirebaseVerifierUnavailableError extends Error {
  constructor() {
    super("Phone verification is temporarily unavailable.")
    this.name = "FirebaseVerifierUnavailableError"
  }
}

/** firebase-admin codes that mean "this server or Firebase failed", not "bad token". */
const PROVIDER_FAILURE_CODES = new Set([
  "auth/internal-error", "auth/insufficient-permission", "auth/invalid-credential",
  "auth/project-not-found", "auth/quota-exceeded", "app/invalid-credential",
  "app/network-error", "app/network-timeout", "app/internal-error"
])

/** Whether a verifyIdToken failure is the token's fault (401) rather than the provider's (503). */
export function isFirebaseTokenRejection(error: unknown): boolean {
  if (error instanceof FirebaseVerifierUnavailableError) return false
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined
  if (typeof code === "string") return code.startsWith("auth/") && !PROVIDER_FAILURE_CODES.has(code)
  return error instanceof FirebaseIdentityShapeError
}

class FirebaseIdentityShapeError extends Error {}

export function createFirebaseAuthVerifier(
  options: FirebaseAuthVerifierOptions = {}
): FirebaseAuthVerifier & {
  deleteUser(uid: string): Promise<void>
  revokeRefreshTokens(uid: string): Promise<void>
} {
  let authClient: FirebaseAdminAuthClient | undefined = options.authClient
  if (!authClient) {
    // Fail fast on a malformed service account (throws), and in production
    // on a missing credential.
    const serviceAccount = readServiceAccount(options)
    if (!serviceAccount && options.requireCredential && !options.applicationDefaultCredentialsPath?.trim()) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON (or _BASE64) is required in production.")
    }
  }

  function getAuthClient(): FirebaseAdminAuthClient {
    if (authClient) return authClient
    const app = getFirebaseApp(options)
    authClient = getAuth(app)
    return authClient
  }

  return {
    async deleteUser(uid) {
      await getAuthClient().deleteUser(uid)
    },
    async revokeRefreshTokens(uid) {
      await getAuthClient().revokeRefreshTokens(uid)
    },
    async verifyIdToken(idToken) {
      // checkRevoked: tokens minted before revokeRefreshTokens (auth_time
      // older than tokensValidAfterTime) and disabled users are rejected.
      let client: FirebaseAdminAuthClient
      try {
        client = getAuthClient()
      } catch {
        throw new FirebaseVerifierUnavailableError()
      }
      const decoded = await client.verifyIdToken(idToken, true)
      if (
        typeof decoded.uid !== "string" ||
        typeof decoded.phone_number !== "string" ||
        typeof decoded.auth_time !== "number"
      ) {
        throw new FirebaseIdentityShapeError("Firebase token is not a verified phone identity.")
      }
      return {
        uid: decoded.uid,
        phoneNumber: decoded.phone_number,
        authTime: decoded.auth_time
      }
    }
  }
}

function getFirebaseApp(options: FirebaseAuthVerifierOptions): App {
  const existing = getApps()[0]
  if (existing) return existing

  const serviceAccount = readServiceAccount(options)
  return initializeApp({
    projectId: options.projectId,
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault()
  })
}

function readServiceAccount(options: FirebaseAuthVerifierOptions): Record<string, string> | null {
  const raw = options.serviceAccountJsonBase64
    ? Buffer.from(options.serviceAccountJsonBase64, "base64").toString("utf8")
    : options.serviceAccountJson
  if (!raw?.trim()) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.")
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain a service account object.")
  }
  const record = parsed as Record<string, unknown>
  if (
    typeof record.project_id !== "string" ||
    typeof record.client_email !== "string" ||
    typeof record.private_key !== "string"
  ) {
    throw new Error("Firebase service account JSON is missing required fields.")
  }
  return {
    projectId: record.project_id,
    clientEmail: record.client_email,
    privateKey: record.private_key
  }
}
