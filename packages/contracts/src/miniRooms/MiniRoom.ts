import { z } from "zod";

export interface MiniRoom {
  miniRoomId: string;
  lobbyRoomId: string;
  /** Present when this room was created from an existing mutual-match chat. */
  sourceThreadId?: string;
  participantUserIds: [string, string];
  livekitRoomName: string;
  /** Immutable server snapshot captured when the invite was accepted. Absent on legacy rooms. */
  sharedDecor?: SharedRoomDecorSnapshot;
}

const sharedDecorId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/);
export const sharedRoomDecorSnapshotSchema = z.object({
  ownerUserId: sharedDecorId,
  revision: z.number().int().nonnegative(),
  capturedAt: z.string().datetime({ offset: true }),
  source: z.enum(["inviter", "default"]),
  decor: z.object({
    schemaVersion: z.number().int().positive().optional(),
    geometryVersion: sharedDecorId.optional(),
    migration: z.object({ fromSchemaVersion: z.number().int().positive(), sourceShellId: sharedDecorId }).strict().optional(),
    roomShellId: sharedDecorId,
    placedItems: z.array(z.object({
      instanceId: sharedDecorId, itemId: sharedDecorId,
      x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
      rotation: z.enum(["front", "back", "left", "right"]),
      depth: z.number().finite().optional(), width: z.number().finite().positive().optional(), height: z.number().finite().positive().optional()
    }).strict()).max(60)
  }).strict()
}).strict();
export type SharedRoomDecorSnapshot = z.infer<typeof sharedRoomDecorSnapshotSchema>;
