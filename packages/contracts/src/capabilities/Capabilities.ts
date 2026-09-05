import { z } from "zod"

export const CAPABILITY_KEYS = [
  "db_avatar_loadout_v2_ready",
  "db_public_card_ready",
  "db_chat_metadata_ready",
  "db_room_snapshot_ready",
  "avatar_loadout_v2_read",
  "avatar_loadout_v2_write",
  "avatar_dress_outerwear_render",
  "shop_multi_item_apply",
  "card_theme_economy",
  "discovery_card_flip",
  "discovery_public_profile",
  "discovery_badges",
  "discovery_room_showcase",
  "card_studio",
  "chat_typing",
  "chat_presence",
  "chat_read_receipts",
  "chat_message_edit",
  "room_chat_bubbles_v2",
  "room_editor_v2"
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]
export type CapabilityMap = Readonly<Record<CapabilityKey, boolean>>

export const capabilityKeySchema = z.enum(CAPABILITY_KEYS)

export const capabilityResolutionRequestSchema = z.preprocess(
  (value) => value === undefined ? {} : value,
  z.object({
    declaredCapabilities: z.array(capabilityKeySchema)
      .max(CAPABILITY_KEYS.length)
      .refine(
        (keys) => new Set(keys).size === keys.length,
        "Capability declarations must be unique."
      )
      .optional()
  }).strict()
)

export type CapabilityResolutionRequest = z.infer<
  typeof capabilityResolutionRequestSchema
>

export interface CapabilityResolution {
  legacy: boolean
  capabilities: CapabilityMap
}
