import type {
  FastifyInstance,
  FastifyRequest,
  preParsingHookHandler
} from "fastify"
import { Transform, type TransformCallback } from "node:stream"
import { COIN_PACKS } from "@blumi/domain"
import {
  authenticatedErrorResponses,
  commerceReconcileRequestSchema,
  coreApiJsonSchemas,
  successResponseJsonSchema
} from "@blumi/contracts"
import type { AuthService } from "../auth/authService"
import {
  CommerceAuthorizationError,
  CommerceVerificationError,
  type CommerceService
} from "../commerce/commerceService"
import {
  CommerceProviderUnavailableError,
  type RevenueCatPurchaseVerifier
} from "../commerce/revenueCatPurchaseVerifier"
import {
  parseRevenueCatWebhookEvent,
  verifyRevenueCatWebhookSignature
} from "../commerce/revenueCatWebhook"
import { resolveProductSession } from "./routeHelpers"
import type { PurchaseEnvironment } from "../commerce/purchaseEnvironment"

const rawWebhookBodies = new WeakMap<FastifyRequest, Buffer>()

export interface CommerceRouteServices {
  authService: AuthService
  commerceService: CommerceService
  revenueCatPurchaseVerifier: RevenueCatPurchaseVerifier
  revenueCatWebhookSigningSecret?: string
  purchaseEnvironment?: PurchaseEnvironment
}

export async function registerCommerceRoutes(
  app: FastifyInstance,
  services: CommerceRouteServices
): Promise<void> {
  app.get("/v1/commerce/coin-packs", {
    config: { apiAuth: "public" },
    schema: {
      response: { 200: successResponseJsonSchema }
    }
  }, async () => ({
    coinPacks: COIN_PACKS.map((coinPack) => ({ ...coinPack }))
  }))

  app.post(
    "/v1/commerce/coin-packs/reconcile",
    {
      attachValidation: true,
      config: { apiAuth: "bearer", rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        body: coreApiJsonSchemas.commerceReconcile,
        response: {
          200: successResponseJsonSchema,
          ...authenticatedErrorResponses
        }
      }
    },
    async (request, reply) => {
      const resolved = await resolveProductSession({
        request,
        reply,
        authService: services.authService
      })
      if (!resolved) return

      const transactionIds = parseTransactionIds(request.body)
      if (!transactionIds) {
        return reply.code(400).send({
          code: "COMMERCE_TRANSACTION_IDS_INVALID",
          error: "Choose valid purchases to reconcile."
        })
      }
      try {
        const verification = await services.revenueCatPurchaseVerifier.verifyTransactions({
          userId: resolved.account.userId,
          transactionIds
        })
        const results = [] as Array<{
          transactionId: string
          status: "credited" | "already_processed" | "pending"
        }>
        for (const outcome of verification) {
          if (outcome.kind === "pending") {
            results.push({ transactionId: outcome.transactionId, status: "pending" })
            continue
          }
          if (outcome.transaction.userId !== resolved.account.userId) {
            throw new CommerceAuthorizationError()
          }
          const applied = await services.commerceService.applyVerifiedTransaction(
            outcome.transaction
          )
          results.push({
            transactionId: outcome.transactionId,
            status: applied.applied ? "credited" : "already_processed"
          })
        }
        const inventory = await services.commerceService.getInventory(
          resolved.account.userId
        )
        return reply.code(200).send({ results, inventory })
      } catch (error) {
        return sendCommerceError(reply, error)
      }
    }
  )

  app.post(
    "/v1/webhooks/revenuecat",
    {
      attachValidation: true,
      config: { apiAuth: "revenuecat-webhook", rateLimit: { max: 500, timeWindow: "1 minute" } },
      schema: {
        body: coreApiJsonSchemas.revenueCatWebhook,
        headers: {
          type: "object",
          required: ["x-revenuecat-webhook-signature"],
          properties: {
            "x-revenuecat-webhook-signature": {
              type: "string",
              pattern: "^t=\\d{10,13},v1=[0-9a-fA-F]{64}$"
            }
          },
          additionalProperties: true
        },
        response: {
          200: successResponseJsonSchema,
          401: authenticatedErrorResponses[401],
          409: authenticatedErrorResponses[409],
          503: authenticatedErrorResponses[503],
          500: authenticatedErrorResponses[500]
        }
      },
      preParsing: captureRevenueCatRawBody
    },
    async (request, reply) => {
      const rawBody = rawWebhookBodies.get(request)
      rawWebhookBodies.delete(request)
      if (
        !rawBody ||
        !verifyRevenueCatWebhookSignature({
          rawBody,
          signatureHeader: readSignatureHeader(request),
          secret: services.revenueCatWebhookSigningSecret ?? ""
        })
      ) {
        return reply.code(401).send({ error: "Invalid commerce webhook signature." })
      }
      const event = parseRevenueCatWebhookEvent(request.body, services.purchaseEnvironment)
      if (!event) return reply.code(200).send({ ok: true })
      try {
        const account = await resolveRevenueCatWebhookAccount(
          services.authService,
          event.userIdCandidates
        )
        if (!account) return reply.code(200).send({ ok: true })
        const { userIdCandidates: _userIdCandidates, ...verifiedEvent } = event
        await services.commerceService.applyVerifiedTransaction({
          ...verifiedEvent,
          userId: account.userId,
          providerPayload: rawBody.toString("utf8")
        })
        return reply.code(200).send({ ok: true })
      } catch (error) {
        return sendCommerceError(reply, error)
      }
    }
  )
}

async function resolveRevenueCatWebhookAccount(
  authService: AuthService,
  userIdCandidates: readonly string[]
) {
  const matchedAccounts = await Promise.all(
    userIdCandidates.map((userId) =>
      authService.repository.findAccountByUserId(userId)
    )
  )
  const uniqueAccounts = matchedAccounts.reduce<NonNullable<(typeof matchedAccounts)[number]>[]>(
    (accounts, account) => {
      if (!account || accounts.some((candidate) => candidate.accountId === account.accountId)) {
        return accounts
      }
      return [...accounts, account]
    },
    []
  )
  if (uniqueAccounts.length > 1) throw new CommerceAuthorizationError()
  return uniqueAccounts[0] ?? null
}

function parseTransactionIds(value: unknown): string[] | null {
  const parsed = commerceReconcileRequestSchema.safeParse(value)
  return parsed.success ? parsed.data.transactionIds : null
}

const captureRevenueCatRawBody: preParsingHookHandler = (
  request,
  _reply,
  payload,
  done
) => {
  const chunks: Buffer[] = []
  let receivedEncodedLength = 0
  const capture = new Transform({
    transform(chunk: Buffer | string, _encoding: BufferEncoding, callback: TransformCallback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(buffer)
      receivedEncodedLength += buffer.length
      ;(capture as Transform & { receivedEncodedLength?: number }).receivedEncodedLength = receivedEncodedLength
      callback(null, buffer)
    },
    flush(callback: TransformCallback) {
      rawWebhookBodies.set(request, Buffer.concat(chunks))
      callback()
    }
  })
  payload.pipe(capture)
  done(null, capture as typeof payload)
}

function readSignatureHeader(request: FastifyRequest): string | undefined {
  const value = request.headers["x-revenuecat-webhook-signature"]
  return typeof value === "string" ? value : undefined
}

function sendCommerceError(reply: { code(statusCode: number): { send(payload: unknown): unknown } }, error: unknown) {
  if (
    error instanceof CommerceAuthorizationError ||
    error instanceof CommerceVerificationError ||
    error instanceof CommerceProviderUnavailableError
  ) {
    return reply.code(error.statusCode).send({
      code: error.code,
      error: error.message
    })
  }
  throw error
}
