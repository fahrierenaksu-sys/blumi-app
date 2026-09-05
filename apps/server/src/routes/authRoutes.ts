import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  authenticatedErrorResponses,
  coreApiJsonSchemas,
  noContentResponseJsonSchema,
  successResponseJsonSchema
} from "@blumi/contracts"
import { isAuthError } from "../auth/authErrors"
import { toSessionActor, type AuthService } from "../auth/authService"
import { readBearerToken } from "./routeHelpers"
import {
  parseAuthPhoneRequest,
  parseAuthVerificationRequest,
  parseRegisterAccountRequest
} from "./authRequestSchemas"

export interface AuthRouteServices {
  authService: AuthService
}

const sendCodeResponses = {
  202: successResponseJsonSchema,
  ...authenticatedErrorResponses
}

const verificationResponses = {
  200: successResponseJsonSchema,
  ...authenticatedErrorResponses
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  services: AuthRouteServices
): Promise<void> {
  const { authService } = services

  app.post(
    "/v1/auth/send-code",
    {
      attachValidation: true,
      config: { apiAuth: "public", rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: coreApiJsonSchemas.authPhone,
        response: sendCodeResponses
      }
    },
    async (request, reply) => {
      const parsed = parseAuthPhoneRequest(request.body)
      if (!parsed) {
        return reply.code(400).send({
          error: "Enter a valid phone number with country code."
        })
      }

      try {
        const result = await authService.sendCode(parsed.phoneNumber)
        return reply.code(202).send({
          ok: true,
          expiresAt: result.expiresAt
        })
      } catch (error) {
        if (!isAuthError(error)) throw error
        if (error.retryAfterSeconds !== undefined) {
          reply.header("Retry-After", String(error.retryAfterSeconds))
        }
        return reply.code(error.statusCode).send({ error: error.message })
      }
    }
  )

  app.post(
    "/v1/auth/verify",
    {
      attachValidation: true,
      config: { apiAuth: "public", rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: coreApiJsonSchemas.authVerification,
        response: verificationResponses
      }
    },
    async (request, reply) => {
      return verifyAndCreateSession({ request, reply, authService })
    }
  )

  app.post(
    "/v1/accounts/register",
    {
      attachValidation: true,
      config: { apiAuth: "public", rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: coreApiJsonSchemas.registerAccount,
        response: verificationResponses
      }
    },
    async (request, reply) => {
      const parsed = parseRegisterAccountRequest(request.body)
      if (!parsed) {
        return reply.code(400).send({
          error: "Enter a valid phone number, 6-digit code, and Terms acceptance."
        })
      }

      try {
        const { account, session, sessionToken } = await authService.registerAccount(
          parsed.phoneNumber,
          parsed.verificationCode,
          parsed.termsAcceptance
        )
        return reply.code(200).send(
          toSessionActor(account, session, sessionToken)
        )
      } catch (error) {
        if (!isAuthError(error)) throw error
        return reply.code(error.statusCode).send({ error: error.message })
      }
    }
  )

  app.post("/v1/auth/refresh", {
    schema: {
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    if (!sessionToken) {
      return reply.code(401).send({ error: "Sign in again to continue." })
    }

    const refreshed = await authService.refreshSession(sessionToken)
    if (!refreshed) {
      return reply.code(401).send({ error: "Sign in again to continue." })
    }

    return toSessionActor(
      refreshed.account,
      refreshed.session,
      refreshed.sessionToken
    )
  })

  app.delete("/v1/auth/session", {
    schema: {
      response: {
        204: noContentResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    if (!sessionToken) {
      return reply.code(401).send({ error: "Sign in again to continue." })
    }

    await authService.revokeSession(sessionToken)
    return reply.code(204).send()
  })
}

async function verifyAndCreateSession({
  request,
  reply,
  authService
}: {
  request: FastifyRequest
  reply: FastifyReply
  authService: AuthService
}) {
  const parsed = parseAuthVerificationRequest(request.body)
  if (!parsed) {
    return reply.code(400).send({
      error: "Enter a valid phone number and 6-digit code."
    })
  }

  try {
    const { account, session, sessionToken } = await authService.verifyExistingAccount(
      parsed.phoneNumber,
      parsed.verificationCode
    )
    return reply.code(200).send(
      toSessionActor(account, session, sessionToken)
    )
  } catch (error) {
    if (!isAuthError(error)) throw error
    return reply.code(error.statusCode).send({ error: error.message })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
