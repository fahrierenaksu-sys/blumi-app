import type { FastifyReply, FastifyRequest } from "fastify"
import type { AuthService } from "../auth/authService"
import {
  accountModeration,
  isAccountModerationRestricted,
  isProductEligibleAccount
} from "../auth/authStore"
import { normalizePhoneNumber, normalizeVerificationCode } from "../auth/phone"

export async function resolveBearerSession({
  request,
  reply,
  authService
}: {
  request: FastifyRequest
  reply: FastifyReply
  authService: AuthService
}) {
  const sessionToken = readBearerToken(request)
  if (!sessionToken) {
    reply.code(401).send({ error: "Sign in again to continue." })
    return null
  }

  const resolved = await authService.getSession(sessionToken)
  if (!resolved) {
    reply.code(401).send({ error: "Sign in again to continue." })
    return null
  }

  if (isAccountModerationRestricted(resolved.account)) {
    const moderation = accountModeration(resolved.account)
    reply.code(403).send({
      code: moderation.status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED",
      status: moderation.status,
      error: "Your account is currently restricted."
    })
    return null
  }

  return resolved
}

export async function resolveProductSession(input: {
  request: FastifyRequest
  reply: FastifyReply
  authService: AuthService
}) {
  const resolved = await resolveBearerSession(input)
  if (!resolved) return null
  if (!isProductEligibleAccount(resolved.account)) {
    input.reply.code(403).send({
      code: "ONBOARDING_REQUIRED",
      error: "Finish your Blumi setup before continuing."
    })
    return null
  }
  return resolved
}

export function readPhoneNumber(body: unknown) {
  return normalizePhoneNumber(isRecord(body) ? body.phoneNumber : undefined)
}

export function readVerificationCode(body: unknown) {
  return normalizeVerificationCode(
    isRecord(body) ? body.verificationCode : undefined
  )
}

export function readBearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith("Bearer ")) return null
  const token = authorization.slice("Bearer ".length).trim()
  return token.length > 0 ? token : null
}

export function readParam(request: FastifyRequest, key: string): string {
  const params = isRecord(request.params) ? request.params : {}
  return typeof params[key] === "string" ? params[key].trim() : ""
}

export function readLimit(value: unknown): number | undefined {
  if (typeof value === "number") return value
  if (typeof value !== "string") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function readLocationNumber(
  body: Record<string, unknown>,
  key: "lat" | "lng"
): number | undefined {
  const flatKey = key === "lat" ? "locationLat" : "locationLng"
  if (typeof body[flatKey] === "number") return body[flatKey]
  const location = isRecord(body.location) ? body.location : null
  return typeof location?.[key] === "number" ? location[key] : undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
