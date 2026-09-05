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

export const chatMessageSchema = z.object({
  messageId: z.string().min(1),
  threadId: z.string().min(1),
  senderUserId: z.string().min(1),
  body: z.string().min(1),
  sentAt: isoDateSchema,
  deliveredAt: isoDateSchema.optional(),
  readAt: isoDateSchema.optional(),
  editedAt: isoDateSchema.optional()
}).strict().superRefine((message, context) => {
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
  lastReadAt: isoDateSchema.optional()
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
  messages: z.array(chatMessageSchema)
})

export const chatThreadReadSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  readAt: isoDateSchema
})

export const chatThreadEnvelopeSchema = z.object({
  thread: chatThreadSchema
})

export const chatMessageEnvelopeSchema = z.object({
  message: chatMessageSchema
})
