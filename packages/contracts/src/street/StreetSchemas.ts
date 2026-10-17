import { z } from "zod"
import { chatParticipantSummarySchema } from "../chat/ChatThreadSchemas"

/**
 * Sokağım (the Chats tab street, 2026-10-17). One window per active mutual
 * match: the partner's saved room layout, their loadout and at most one
 * "changed since yesterday" label. The shape never carries timestamps,
 * presence or user ids (spec §2): the label says only that something changed
 * during the previous edition, never when.
 */
export const STREET_CHANGE_KINDS = [
  "guest",
  "dress",
  "outfit",
  "hair",
  "shoes",
  "accessory",
  "rug",
  "bed",
  "seat",
  "wall",
  "shelf",
  "item",
  "layout"
] as const

export type StreetChangeKind = (typeof STREET_CHANGE_KINDS)[number]
export const streetChangeKindSchema = z.enum(STREET_CHANGE_KINDS)

/** Hard cap on windows in one street response (spec §5). */
export const STREET_MAX_WINDOWS = 50

const streetAvatarSchema = chatParticipantSummarySchema.shape.avatar.unwrap()

export const streetRoomPlacementSchema = z.object({
  itemId: z.string().min(1).max(160),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.enum(["front", "back", "left", "right"])
}).strict()

/** Only what the renderer draws: no revision, instance id or other internal version. */
export const streetRoomSchema = z.object({
  roomShellId: z.string().min(1).max(160),
  placedItems: z.array(streetRoomPlacementSchema).max(80)
}).strict()

export const streetWindowSchema = z.object({
  threadId: z.string().min(1),
  displayName: z.string().max(80).nullable(),
  closed: z.boolean(),
  avatar: streetAvatarSchema.nullable(),
  room: streetRoomSchema.nullable(),
  change: streetChangeKindSchema.nullable(),
  unread: z.number().int().nonnegative()
}).strict()

export const streetSelfSchema = z.object({
  closed: z.boolean(),
  room: streetRoomSchema.nullable()
}).strict()

export const streetResponseSchema = z.object({
  /** Edition day (YYYY-MM-DD); a new one starts at 05:00 Europe/Istanbul. */
  edition: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  self: streetSelfSchema,
  windows: z.array(streetWindowSchema).max(STREET_MAX_WINDOWS)
}).strict()

export const streetVisibilityRequestSchema = z.object({
  closed: z.boolean()
}).strict()

export type StreetRoom = z.infer<typeof streetRoomSchema>
export type StreetWindow = z.infer<typeof streetWindowSchema>
export type StreetSelf = z.infer<typeof streetSelfSchema>
export type StreetResponse = z.infer<typeof streetResponseSchema>
