import { z } from "zod"
import {
  USER_PROFILE_PROMPT_OPTIONS,
  type UserProfilePrompt,
  type UserProfilePromptId
} from "../users/UserProfile"

export const PUBLIC_PROFILE_CARD_SCHEMA_VERSION = 1 as const
export const PUBLIC_PROFILE_CARD_MAX_BADGES = 3
export const ROOM_SHOWCASE_HEADLINE_MAX_LENGTH = 30
export const PUBLIC_BADGE_ID_MAX_LENGTH = 64

const promptIds = new Set<string>(
  USER_PROFILE_PROMPT_OPTIONS.map((option) => option.promptId)
)
const publicBadgeIdPattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/
const roomHeadlinePattern = /^[\p{L}\p{M}\p{N} .,!?'"’():&+\-]+$/u

const publicBadgeIdSchema = z.string()
  .min(1)
  .max(PUBLIC_BADGE_ID_MAX_LENGTH)
  .regex(publicBadgeIdPattern)

const selectedPromptIdSchema = z.custom<UserProfilePromptId>(
  (value) => typeof value === "string" && promptIds.has(value)
)

export function normalizeRoomShowcaseHeadline(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ")
}

const roomHeadlineSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value
  const normalized = normalizeRoomShowcaseHeadline(value)
  return normalized ? normalized : null
}, z.union([
  z.null(),
  z.string().superRefine((value, context) => {
    if (Array.from(value).length > ROOM_SHOWCASE_HEADLINE_MAX_LENGTH) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        type: "string",
        maximum: ROOM_SHOWCASE_HEADLINE_MAX_LENGTH,
        inclusive: true
      })
    }
    if (!roomHeadlinePattern.test(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Room headline contains unsupported characters."
      })
    }
  })
]))

export const publicProfileCardSchema = z.object({
  schemaVersion: z.literal(PUBLIC_PROFILE_CARD_SCHEMA_VERSION),
  selectedPromptId: selectedPromptIdSchema.nullable(),
  publicBadgeIds: z.array(publicBadgeIdSchema)
    .max(PUBLIC_PROFILE_CARD_MAX_BADGES)
    .superRefine((badgeIds, context) => {
      if (new Set(badgeIds).size !== badgeIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Public badge IDs must be unique."
        })
      }
    }),
  showRoomShowcase: z.boolean(),
  roomHeadline: roomHeadlineSchema
}).strict()

export interface PublicProfileCard {
  readonly schemaVersion: typeof PUBLIC_PROFILE_CARD_SCHEMA_VERSION
  readonly selectedPromptId: UserProfilePromptId | null
  readonly publicBadgeIds: readonly string[]
  readonly showRoomShowcase: boolean
  readonly roomHeadline: string | null
}

/**
 * Parses untrusted client/server data into a fresh immutable exact-shape value.
 * Unknown keys, IDs, duplicates and unsupported headline characters fail closed.
 */
export function parsePublicProfileCard(value: unknown): PublicProfileCard {
  const parsed = publicProfileCardSchema.parse(value)
  return Object.freeze({
    schemaVersion: parsed.schemaVersion,
    selectedPromptId: parsed.selectedPromptId,
    publicBadgeIds: Object.freeze([...parsed.publicBadgeIds]),
    showRoomShowcase: parsed.showRoomShowcase,
    roomHeadline: parsed.roomHeadline
  })
}

/**
 * The card stores only a selection ID. Projection resolves it against the
 * canonical profile so a removed or unavailable answer is never disclosed.
 */
export function resolveSelectedPublicPrompt(
  card: Pick<PublicProfileCard, "selectedPromptId">,
  prompts: readonly UserProfilePrompt[] | undefined
): UserProfilePrompt | null {
  if (!card.selectedPromptId || !prompts) return null
  const selected = prompts.find(
    (prompt) => prompt.promptId === card.selectedPromptId
  )
  return selected ? { ...selected } : null
}
