import { z } from "zod"
const id = z.string().min(1).max(128)
export const miniRoomSceneCommandSchema = z.object({ miniRoomId: id }).strict()
export const miniRoomMoveSchema = z.object({
  miniRoomId: id, sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1), hotspotId: id.optional()
}).strict()
export type MiniRoomMove = z.infer<typeof miniRoomMoveSchema>
export const miniRoomAvatarMotionSchema = z.object({
  userId: id, x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
  present: z.boolean(), revision: z.number().int().nonnegative(),
  /** The exclusive hotspot (seat) this participant holds. At most one participant holds a given id. */
  hotspotId: id.optional(),
  /**
   * 2026-10-01, additive: the server refused this participant's claim on the hotspot because the
   * other participant held it first. The avatar stands beside that hotspot instead. Older clients
   * strip the field and walk to the record's point.
   */
  deniedHotspotId: id.optional()
})
export type MiniRoomAvatarMotion = z.infer<typeof miniRoomAvatarMotionSchema>
export const miniRoomMotionSnapshotSchema = z.object({
  miniRoomId: id, epoch: id, participantUserIds: z.tuple([id, id]), avatars: z.array(miniRoomAvatarMotionSchema).length(2)
}).refine(value => new Set(value.participantUserIds).size === 2 &&
  new Set(value.avatars.map(avatar => avatar.userId)).size === 2 &&
  value.avatars.every(avatar => value.participantUserIds.includes(avatar.userId)), "Expected the room participants.")
export type MiniRoomMotionSnapshot = z.infer<typeof miniRoomMotionSnapshotSchema>
export const miniRoomAvatarMovedSchema = z.object({
  miniRoomId: id, epoch: id, participantUserIds: z.tuple([id, id]), avatar: miniRoomAvatarMotionSchema
}).refine(value => new Set(value.participantUserIds).size === 2 &&
  value.participantUserIds.includes(value.avatar.userId), "Expected a room participant.")
/** 2026-10-01: this socket's scene was taken over by the same account's newer scene entry. */
export const miniRoomSceneSupersededSchema = z.object({ miniRoomId: id })
export type MiniRoomSceneSuperseded = z.infer<typeof miniRoomSceneSupersededSchema>
