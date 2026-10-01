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
}

export function createFirebaseAuthVerifier(
  options: FirebaseAuthVerifierOptions = {}
): FirebaseAuthVerifier & {
  deleteUser(uid: string): Promise<void>
  revokeRefreshTokens(uid: string): Promise<void>
} {
  let authClient: FirebaseAdminAuthClient | undefined = options.authClient

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
      const decoded = await getAuthClient().verifyIdToken(idToken, true)
      if (
        typeof decoded.uid !== "string" ||
        typeof decoded.phone_number !== "string" ||
        typeof decoded.auth_time !== "number"
      ) {
        throw new Error("Firebase token is not a verified phone identity.")
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
