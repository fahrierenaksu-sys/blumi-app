import { requestJson } from "../network/apiClient"
import type { RegisterAccountInput } from "./sessionApi"
import {
  normalizeOnboardingStatus,
  normalizeSessionActor,
  type SessionActor
} from "./sessionModel"

/**
 * Simulator QA against the local in-memory API. A dev build with
 * EXPO_PUBLIC_BLUMI_LOCAL_QA_AUTH=1 that talks to a loopback API sends the
 * phone code through the server instead of Firebase, so a QA agent can sign in
 * as the API's fixed test numbers. Release builds refuse the flag
 * (scripts/mobile-release-config.cjs) and the API only answers when it runs
 * in-memory on loopback (apps/server/src/config.ts).
 */
export function isLocalQaPhoneAuthAllowed(input: {
  isDevBuild: boolean
  flag: string | undefined
  apiBaseUrl: string
}): boolean {
  if (!input.isDevBuild || input.flag?.trim() !== "1") return false
  try {
    const { hostname } = new URL(input.apiBaseUrl)
    return LOOPBACK_HOSTS.has(hostname)
  } catch {
    return false
  }
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"])

const GENERIC_FAILURE = "Local QA sign-in failed. Is the in-memory API running with QA auth?"

export async function requestLocalQaPhoneCode(
  baseHttpUrl: string,
  phoneNumber: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const { response, payload } = await requestJson(baseHttpUrl, "/v1/auth/send-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phoneNumber })
  }, fetcher)
  if (!response.ok) throw new Error(readServerError(payload))
}

export async function completeLocalQaPhoneSignIn(
  baseHttpUrl: string,
  input: RegisterAccountInput,
  fetcher: typeof fetch = fetch
): Promise<SessionActor> {
  const isCreate = input.authIntent === "create"
  const body = isCreate
    ? { phoneNumber: input.phoneNumber, verificationCode: input.verificationCode, termsAcceptance: input.termsAcceptance }
    : { phoneNumber: input.phoneNumber, verificationCode: input.verificationCode }
  const { response, payload } = await requestJson(
    baseHttpUrl,
    isCreate ? "/v1/accounts/register" : "/v1/auth/verify",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    },
    fetcher
  )
  if (!response.ok) throw new Error(readServerError(payload))

  const actor = normalizeSessionActor(payload, {
    requireExplicitIdentity: true,
    requiredMode: "production"
  })
  const onboarding = normalizeOnboardingStatus(
    (payload as { session?: { onboarding?: unknown } } | null)?.session?.onboarding
  )
  if (!actor || actor.session.mode !== "production" || !onboarding) {
    throw new Error(GENERIC_FAILURE)
  }
  return actor
}

function readServerError(payload: unknown): string {
  const message = (payload as { error?: unknown } | null)?.error
  return typeof message === "string" && message.length > 0 ? message : GENERIC_FAILURE
}

export interface LocalQaCredentials {
  phoneNumber: string
  verificationCode: string
}

const QA_SIGN_IN_PATTERN = /^blumi:\/\/qa-sign-in\?slot=([1-9])$/
const E164_PATTERN = /^\+[1-9]\d{7,14}$/
const CODE_PATTERN = /^\d{6}$/

export function parseLocalQaSignInSlot(url: string): number | null {
  const match = QA_SIGN_IN_PATTERN.exec(url.trim())
  return match ? Number(match[1]) : null
}

export function resolveLocalQaCredentials(
  slot: number,
  phoneList: string | undefined,
  code: string | undefined
): LocalQaCredentials | null {
  const phoneNumber = phoneList?.split(",").map((value) => value.trim())[slot - 1]
  const verificationCode = code?.trim()
  if (!phoneNumber || !E164_PATTERN.test(phoneNumber)) return null
  if (!verificationCode || !CODE_PATTERN.test(verificationCode)) return null
  return { phoneNumber, verificationCode }
}
