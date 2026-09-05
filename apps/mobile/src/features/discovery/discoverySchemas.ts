import { z } from "zod"

const isoDateSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)))

export const discoveryQuotaSchema = z.object({
  limit: z.number().int().min(10),
  extensionDecisions: z.number().int().min(0),
  used: z.number().int().min(0),
  remaining: z.number().int().min(0),
  resetsAt: isoDateSchema,
  rewardedAd: z.object({
    available: z.boolean(),
    extensionDecisions: z.literal(10)
  })
})

export const discoveryWatchSchema = z.object({
  userId: z.string(),
  status: z.literal("active"),
  preferences: z.object({
    ageMin: z.number().int(),
    ageMax: z.number().int(),
    genders: z.array(z.enum(["woman", "man"])),
    vibes: z.array(z.string())
  }),
  updatedAt: isoDateSchema,
  expiresAt: isoDateSchema
})

export const discoveryDecisionSchema = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  decision: z.enum(["like", "pass"]),
  decidedAt: z.string()
})

export const serverMatchSchema = z.object({
  matchId: z.string(),
  participantUserIds: z.tuple([z.string(), z.string()]),
  matchedAt: z.string()
})
