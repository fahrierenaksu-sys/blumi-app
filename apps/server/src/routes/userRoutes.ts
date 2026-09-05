import type { FastifyInstance } from "fastify"
import { Readable } from "node:stream"
import {
  accountConfirmationRequestSchema,
  accountRecoveryRequestSchema,
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
import {
  isPublicRequestError,
  PublicRequestError
} from "../errors/publicRequestError"
import {
  isRecord,
  readBearerToken,
  readLocationNumber,
  readPhoneNumber,
  readVerificationCode,
  resolveBearerSession
} from "./routeHelpers"
import type {
  CompleteAvatarSelection,
  UserProfilePrompt
} from "@blumi/contracts"
import { isAuthError } from "../auth/authErrors"
import type { AccountRecoveryService } from "../account/accountRecoveryService"

export interface UserRouteServices {
  authService: AuthService
  avatarService: AvatarService
  capabilityService: CapabilityService
  accountRecoveryService?: AccountRecoveryService
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
    schema: {
      body: coreApiJsonSchemas.object,
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

    try {
      const body = isRecord(request.body) ? request.body : {}
      const profile = await authService.updateProfile(sessionToken, {
        displayName:
          typeof body.displayName === "string" ? body.displayName : undefined,
        age:
          typeof body.age === "number" ? body.age : undefined,
        avatarPresetId:
          typeof body.avatarPresetId === "string" ? body.avatarPresetId : undefined,
        bio:
          typeof body.bio === "string" ? body.bio : undefined,
        gender:
          typeof body.gender === "string" ? body.gender : undefined,
        identityGender:
          typeof body.identityGender === "string" ? body.identityGender : undefined,
        discoveryPreferences:
          isRecord(body.discoveryPreferences)
            ? body.discoveryPreferences as never
            : undefined,
        interests:
          Array.isArray(body.interests) &&
          body.interests.every((interest) => typeof interest === "string")
            ? body.interests
            : undefined,
        prompts: readProfilePrompts(body),
        locationLat: readLocationNumber(body, "lat"),
        locationLng: readLocationNumber(body, "lng")
      })
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
    schema: {
      body: coreApiJsonSchemas.object,
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
    const resolvedSession = await authService.getSession(sessionToken)
    if (!resolvedSession) {
      return reply.code(401).send({ error: "Sign in again to continue." })
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
    schema: {
      body: coreApiJsonSchemas.onboardingStep,
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
    const parsed = onboardingStepRequestSchema.safeParse(request.body)
    if (!parsed.success) {
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
      attachValidation: true,
      config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
      schema: accountChallengeRouteSchema
    },
    async (request, reply) => {
      const sessionToken = readBearerToken(request)
      if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
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
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: accountVerificationRouteSchema
    },
    async (request, reply) => {
      const sessionToken = readBearerToken(request)
      const parsed = verificationCodeRequestSchema.safeParse(request.body)
      const code = parsed.success ? readVerificationCode(parsed.data) : null
      if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
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

    return reply.code(204).send()
  })

  app.post("/v1/account/export/challenge", {
    attachValidation: true,
    config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: accountChallengeRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
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
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: accountVerificationRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    const parsed = verificationCodeRequestSchema.safeParse(request.body)
    const code = parsed.success ? readVerificationCode(parsed.data) : null
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
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
    attachValidation: true,
    config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: accountChallengeRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
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
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: accountVerificationRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    const parsed = verificationCodeRequestSchema.safeParse(request.body)
    const code = parsed.success ? readVerificationCode(parsed.data) : null
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
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
    config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: {
      body: coreApiJsonSchemas.phoneChangeNewChallenge,
      response: {
        202: successResponseJsonSchema,
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
    if (!phoneNumber || !currentPhoneConfirmationToken) return reply.code(400).send({ error: "Enter a valid new phone number and confirm your current number first." })
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
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: accountVerificationRouteSchema
  }, async (request, reply) => {
    const sessionToken = readBearerToken(request)
    const parsed = verificationCodeRequestSchema.safeParse(request.body)
    const code = parsed.success ? readVerificationCode(parsed.data) : null
    if (!sessionToken) return reply.code(401).send({ error: "Sign in again to continue." })
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
    config: { apiAuth: "public", rateLimit: { max: 5, timeWindow: "5 minutes" } },
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
    if (!phone) return reply.code(400).send({ error: "Enter a valid new phone number." })
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
    config: { apiAuth: "public", rateLimit: { max: 5, timeWindow: "5 minutes" } },
    schema: {
      body: coreApiJsonSchemas.accountRecoveryRequest,
      response: {
        202: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const parsed = accountRecoveryRequestSchema.safeParse(request.body)
    const oldPhone = parsed.success
      ? readPhoneNumber({ phoneNumber: parsed.data.oldPhoneNumber })
      : null
    const newPhone = parsed.success
      ? readPhoneNumber({ phoneNumber: parsed.data.newPhoneNumber })
      : null
    const code = parsed.success ? readVerificationCode(parsed.data) : null
    const recovery = services.accountRecoveryService
    if (!oldPhone || !newPhone || !code || !recovery) return reply.code(202).send({ ok: true })
    try {
      await recovery.request({ oldPhoneNumber: oldPhone.e164, newPhoneNumber: newPhone.e164, verificationCode: code })
    } catch (error) {
      if (isAuthError(error)) return reply.code(401).send({ code: error.code, error: error.message })
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

function readProfilePrompts(
  body: Record<string, unknown>
): UserProfilePrompt[] | undefined {
  if (!Object.hasOwn(body, "prompts")) return undefined
  if (!Array.isArray(body.prompts)) {
    throw new PublicRequestError("Profile prompts must be a list.")
  }
  return body.prompts.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new PublicRequestError("Choose a valid profile prompt.")
    }
    const prompt = candidate as Record<string, unknown>
    if (
      typeof prompt.promptId !== "string" ||
      typeof prompt.answer !== "string"
    ) {
      throw new PublicRequestError("Choose a valid profile prompt.")
    }
    return {
      promptId: prompt.promptId,
      answer: prompt.answer
    } as UserProfilePrompt
  })
}
