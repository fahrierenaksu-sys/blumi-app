import { z } from "zod"

const isoDateSchema = z.string().datetime({
  offset: true,
  message: "Expected an ISO-compatible date."
})

const avatarItemIdSchema = z.string().min(1).max(120)

const avatarAccessoryIdsSchema = z.array(avatarItemIdSchema)
  .max(6)
  .refine(
    (accessoryIds) => new Set(accessoryIds).size === accessoryIds.length,
    "Avatar accessories must be unique."
  )

const avatarLoadoutCommonShape = {
  bodyId: avatarItemIdSchema,
  faceId: avatarItemIdSchema,
  eyesId: avatarItemIdSchema,
  noseId: avatarItemIdSchema,
  mouthId: avatarItemIdSchema,
  hairId: avatarItemIdSchema,
  topId: avatarItemIdSchema,
  bottomId: avatarItemIdSchema,
  shoesId: avatarItemIdSchema,
  accessoryIds: avatarAccessoryIdsSchema
}

const avatarLoadoutSchema = z.discriminatedUnion("schemaVersion", [
  z.object({
    schemaVersion: z.literal(1),
    ...avatarLoadoutCommonShape
  }).strict(),
  z.object({
    schemaVersion: z.literal(2),
    ...avatarLoadoutCommonShape,
    dressId: avatarItemIdSchema.nullable(),
    outerwearId: avatarItemIdSchema.nullable()
  }).strict()
])

const completeAvatarSelectionSchema = z
  .object({
    presetId: avatarItemIdSchema,
    revision: z.number().int().nonnegative(),
    loadout: avatarLoadoutSchema
  })
  .refine((avatar) => avatar.presetId === avatar.loadout.bodyId, {
    message: "Avatar preset must match its body."
  })

export const chatParticipantSummarySchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().optional(),
  avatar: completeAvatarSelectionSchema.optional()
})

const chatMessageShape = {
  messageId: z.string().min(1),
  threadId: z.string().min(1),
  senderUserId: z.string().min(1),
  body: z.string().min(1),
  sentAt: isoDateSchema,
  deliveredAt: isoDateSchema.optional(),
  readAt: isoDateSchema.optional(),
  editedAt: isoDateSchema.optional()
}

function refineChatMessageTimes(
  message: { sentAt: string; deliveredAt?: string; readAt?: string; editedAt?: string },
  context: z.RefinementCtx
): void {
  const sentAt = Date.parse(message.sentAt)
  const deliveredAt = message.deliveredAt
    ? Date.parse(message.deliveredAt)
    : undefined
  const readAt = message.readAt ? Date.parse(message.readAt) : undefined
  const editedAt = message.editedAt ? Date.parse(message.editedAt) : undefined

  if (deliveredAt !== undefined && deliveredAt < sentAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["deliveredAt"],
      message: "Delivery cannot precede sending."
    })
  }
  if (readAt !== undefined && readAt < (deliveredAt ?? sentAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["readAt"],
      message: "Read cannot precede delivery."
    })
  }
  if (
    editedAt !== undefined &&
    (editedAt < sentAt || editedAt - sentAt >= 5 * 60 * 1_000)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["editedAt"],
      message: "Edit must stay inside the five-minute window."
    })
  }
}

export const chatMessageSchema = z.object(chatMessageShape).strict().superRefine(refineChatMessageTimes)

/**
 * `chat.message_received` payload. The optional `clientMessageId` is present
 * only on the acknowledgement sent to the socket that sent the message with
 * that id (in-room sends, 2026-09-30); the fanout copy never carries it, so
 * clients that predate the field never receive it.
 */
export const chatMessageReceivedSchema = z.object({
  ...chatMessageShape,
  clientMessageId: z.string().min(1).max(128).optional()
}).strict().superRefine(refineChatMessageTimes)

/** Message ids are server generated; the bound keeps hostile input small. */
const chatMessageIdSchema = z.string().min(1).max(256)

export const chatReceiptCursorSchema = z.object({
  sentAt: isoDateSchema,
  messageId: chatMessageIdSchema.optional()
})

export const chatPartnerReceiptsSchema = z.object({
  deliveredUpTo: chatReceiptCursorSchema.optional(),
  readUpTo: chatReceiptCursorSchema.optional()
})

export const chatThreadSchema = z.object({
  threadId: z.string().min(1),
  miniRoomId: z.string().min(1),
  participantUserIds: z.tuple([z.string().min(1), z.string().min(1)]),
  participants: z.tuple([
    chatParticipantSummarySchema,
    chatParticipantSummarySchema
  ]),
  createdAt: isoDateSchema,
  lastMessage: chatMessageSchema.optional(),
  unreadCount: z.number().int().nonnegative().optional(),
  lastReadAt: isoDateSchema.optional(),
  partnerReceipts: chatPartnerReceiptsSchema.optional(),
  hiddenThrough: isoDateSchema.optional()
})

export const chatThreadListSchema = z.object({
  userId: z.string().min(1),
  threads: z.array(chatThreadSchema),
  nextCursor: z.string().min(1).nullable().optional(),
  append: z.boolean().optional()
})

export const chatMessageListSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  messages: z.array(chatMessageSchema),
  partnerReceipts: chatPartnerReceiptsSchema.optional()
})

/** `chat.receipt_updated`: only the other participant may receive it. */
export const chatReceiptUpdatedSchema = z.object({
  threadId: z.string().min(1),
  userId: z.string().min(1),
  participantUserIds: z.tuple([z.string().min(1), z.string().min(1)]),
  deliveredUpTo: chatReceiptCursorSchema.optional(),
  readUpTo: chatReceiptCursorSchema.optional()
}).superRefine((payload, context) => {
  if (!payload.deliveredUpTo && !payload.readUpTo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["deliveredUpTo"],
      message: "A receipt update moves at least one cursor."
    })
  }
  if (!payload.participantUserIds.includes(payload.userId) ||
      payload.participantUserIds[0] === payload.participantUserIds[1]) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["userId"],
      message: "The receipt belongs to one of two distinct participants."
    })
  }
})

/** Client `chat.ack_delivered` payload, validated by the server. */
export const chatAckDeliveredCommandSchema = z.object({
  threadId: z.string().min(1).max(256),
  upToMessageId: chatMessageIdSchema
}).strict()

export const CHAT_TYPING_STATES = ["start", "stop"] as const
/** Upper bound for a `start`'s lifetime; the server sends 6 s today. */
export const CHAT_TYPING_MAX_EXPIRES_MS = 15_000

/** Client `chat.typing` payload, validated by the server. Never carries text. */
export const chatTypingCommandSchema = z.object({
  threadId: z.string().min(1).max(256),
  state: z.enum(CHAT_TYPING_STATES)
}).strict()

/** `chat.typing_updated`: only the other participant may receive it. */
export const chatTypingUpdatedSchema = z.object({
  threadId: z.string().min(1),
  userId: z.string().min(1),
  state: z.enum(CHAT_TYPING_STATES),
  expiresInMs: z.number().int().min(0).max(CHAT_TYPING_MAX_EXPIRES_MS)
}).superRefine((payload, context) => {
  if (payload.state === "start" && payload.expiresInMs === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiresInMs"],
      message: "A typing start must lapse after a positive time."
    })
  }
})

export const chatPreferencesSchema = z.object({
  readReceiptsEnabled: z.boolean()
})

export const chatPreferencesEnvelopeSchema = z.object({
  preferences: chatPreferencesSchema
})

export const chatThreadReadSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  readAt: isoDateSchema
})

/** Response of `POST /v1/threads/:threadId/hide`: hidden for `userId` only. */
export const chatThreadHiddenSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  hiddenThrough: isoDateSchema,
  readAt: isoDateSchema
})

export const chatThreadEnvelopeSchema = z.object({
  thread: chatThreadSchema
})

export const chatMessageEnvelopeSchema = z.object({
  message: chatMessageSchema
})
