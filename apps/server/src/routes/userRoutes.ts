import type { FastifyInstance } from "fastify"
import { Readable } from "node:stream"
import {
  accountConfirmationRequestSchema,
  authenticatedErrorResponses,
  coreApiJsonSchemas,
  noContentResponseJsonSchema,
  onboardingStepRequestSchema,
  phoneChangeConfirmRequestSchema,
  phoneChangeNewChallengeRequestSchema,
  phoneNumberRequestSchema,
  successResponseJsonSchema,
  verificationCodeRequestSchema,
  isAvatarLoadoutV2,
} from "@blumi/contracts"
import type { AvatarService } from "../avatar/avatarService"
import type { CapabilityService } from "../capabilities/capabilityService"
import {
  projectAvatarSelectionForRead,
  resolveRequestCapabilities
} from "../avatar/avatarReadProjection"
import {
  OnboardingPrerequisiteError,
  type AuthService
} from "../auth/authService"
import { isPublicRequestError } from "../errors/publicRequestError"
import {
  isRecord,
  readBearerToken,
  readPhoneNumber,
  readVerificationCode,
  resolveBearerSession,
  schemaValidationFailed
} from "./routeHelpers"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import { isAuthError } from "../auth/authErrors"
import { readProfileUpdateBody } from "./profileUpdateBody"
import type { AccountRecoveryService } from "../account/accountRecoveryService"
import type { FirebaseAuthVerifier } from "../auth/firebaseAuth"

export interface UserRouteServices {
  authService: AuthService
  avatarService: AvatarService
  capabilityService: CapabilityService
  accountRecoveryService?: AccountRecoveryService
  firebaseAuthVerifier?: FirebaseAuthVerifier
}

const accountChallengeRouteSchema = {
  response: {
    202: successResponseJsonSchema,
    ...authenticatedErrorResponses
  }
}

const accountVerificationRouteSchema = {
  body: coreApiJsonSchemas.verificationCode,
  response: {
    200: successResponseJsonSchema,
    ...authenticatedErrorResponses
  }
}

const accountConfirmationRouteSchema = {
  body: coreApiJsonSchemas.accountConfirmation,
  response: {
    200: successResponseJsonSchema,
    204: noContentResponseJsonSchema,
    ...authenticatedErrorResponses
  }
}

export async function registerUserRoutes(
  app: FastifyInstance,
  services: UserRouteServices
): Promise<void> {
  const { authService, avatarService, capabilityService } = services

  app.post("/v1/account/firebase/challenge", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: {
      body: {
        type: "object",
        required: ["purpose"],
        properties: {
          purpose: { type: "string", enum: ["account_deletion", "account_data_export", "phone_change_current", "phone_change_new"] },
          targetPhoneNumber: { type: "string", minLength: 5, maxLength: 20 }
        },
        additionalProperties: false
      },
      response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses }
    }
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    if (!services.firebaseAuthVerifier) return reply.code(503).send({ error: "Phone verification is not configured yet." })
    const body = isRecord(request.body) ? request.body : null
    const purpose = typeof body?.purpose === "string" ? body.purpose : ""
    if (
      !["account_deletion", "account_data_export", "phone_change_current", "phone_change_new"].includes(purpose) ||
      schemaValidationFailed(request)
    ) {
      return reply.code(400).send({ error: "Invalid verification purpose." })
    }
    try {
      const challenge = await authService.createFirebaseActionChallenge(
        sessionToken,
        purpose as "account_deletion" | "account_data_export" | "phone_change_current" | "phone_change_new",
        typeof body?.targetPhoneNumber === "string" ? body.targetPhoneNumber : undefined
      )
      return challenge ? reply.code(200).send(challenge) : reply.code(401).send({ error: "Sign in again to continue." })
    } catch (error) {
      if (isPublicRequestError(error)) return reply.code(400).send({ error: error.message })
      throw error
    }
  })

  app.post("/v1/account/firebase/reauth", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: { max: 10, timeWindow: "5 minutes" } },
    schema: {
      body: {
        type: "object",
        required: ["idToken", "purpose", "challengeId"],
        properties: {
          idToken: { type: "string", minLength: 1, maxLength: 12_000 },
          challengeId: { type: "string", minLength: 32, maxLength: 512 },
          purpose: {
            type: "string",
            enum: ["account_deletion", "account_data_export", "phone_change_current", "phone_change_new"]
          },
          currentPhoneConfirmationToken: { type: "string", minLength: 1, maxLength: 512 }
        },
        additionalProperties: false
      },
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    if (!services.firebaseAuthVerifier) {
      return reply.code(503).send({ error: "Phone verification is not configured yet." })
    }
    const body = isRecord(request.body) ? request.body : null
    const idToken = typeof body?.idToken === "string" ? body.idToken : ""
    const challengeId = typeof body?.challengeId === "string" ? body.challengeId : ""
    const purpose = typeof body?.purpose === "string" ? body.purpose : ""
    const currentPhoneConfirmationToken = typeof body?.currentPhoneConfirmationToken === "string"
      ? body.currentPhoneConfirmationToken
      : undefined
    if (
      !idToken ||
      !challengeId ||
      !["account_deletion", "account_data_export", "phone_change_current", "phone_change_new"].includes(purpose) ||
      schemaValidationFailed(request)
    ) {
      return reply.code(400).send({ error: "Phone verification could not be completed." })
    }

    try {
      const identity = await services.firebaseAuthVerifier.verifyIdToken(idToken)
      const phoneNumber = readPhoneNumber({ phoneNumber: identity.phoneNumber })
      if (!phoneNumber) return reply.code(401).send({ error: "Phone verification could not be completed." })
      const fresh = await authService.consumeFirebaseActionChallenge({
        sessionToken,
        purpose: purpose as "account_deletion" | "account_data_export" | "phone_change_current" | "phone_change_new",
        challengeId,
        phoneNumber: phoneNumber.e164,
        authTime: identity.authTime
      })
      if (!fresh) return reply.code(401).send({ error: "Request a fresh verification code and try again." })
      if (purpose === "account_deletion") {
        const confirmation = await authService.verifyFirebaseAccountDeletion(sessionToken, phoneNumber.e164, identity.uid)
        return confirmation
          ? reply.code(200).send(confirmation)
          : reply.code(401).send({ error: "Sign in again to continue." })
      }
      const confirmation = await authService.verifyFirebaseAccountAction(
        sessionToken,
        purpose as "account_data_export" | "phone_change_current" | "phone_change_new",
        phoneNumber.e164,
        currentPhoneConfirmationToken
      )
      return confirmation
        ? reply.code(200).send(confirmation)
        : reply.code(401).send({ error: "Sign in again to continue." })
    } catch (error) {
      if (isPublicRequestError(error)) return reply.code(400).send({ error: error.message })
      if (isAuthError(error)) return reply.code(error.statusCode).send({ code: error.code, error: error.message })
      return reply.code(401).send({ error: "Phone verification could not be completed." })
    }
  })

  app.get("/v1/users/me", {
    schema: {
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({ request, reply, authService })
    if (!resolved) return
    const requestCapabilities = resolveRequestCapabilities(
      request,
      resolved.account.userId,
      capabilityService
    )

    return {
      profile: {
        ...resolved.account.profile,
        avatar: resolved.account.profile.avatar.loadout &&
            typeof resolved.account.profile.avatar.revision === "number"
          ? projectAvatarSelectionForRead(
              resolved.account.profile.avatar as CompleteAvatarSelection,
              requestCapabilities.capabilities.avatar_loadout_v2_read
            )
          : { ...resolved.account.profile.avatar }
      },
      onboarding: resolved.account.onboarding,
      moderation: resolved.account.moderation ?? {
        status: "active",
        updatedAt: resolved.account.updatedAt
      }
    }
  })

  app.post("/v1/account/moderation/acknowledge", {
    schema: {
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveBearerSession({ request, reply, authService })
    if (!resolved) return
    const sessionToken = readBearerToken(request)
    if (!sessionToken) {
      return reply.code(401).send({ error: "Sign in again to continue." })
    }
    const moderation = await authService.acknowledgeModeration(sessionToken)
    if (!moderation) {
      return reply.code(401).send({ error: "Sign in again to continue." })
    }
    return { moderation }
  })

  app.patch("/v1/users/me", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: {
      body: coreApiJsonSchemas.object,
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    // Banned or suspended accounts may not change public profile state.
    const resolvedSession = await resolveBearerSession({ request, reply, authService })
    if (!resolvedSession) return reply
    const sessionToken = readBearerToken(request) as string
    if (schemaValidationFailed(request)) {
      return reply.code(400).send({ error: "Choose valid profile details." })
    }

    try {
      const update = readProfileUpdateBody(isRecord(request.body) ? request.body : {})
      if (!update) {
        return reply.code(400).send({ error: "Choose valid profile details." })
      }
      const profile = await authService.updateProfile(sessionToken, update)
      if (!profile) {
        return reply.code(401).send({ error: "Sign in again to continue." })
      }

      return { profile }
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({
        error: error.message
      })
    }
  })

  app.put("/v1/users/me/avatar", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: {
      body: coreApiJsonSchemas.object,
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    // Banned or suspended accounts may not change public profile state.
    const resolvedSession = await resolveBearerSession({ request, reply, authService })
    if (!resolvedSession) return reply
    const sessionToken = readBearerToken(request) as string
    if (schemaValidationFailed(request)) {
      // Same body the avatar service returns for a missing or invalid revision.
      return reply.code(400).send({
        code: "invalid_revision",
        error: "Refresh your avatar and try again."
      })
    }
    const body = isRecord(request.body) ? request.body : {}
    const requestCapabilities = resolveRequestCapabilities(
      request,
      resolvedSession.account.userId,
      capabilityService
    )
    if (
      isAvatarLoadoutV2(body.loadout) &&
      !requestCapabilities.capabilities.avatar_loadout_v2_write
    ) {
      return reply.code(400).send({
        code: "CAPABILITY_UNAVAILABLE",
        error: "Update Blumi before saving this avatar."
      })
    }
    const allowAvatarLoadoutV2 =
      requestCapabilities.capabilities.avatar_loadout_v2_read
    const result = await avatarService.saveAvatar(sessionToken, {
      loadout: body.loadout,
      revision: body.revision,
      allowV2Write: requestCapabilities.capabilities.avatar_loadout_v2_write
    })
    if (result.kind === "unauthorized") {
      return reply.code(401).send({ error: "Sign in again to continue." })
    }
    if (result.kind === "invalid") {
      return reply.code(400).send({ code: result.code, error: result.message })
    }
    if (result.kind === "conflict") {
      return reply.code(409).send({
        code: "AVATAR_REVISION_CONFLICT",
        error: "Your avatar changed on another device. Refresh and try again.",
        current: projectAvatarSelectionForRead(
          result.current,
          allowAvatarLoadoutV2
        )
      })
    }
    return {
      avatar: projectAvatarSelectionForRead(
        result.selection,
        allowAvatarLoadoutV2
      )
    }
  })

  app.patch("/v1/users/me/onboarding", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: {
      body: coreApiJsonSchemas.onboardingStep,
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    // Banned or suspended accounts may not change public profile state.
    const resolvedSession = await resolveBearerSession({ request, reply, authService })
    if (!resolvedSession) return reply
    const sessionToken = readBearerToken(request) as string
    const parsed = onboardingStepRequestSchema.safeParse(request.body)
    if (!parsed.success || schemaValidationFailed(request)) {
      return reply.code(400).send({ error: "Choose a valid setup step." })
    }

    try {
      const onboarding = await authService.completeOnboardingStep(
        sessionToken,
        parsed.data.step
      )
      if (!onboarding) {
        return reply.code(401).send({ error: "Sign in again to continue." })
      }
      return { onboarding }
    } catch (error) {
      if (error instanceof OnboardingPrerequisiteError) {
        return reply.code(409).send({ code: error.code, error: error.message })
      }
      throw error
    }
  })

  app.post(
    "/v1/account/deletion/challenge",
    {
      config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
      schema: accountChallengeRouteSchema
    },
    async (request, reply) => {
      const sessionToken = readBearerToken(request)
      if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
      if (services.firebaseAuthVerifier) return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
      try {
        const challenge = await authService.requestAccountDeletionChallenge(sessionToken)
        if (!challenge) return reply.code(401).send({ error: "Sign in again to continue." })
        return reply.code(202).send({ ok: true, expiresAt: challenge.expiresAt })
      } catch (error) {
        if (!isAuthError(error)) throw error
        if (error.retryAfterSeconds !== undefined) reply.header("Retry-After", String(error.retryAfterSeconds))
        return reply.code(error.statusCode).send({ code: error.code, error: error.message })
      }
    }
  )

  app.post(
    "/v1/account/deletion/confirm",
    {
      attachValidation: true,
      config: { requestValidation: "enforced", rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: accountVerificationRouteSchema
    },
    async (request, reply) => {
      const sessionToken = readBearerToken(request)
      const parsed = verificationCodeRequestSchema.safeParse(request.body)
      const code = parsed.success && !schemaValidationFailed(request)
        ? readVerificationCode(parsed.data)
        : null
      if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
      if (services.firebaseAuthVerifier) return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
      if (!code) return reply.code(400).send({ error: "Enter the 6-digit deletion code." })
      try {
        const confirmation = await authService.verifyAccountDeletionChallenge(sessionToken, code)
        if (!confirmation) return reply.code(401).send({ error: "Sign in again to continue." })
        return reply.code(200).send(confirmation)
      } catch (error) {
        if (!isAuthError(error)) throw error
        return reply.code(error.statusCode).send({ code: error.code, error: error.message })
      }
    }
  )

  app.delete("/v1/account", {
    attachValidation: true,
    // Advisory: a malformed or missing confirmation deliberately gets the same
    // 403 REAUTH_REQUIRED answer as an expired one; this destructive/private
    // flow has no input-400 contract to preserve.
    config: { requestValidation: "advisory" },
    schema: accountConfirmationRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    if (!sessionToken) {
      return reply.code(401).send({ error: "Sign in again to continue." })
    }

    const parsed = accountConfirmationRequestSchema.safeParse(request.body)
    const confirmationToken = parsed.success
      ? readConfirmationToken(parsed.data, "confirmationToken")
      : ""
    const result = await authService.deleteAccount(sessionToken, confirmationToken)
    if (result === "missing_session") {
      return reply.code(401).send({ error: "Sign in again to continue." })
    }
    if (result === "reauth_required") {
      return reply.code(403).send({ code: "REAUTH_REQUIRED", error: "Confirm account deletion with a fresh code sent to your phone." })
    }

    if (result === "pending_firebase_deletion") {
      return reply.code(202).send({ status: "pending_firebase_deletion" })
    }

    return reply.code(204).send()
  })

  app.post("/v1/account/export/challenge", {
    config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: accountChallengeRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    if (services.firebaseAuthVerifier) return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
    try {
      const challenge = await authService.requestAccountDataExportChallenge(sessionToken)
      if (!challenge) return reply.code(401).send({ error: "Sign in again to continue." })
      return reply.code(202).send({ ok: true, expiresAt: challenge.expiresAt })
    } catch (error) {
      if (!isAuthError(error)) throw error
      return reply.code(error.statusCode).send({ code: error.code, error: error.message })
    }
  })

  app.post("/v1/account/export/confirm", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: accountVerificationRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    const parsed = verificationCodeRequestSchema.safeParse(request.body)
    const code = parsed.success && !schemaValidationFailed(request)
      ? readVerificationCode(parsed.data)
      : null
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    if (services.firebaseAuthVerifier) return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
    if (!code) return reply.code(400).send({ error: "Enter the 6-digit security code." })
    try {
      const confirmation = await authService.verifyAccountDataExportChallenge(sessionToken, code)
      if (!confirmation) return reply.code(401).send({ error: "Sign in again to continue." })
      return reply.code(200).send(confirmation)
    } catch (error) {
      if (!isAuthError(error)) throw error
      return reply.code(error.statusCode).send({ code: error.code, error: error.message })
    }
  })

  app.post("/v1/account/export", {
    attachValidation: true,
    // Advisory: a malformed or missing confirmation deliberately gets the same
    // 403 REAUTH_REQUIRED answer as an expired one; this destructive/private
    // flow has no input-400 contract to preserve.
    config: { requestValidation: "advisory" },
    schema: accountConfirmationRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    const parsed = accountConfirmationRequestSchema.safeParse(request.body)
    const confirmationToken = parsed.success
      ? readConfirmationToken(parsed.data, "confirmationToken")
      : ""
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    const exported = await authService.exportAccountData(sessionToken, confirmationToken)
    if (exported === "missing_session") return reply.code(401).send({ error: "Sign in again to continue." })
    if (exported === "reauth_required") return reply.code(403).send({ code: "REAUTH_REQUIRED", error: "Confirm data export with a fresh security code." })
    reply.header("cache-control", "no-store")
    reply.header("content-disposition", 'attachment; filename="blumi-account-data.json"')
    reply.header("x-blumi-export-format", "json-v1")
    return reply.type("application/json").code(200).send(Readable.from(exported))
  })

  app.post("/v1/account/phone-change/current/challenge", {
    config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: accountChallengeRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    if (services.firebaseAuthVerifier) return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
    try {
      const challenge = await authService.requestPhoneChangeChallenge(sessionToken)
      if (!challenge) return reply.code(401).send({ error: "Sign in again to continue." })
      return reply.code(202).send({ ok: true, expiresAt: challenge.expiresAt })
    } catch (error) {
      if (!isAuthError(error)) throw error
      return reply.code(error.statusCode).send({ code: error.code, error: error.message })
    }
  })

  app.post("/v1/account/phone-change/current/confirm", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: accountVerificationRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    const parsed = verificationCodeRequestSchema.safeParse(request.body)
    const code = parsed.success && !schemaValidationFailed(request)
      ? readVerificationCode(parsed.data)
      : null
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    if (services.firebaseAuthVerifier) return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
    if (!code) return reply.code(400).send({ error: "Enter the 6-digit security code." })
    try {
      const confirmation = await authService.verifyPhoneChangeChallenge(sessionToken, code)
      if (!confirmation) return reply.code(401).send({ error: "Sign in again to continue." })
      return reply.code(200).send(confirmation)
    } catch (error) {
      if (!isAuthError(error)) throw error
      return reply.code(error.statusCode).send({ code: error.code, error: error.message })
    }
  })

  app.post("/v1/account/phone-change/new/challenge", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: {
      body: coreApiJsonSchemas.phoneChangeNewChallenge,
      response: {
        202: successResponseJsonSchema,
        410: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    const parsed = phoneChangeNewChallengeRequestSchema.safeParse(request.body)
    const phoneNumber = parsed.success ? readPhoneNumber(parsed.data) : null
    const currentPhoneConfirmationToken = parsed.success
      ? readConfirmationToken(parsed.data, "currentPhoneConfirmationToken")
      : ""
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    if (services.firebaseAuthVerifier) return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
    if (!phoneNumber || !currentPhoneConfirmationToken || schemaValidationFailed(request)) return reply.code(400).send({ error: "Enter a valid new phone number and confirm your current number first." })
    try {
      const challenge = await authService.requestPhoneChangeNewNumberChallenge(sessionToken, phoneNumber.e164, currentPhoneConfirmationToken)
      if (!challenge) return reply.code(401).send({ error: "Sign in again to continue." })
      return reply.code(202).send({ ok: true, expiresAt: challenge.expiresAt })
    } catch (error) {
      if (isPublicRequestError(error)) return reply.code(400).send({ error: error.message })
      if (!isAuthError(error)) throw error
      return reply.code(error.statusCode).send({ code: error.code, error: error.message })
    }
  })

  app.post("/v1/account/phone-change/new/confirm", {
    attachValidation: true,
    config: { requestValidation: "enforced", rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: accountVerificationRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    const parsed = verificationCodeRequestSchema.safeParse(request.body)
    const code = parsed.success && !schemaValidationFailed(request)
      ? readVerificationCode(parsed.data)
      : null
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    if (services.firebaseAuthVerifier) return reply.code(410).send({ code: "FIREBASE_PHONE_AUTH_REQUIRED", error: "Update Blumi to verify your phone with Firebase." })
    if (!code) return reply.code(400).send({ error: "Enter the 6-digit security code." })
    try {
      const confirmation = await authService.verifyPhoneChangeNewNumberChallenge(sessionToken, code)
      if (!confirmation) return reply.code(401).send({ error: "Sign in again to continue." })
      return reply.code(200).send(confirmation)
    } catch (error) {
      if (!isAuthError(error)) throw error
      return reply.code(error.statusCode).send({ code: error.code, error: error.message })
    }
  })

  app.post("/v1/account/phone-change/confirm", {
    attachValidation: true,
    // Advisory: a malformed or missing confirmation deliberately gets the same
    // 403 REAUTH_REQUIRED answer as an expired one; this destructive/private
    // flow has no input-400 contract to preserve.
    config: { requestValidation: "advisory" },
    schema: {
      body: coreApiJsonSchemas.phoneChangeConfirm,
      response: {
        204: noContentResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    const parsed = phoneChangeConfirmRequestSchema.safeParse(request.body)
    const current = parsed.success
      ? readConfirmationToken(parsed.data, "currentPhoneConfirmationToken")
      : ""
    const replacement = parsed.success
      ? readConfirmationToken(parsed.data, "newPhoneConfirmationToken")
      : ""
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
    const result = await authService.confirmPhoneChange(sessionToken, current, replacement)
    if (result === "missing_session") return reply.code(401).send({ error: "Sign in again to continue." })
    if (result === "phone_in_use") return reply.code(409).send({ code: "PHONE_NUMBER_IN_USE", error: "That phone number is already in use." })
    if (result === "reauth_required") return reply.code(403).send({ code: "REAUTH_REQUIRED", error: "Confirm both phone numbers with fresh security codes." })
    return reply.code(204).send()
  })

  app.post("/v1/account/recovery/challenge", {
    attachValidation: true,
    config: { apiAuth: "public", requestValidation: "enforced", rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: {
      body: coreApiJsonSchemas.phoneNumber,
      response: {
        202: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const parsed = phoneNumberRequestSchema.safeParse(request.body)
    const phone = parsed.success ? readPhoneNumber(parsed.data) : null
    if (!phone || schemaValidationFailed(request)) {
      return reply.code(400).send({ error: "Enter a valid new phone number." })
    }
    try {
      const challenge = await authService.requestRecoveryPhoneVerification(phone.e164)
      return reply.code(202).send({ ok: true, expiresAt: challenge.expiresAt })
    } catch (error) {
      if (!isAuthError(error)) throw error
      return reply.code(error.statusCode).send({ code: error.code, error: error.message })
    }
  })

  app.post("/v1/account/recovery/requests", {
    attachValidation: true,
    // Advisory: this public route answers every unverifiable request with the
    // same 202 so it cannot be used to probe which phone numbers have accounts.
    config: { apiAuth: "public", requestValidation: "advisory", rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: {
      body: coreApiJsonSchemas.accountRecoveryRequest,
      response: {
        202: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const body = isRecord(request.body) ? request.body : null
    const oldPhone = typeof body?.oldPhoneNumber === "string"
      ? readPhoneNumber({ phoneNumber: body.oldPhoneNumber })
      : null
    const newPhone = typeof body?.newPhoneNumber === "string"
      ? readPhoneNumber({ phoneNumber: body.newPhoneNumber })
      : null
    const idToken = typeof body?.idToken === "string" ? body.idToken : ""
    const recovery = services.accountRecoveryService
    if (!oldPhone || !newPhone || !idToken || !recovery || !services.firebaseAuthVerifier) return reply.code(202).send({ ok: true })
    try {
      const identity = await services.firebaseAuthVerifier.verifyIdToken(idToken)
      const verifiedPhone = readPhoneNumber({ phoneNumber: identity.phoneNumber })
      if (!verifiedPhone) return reply.code(202).send({ ok: true })
      await recovery.requestWithVerifiedPhone({
        oldPhoneNumber: oldPhone.e164,
        newPhoneNumber: newPhone.e164,
        verifiedPhoneNumber: verifiedPhone.e164
      })
    } catch (error) {
      if (isAuthError(error)) return reply.code(401).send({ code: error.code, error: error.message })
      if (isPublicRequestError(error)) return reply.code(400).send({ error: error.message })
      throw error
    }
    return reply.code(202).send({ ok: true })
  })
}

function readConfirmationToken(body: unknown, key: string): string {
  if (!isRecord(body) || typeof body[key] !== "string") return ""
  const token = body[key].trim()
  return /^dv_[0-9a-f-]{36}_[0-9a-f-]{36}$/.test(token) ? token : ""
}
