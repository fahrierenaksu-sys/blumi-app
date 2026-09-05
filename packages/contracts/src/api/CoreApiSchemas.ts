import { z } from "zod"
import { CONNECTION_DECISION_STATUSES } from "../connections/ConnectionDecision"
import { REPORT_REASONS } from "../safety/ReportReason"

/**
 * Runtime parsers and JSON Schema fragments for the authenticated core API.
 *
 * Fastify consumes the JSON Schema values while the server uses the Zod
 * parsers at its trust boundary. Keeping them here makes the public contract
 * available to mobile, OpenAPI, and server code without importing server-only
 * services into the shared package.
 */

const nonEmptyString = z.string().trim().min(1)

export const connectionDecisionRequestSchema = z.object({
  miniRoomId: nonEmptyString,
  partnerUserId: nonEmptyString,
  status: z.enum(CONNECTION_DECISION_STATUSES)
})

export const blockUserRequestSchema = z.object({
  blockedUserId: nonEmptyString
})

export const reportUserRequestSchema = z.object({
  reportedUserId: nonEmptyString,
  reason: z.enum(REPORT_REASONS),
  note: z.string().optional()
}).strict()

export const notificationPreferencesPatchSchema = z.object({
  likesEnabled: z.boolean().optional(),
  messagesEnabled: z.boolean().optional(),
  matchesEnabled: z.boolean().optional(),
  discoveryWatchEnabled: z.boolean().optional(),
  quietHours: z.object({
    startMinute: z.number().int(),
    endMinute: z.number().int()
  }).nullable().optional(),
  quietHoursUtcOffsetMinutes: z.number().int().optional(),
  quietHoursTimeZone: z.string().max(100).nullable().optional(),
  maxPushesPerHour: z.number().int().optional()
})

export const deviceRegistrationRequestSchema = z.object({
  platform: z.enum(["ios", "android"]),
  pushToken: nonEmptyString
})

export const deviceRemovalRequestSchema = z.object({
  pushToken: nonEmptyString
})

export const personalRoomDecorSaveRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  decor: z.unknown()
})

export const createThreadRequestSchema = z.object({
  participantUserIds: z.array(z.string())
})

export const sendChatMessageRequestSchema = z.object({
  body: z.string(),
  clientMessageId: z.string().optional()
})

export const listChatMessagesQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.union([z.string(), z.number()]).optional()
})

export const roomInviteDecisionRequestSchema = z.object({
  status: z.enum(["accepted", "declined"])
})

export const accountConfirmationRequestSchema = z.object({
  confirmationToken: nonEmptyString
})

export const verificationCodeRequestSchema = z.object({
  verificationCode: z.string()
})

export const onboardingStepRequestSchema = z.object({
  step: z.enum(["profile", "avatar", "room"])
})

export const phoneNumberRequestSchema = z.object({
  phoneNumber: z.string()
})

export const phoneChangeNewChallengeRequestSchema = z.object({
  phoneNumber: z.string(),
  currentPhoneConfirmationToken: nonEmptyString
})

export const phoneChangeConfirmRequestSchema = z.object({
  currentPhoneConfirmationToken: nonEmptyString,
  newPhoneConfirmationToken: nonEmptyString
})

export const accountRecoveryRequestSchema = z.object({
  oldPhoneNumber: z.string(),
  newPhoneNumber: z.string(),
  verificationCode: z.string()
})

export const authPhoneRequestSchema = z.object({
  phoneNumber: z.string()
})

export const authVerificationRequestSchema = authPhoneRequestSchema.extend({
  verificationCode: z.string()
})

export const registerAccountRequestSchema = authVerificationRequestSchema.extend({
  termsAcceptance: z.object({
    version: nonEmptyString,
    locale: z.enum(["en", "tr"])
  })
})

const commerceTransactionIdSchema = z.string().trim().min(1).max(255)

export const commerceReconcileRequestSchema = z.object({
  transactionIds: z.array(commerceTransactionIdSchema).min(1).max(10)
}).refine((value) => new Set(value.transactionIds).size === value.transactionIds.length, {
  message: "Transaction IDs must be unique."
})

export const revenueCatWebhookRequestSchema = z.object({
  event: z.record(z.unknown())
}).passthrough()

export const discoverProfileParamsSchema = z.object({
  userId: nonEmptyString
})

export const discoverDeckQuerySchema = z.object({
  ageMin: z.string().optional(),
  ageMax: z.string().optional(),
  gender: z.union([z.string(), z.array(z.string())]).optional(),
  vibe: z.union([z.string(), z.array(z.string())]).optional(),
  cursor: z.string().max(515).optional(),
  limit: z.string().optional()
})

export const errorResponseJsonSchema = {
  type: "object",
  required: ["error"],
  properties: {
    code: { type: "string" },
    error: { type: "string" },
    statusCode: { type: "integer" },
    requestId: { type: "string" }
  },
  additionalProperties: true
} as const

export const successResponseJsonSchema = {
  type: "object",
  additionalProperties: true
} as const

export const noContentResponseJsonSchema = {
  type: "null"
} as const

const trimmedStringJsonSchema = {
  type: "string",
  minLength: 1
} as const

export const coreApiJsonSchemas = {
  connectionDecision: {
    type: "object",
    required: ["miniRoomId", "partnerUserId", "status"],
    properties: {
      miniRoomId: trimmedStringJsonSchema,
      partnerUserId: trimmedStringJsonSchema,
      status: { type: "string", enum: [...CONNECTION_DECISION_STATUSES] }
    },
    additionalProperties: false
  },
  blockUser: {
    type: "object",
    required: ["blockedUserId"],
    properties: { blockedUserId: trimmedStringJsonSchema },
    additionalProperties: false
  },
  reportUser: {
    type: "object",
    required: ["reportedUserId", "reason"],
    properties: {
      reportedUserId: trimmedStringJsonSchema,
      reason: { type: "string", enum: [...REPORT_REASONS] },
      note: { type: "string" }
    },
    additionalProperties: false
  },
  notificationPreferences: {
    type: "object",
    properties: {
      likesEnabled: { type: "boolean" },
      messagesEnabled: { type: "boolean" },
      matchesEnabled: { type: "boolean" },
      discoveryWatchEnabled: { type: "boolean" },
      quietHours: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            required: ["startMinute", "endMinute"],
            properties: {
              startMinute: { type: "integer" },
              endMinute: { type: "integer" }
            },
            additionalProperties: false
          }
        ]
      },
      quietHoursUtcOffsetMinutes: { type: "integer" },
      quietHoursTimeZone: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
      maxPushesPerHour: { type: "integer" }
    },
    additionalProperties: false
  },
  deviceRegistration: {
    type: "object",
    required: ["platform", "pushToken"],
    properties: {
      platform: { type: "string", enum: ["ios", "android"] },
      pushToken: trimmedStringJsonSchema
    },
    additionalProperties: false
  },
  deviceRemoval: {
    type: "object",
    required: ["pushToken"],
    properties: { pushToken: trimmedStringJsonSchema },
    additionalProperties: false
  },
  personalRoomDecorSave: {
    type: "object",
    required: ["expectedRevision", "decor"],
    properties: {
      expectedRevision: { type: "integer", minimum: 0 },
      decor: { type: "object" }
    },
    additionalProperties: false
  },
  createThread: {
    type: "object",
    required: ["participantUserIds"],
    properties: {
      participantUserIds: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 2
      }
    },
    additionalProperties: false
  },
  sendChatMessage: {
    type: "object",
    required: ["body"],
    properties: {
      body: { type: "string" },
      clientMessageId: { type: "string" }
    },
    additionalProperties: false
  },
  listChatMessagesQuery: {
    type: "object",
    properties: {
      before: { type: "string" },
      limit: { anyOf: [{ type: "string" }, { type: "number" }] }
    },
    additionalProperties: false
  },
  roomInviteDecision: {
    type: "object",
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["accepted", "declined"] }
    },
    additionalProperties: false
  },
  accountConfirmation: {
    type: "object",
    required: ["confirmationToken"],
    properties: { confirmationToken: trimmedStringJsonSchema },
    additionalProperties: false
  },
  verificationCode: {
    type: "object",
    required: ["verificationCode"],
    properties: { verificationCode: { type: "string" } },
    additionalProperties: false
  },
  onboardingStep: {
    type: "object",
    required: ["step"],
    properties: {
      step: { type: "string", enum: ["profile", "avatar", "room"] }
    },
    additionalProperties: false
  },
  phoneNumber: {
    type: "object",
    required: ["phoneNumber"],
    properties: { phoneNumber: { type: "string" } },
    additionalProperties: false
  },
  phoneChangeNewChallenge: {
    type: "object",
    required: ["phoneNumber", "currentPhoneConfirmationToken"],
    properties: {
      phoneNumber: { type: "string" },
      currentPhoneConfirmationToken: trimmedStringJsonSchema
    },
    additionalProperties: false
  },
  phoneChangeConfirm: {
    type: "object",
    required: ["currentPhoneConfirmationToken", "newPhoneConfirmationToken"],
    properties: {
      currentPhoneConfirmationToken: trimmedStringJsonSchema,
      newPhoneConfirmationToken: trimmedStringJsonSchema
    },
    additionalProperties: false
  },
  accountRecoveryRequest: {
    type: "object",
    required: ["oldPhoneNumber", "newPhoneNumber", "verificationCode"],
    properties: {
      oldPhoneNumber: { type: "string" },
      newPhoneNumber: { type: "string" },
      verificationCode: { type: "string" }
    },
    additionalProperties: false
  },
  authPhone: {
    type: "object",
    required: ["phoneNumber"],
    properties: { phoneNumber: { type: "string" } },
    additionalProperties: false
  },
  authVerification: {
    type: "object",
    required: ["phoneNumber", "verificationCode"],
    properties: {
      phoneNumber: { type: "string" },
      verificationCode: { type: "string" }
    },
    additionalProperties: false
  },
  registerAccount: {
    type: "object",
    required: ["phoneNumber", "verificationCode", "termsAcceptance"],
    properties: {
      phoneNumber: { type: "string" },
      verificationCode: { type: "string" },
      termsAcceptance: {
        type: "object",
        required: ["version", "locale"],
        properties: {
          version: trimmedStringJsonSchema,
          locale: { type: "string", enum: ["en", "tr"] }
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  },
  commerceReconcile: {
    type: "object",
    required: ["transactionIds"],
    properties: {
      transactionIds: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        uniqueItems: true,
        items: { ...trimmedStringJsonSchema, maxLength: 255 }
      }
    },
    additionalProperties: false
  },
  revenueCatWebhook: {
    type: "object",
    required: ["event"],
    properties: {
      event: { type: "object", additionalProperties: true }
    },
    additionalProperties: true
  },
  discoverProfileParams: {
    type: "object",
    required: ["userId"],
    properties: { userId: trimmedStringJsonSchema },
    additionalProperties: false
  },
  discoverDeckQuery: {
    type: "object",
    properties: {
      ageMin: { type: "string", pattern: "^\\d{1,3}$" },
      ageMax: { type: "string", pattern: "^\\d{1,3}$" },
      gender: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
      vibe: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
      cursor: { type: "string", maxLength: 515 },
      limit: { type: "string", pattern: "^\\d{1,5}$" }
    },
    additionalProperties: false
  },
  object: {
    type: "object",
    additionalProperties: true
  },
  pathId: {
    type: "object",
    required: ["threadId"],
    properties: { threadId: trimmedStringJsonSchema },
    additionalProperties: false
  }
} as const

export const authenticatedErrorResponses = {
  400: errorResponseJsonSchema,
  401: errorResponseJsonSchema,
  403: errorResponseJsonSchema,
  404: errorResponseJsonSchema,
  409: errorResponseJsonSchema,
  429: errorResponseJsonSchema,
  503: errorResponseJsonSchema,
  500: errorResponseJsonSchema
} as const

export type ConnectionDecisionRequest = z.infer<typeof connectionDecisionRequestSchema>
export type BlockUserRequest = z.infer<typeof blockUserRequestSchema>
export type ReportUserRequest = z.infer<typeof reportUserRequestSchema>
export type NotificationPreferencesPatch = z.infer<typeof notificationPreferencesPatchSchema>
export type DeviceRegistrationRequest = z.infer<typeof deviceRegistrationRequestSchema>
export type PersonalRoomDecorSaveRequest = z.infer<typeof personalRoomDecorSaveRequestSchema>
export type CreateThreadRequest = z.infer<typeof createThreadRequestSchema>
export type SendChatMessageRequest = z.infer<typeof sendChatMessageRequestSchema>
export type RoomInviteDecisionRequest = z.infer<typeof roomInviteDecisionRequestSchema>
export type OnboardingStepRequest = z.infer<typeof onboardingStepRequestSchema>
export type PhoneNumberRequest = z.infer<typeof phoneNumberRequestSchema>
export type PhoneChangeNewChallengeRequest = z.infer<typeof phoneChangeNewChallengeRequestSchema>
export type PhoneChangeConfirmRequest = z.infer<typeof phoneChangeConfirmRequestSchema>
export type AccountRecoveryRequest = z.infer<typeof accountRecoveryRequestSchema>
export type AuthPhoneRequest = z.infer<typeof authPhoneRequestSchema>
export type AuthVerificationRequest = z.infer<typeof authVerificationRequestSchema>
export type RegisterAccountRequest = z.infer<typeof registerAccountRequestSchema>
export type CommerceReconcileRequest = z.infer<typeof commerceReconcileRequestSchema>
export type RevenueCatWebhookRequest = z.infer<typeof revenueCatWebhookRequestSchema>
export type DiscoverProfileParams = z.infer<typeof discoverProfileParamsSchema>
export type DiscoverDeckQuery = z.infer<typeof discoverDeckQuerySchema>
