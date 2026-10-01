import type { FastifyReply, FastifyRequest } from "fastify"
import type { AuthService } from "../auth/authService"
import {
  accountModeration,
  isAccountModerationRestricted,
  isProductEligibleAccount
} from "../auth/authStore"
import { normalizePhoneNumber, normalizeVerificationCode } from "../auth/phone"

type ResolvedSession = Awaited<ReturnType<AuthService["getSession"]>>

/**
 * A session the request-wide budget hook already read, handed to the route's
 * own resolution once: the same token on the same request is not read from
 * the database twice. A later resolution in the same handler reads again.
 */
const preResolvedSessions = new WeakMap<FastifyRequest, {
  authService: AuthService
  sessionToken: string
  resolved: ResolvedSession
}>()

/** Reads the bearer session for a pre-handler and keeps it for the route. */
export async function preResolveBearerSession(
  request: FastifyRequest,
  authService: AuthService
): Promise<ResolvedSession> {
  const sessionToken = readBearerToken(request)
  if (!sessionToken) return null
  const resolved = await authService.getSession(sessionToken)
  preResolvedSessions.set(request, { authService, sessionToken, resolved })
  return resolved
}

function takePreResolvedSession(
  request: FastifyRequest,
  authService: AuthService,
  sessionToken: string
): { resolved: ResolvedSession } | null {
  const entry = preResolvedSessions.get(request)
  if (!entry) return null
  preResolvedSessions.delete(request)
  return entry.authService === authService && entry.sessionToken === sessionToken
    ? { resolved: entry.resolved }
    : null
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

  const preResolved = takePreResolvedSession(request, authService, sessionToken)
  const resolved = preResolved
    ? preResolved.resolved
    : await authService.getSession(sessionToken)
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
