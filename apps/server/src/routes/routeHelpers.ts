import type { FastifyReply, FastifyRequest } from "fastify"
import type { AuthService } from "../auth/authService"
import {
  accountModeration,
  isAccountModerationRestricted,
  isProductEligibleAccount
} from "../auth/authStore"
import { normalizePhoneNumber, normalizeVerificationCode } from "../auth/phone"

type ResolvedRequestSession = Awaited<ReturnType<AuthService["getSession"]>>
const requestSessions = new WeakMap<FastifyRequest, { sessionToken: string; resolved: Promise<ResolvedRequestSession> }>()

/**
 * Resolves a request's bearer session once (2026-10-01). The shared request
 * budget hook and the route handler each looked it up, two queries every
 * time, on every authenticated request. Both now share one lookup made
 * moments apart within the same request; nothing outlives the request.
 */
export function resolveRequestSession(
  request: FastifyRequest,
  authService: AuthService,
  sessionToken: string
): Promise<ResolvedRequestSession> {
  const memo = requestSessions.get(request)
  if (memo?.sessionToken === sessionToken) return memo.resolved
  const resolved = authService.getSession(sessionToken)
  requestSessions.set(request, { sessionToken, resolved })
  return resolved
}

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

  const resolved = await resolveRequestSession(request, authService, sessionToken)
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

/**
 * True when Fastify's JSON Schema validation failed for a route that declares
 * `config.requestValidation: "enforced"` (with `attachValidation: true`).
 *
 * Handlers call this where they already reject malformed input, after
 * authentication and availability checks, so each route keeps its existing
 * status code, error body, and auth-first ordering. Validator details are
 * never sent to the client. Advisory routes always get `false`.
 *
 * Pass `part` when a route answers differently per request part (Fastify
 * reports the first failing part: params, body, querystring, then headers).
 */
export function schemaValidationFailed(
  request: FastifyRequest,
  part?: "body" | "querystring" | "params" | "headers"
): boolean {
  const error = request.validationError
  if (error === undefined || error === null) return false
  if (request.routeOptions.config.requestValidation !== "enforced") return false
  return part === undefined || error.validationContext === part
}

/**
 * Registration guard: a route that defers schema errors to its handler must
 * say whether that handler enforces them, and an enforced route must defer.
 */
export function assertRequestValidationPolicy(route: {
  method: string | string[]
  url: string
  attachValidation?: boolean
  config?: { requestValidation?: string }
}): void {
  const policy = route.config?.requestValidation
  if (route.attachValidation && policy !== "enforced" && policy !== "advisory") {
    throw new Error(
      `Route ${String(route.method)} ${route.url} sets attachValidation without config.requestValidation.`
    )
  }
  if (!route.attachValidation && policy !== undefined) {
    throw new Error(
      `Route ${String(route.method)} ${route.url} declares requestValidation without attachValidation.`
    )
  }
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
