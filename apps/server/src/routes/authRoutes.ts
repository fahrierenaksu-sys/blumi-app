import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import {
  authenticatedErrorResponses,
  coreApiJsonSchemas,
  noContentResponseJsonSchema,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AccountRecoveryService } from "../account/accountRecoveryService"
import { isAuthError } from "../auth/authErrors"
import { toSessionActor, type AuthService } from "../auth/authService"
import { isFirebaseTokenRejection, type FirebaseAuthVerifier } from "../auth/firebaseAuth"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"
import { normalizePhoneNumber } from "../auth/phone"
import { readBearerToken, schemaValidationFailed } from "./routeHelpers"
import {
  parseAuthPhoneRequest,
  parseAuthVerificationRequest,
  parseRegisterAccountRequest,
  parseFirebaseAuthRequest
} from "./authRequestSchemas"

export interface AuthRouteServices {
  authService: AuthService
  firebaseAuthVerifier?: FirebaseAuthVerifier
  accountRecoveryService?: AccountRecoveryService
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
      config: { apiAuth: "public", requestValidation: "enforced", rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: coreApiJsonSchemas.authPhone,
        response: sendCodeResponses
      }
    },
    async (request, reply) => {
      if (services.firebaseAuthVerifier) {
        return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
      }
      const parsed = parseAuthPhoneRequest(request.body)
      if (!parsed || schemaValidationFailed(request)) {
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
      config: { apiAuth: "public", requestValidation: "enforced", rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: coreApiJsonSchemas.authVerification,
        response: verificationResponses
      }
    },
    async (request, reply) => {
      if (services.firebaseAuthVerifier) {
        return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
      }
      return verifyAndCreateSession({ request, reply, authService })
    }
  )

  app.post(
    "/v1/accounts/register",
    {
      attachValidation: true,
      config: { apiAuth: "public", requestValidation: "enforced", rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: coreApiJsonSchemas.registerAccount,
        response: verificationResponses
      }
    },
    async (request, reply) => {
      if (services.firebaseAuthVerifier) {
        return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
      }
      const parsed = parseRegisterAccountRequest(request.body)
      if (!parsed || schemaValidationFailed(request)) {
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

  app.post(
    "/v1/auth/firebase/complete",
    {
      attachValidation: true,
      config: { apiAuth: "public", requestValidation: "enforced", rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["idToken", "authIntent"],
          properties: {
            idToken: { type: "string", minLength: 1, maxLength: 12_000 },
            authIntent: { type: "string", enum: ["create", "sign-in"] },
            termsAcceptance: {
              type: "object",
              required: ["version", "locale"],
              properties: {
                version: { type: "string", minLength: 1 },
                locale: { type: "string", enum: ["en", "tr"] }
              }
            }
          }
        },
        response: verificationResponses
      }
    },
    async (request, reply) => {
      const parsed = parseFirebaseAuthRequest(request.body)
      if (!parsed || schemaValidationFailed(request)) {
        return reply.code(400).send({ error: "Phone verification could not be completed." })
      }
      if (!services.firebaseAuthVerifier) {
        return reply.code(503).send({ error: "Phone verification is not configured yet." })
      }
      if (parsed.authIntent === "create" && !parsed.termsAcceptance) {
        return reply.code(400).send({ error: "Terms acceptance is required to create an account." })
      }

      let identity: Awaited<ReturnType<typeof services.firebaseAuthVerifier.verifyIdToken>>
      try {
        identity = await services.firebaseAuthVerifier.verifyIdToken(parsed.idToken)
      } catch (error) {
        // Only a rejected token is the caller's failure (401, counted by the
        // failed-auth limiter). A provider or credential failure is ours: 503.
        if (isFirebaseTokenRejection(error)) {
          return reply.code(401).send({ error: "Phone verification could not be completed." })
        }
        request.log.error({ errorKind: safeOperationalErrorKind(error) }, "Firebase verification unavailable")
        return reply.code(503).header("Retry-After", "5").send({ error: "Phone verification is temporarily unavailable." })
      }

      try {
        if (await authService.repository.isFirebaseUserDeletionPending(identity.uid)) {
          return reply.code(403).send({ error: "This account is being deleted." })
        }
        const phoneNumber = normalizePhoneNumber(identity.phoneNumber)?.e164
        if (!phoneNumber) {
          return reply.code(401).send({ error: "Firebase did not provide a valid phone number." })
        }
        const result = await authService.signInWithVerifiedPhone(phoneNumber, {
          requireExistingAccount: parsed.authIntent === "sign-in",
          acceptedTerms: parsed.authIntent === "create" ? parsed.termsAcceptance : undefined,
          firebaseUid: identity.uid
        }).catch(async (error: unknown) => {
          if (isAuthError(error) && error.code === "ACCOUNT_RECOVERY_REQUIRED") {
            // Queue the existing manual review; the phone was just verified.
            await services.accountRecoveryService?.requestWithVerifiedPhone({
              oldPhoneNumber: phoneNumber,
              newPhoneNumber: phoneNumber,
              verifiedPhoneNumber: phoneNumber
            }).catch(() => undefined)
          }
          throw error
        })
        return reply.code(200).send(toSessionActor(result.account, result.session, result.sessionToken))
      } catch (error) {
        if (isAuthError(error) && error.code === "ACCOUNT_RECOVERY_REQUIRED") {
          return reply.code(error.statusCode).send({ code: error.code, error: error.message })
        }
        if (isAuthError(error)) {
          return reply.code(error.statusCode).send({ error: error.message })
        }
        // A database or other server failure after a valid token: the global
        // handler answers it (503 when transient), never a failed sign-in.
        throw error
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
  if (!parsed || schemaValidationFailed(request)) {
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
