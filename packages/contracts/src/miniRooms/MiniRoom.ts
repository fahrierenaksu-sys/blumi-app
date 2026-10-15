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

/** Most placed items one shared-room snapshot carries on the wire (the personal room saves at most this many). */
export const MAX_SHARED_ROOM_DECOR_ITEMS = 60;
/**
 * Defensive bound for the stored row only. The row also holds retired and held placements the host's room carried
 * over, so it can exceed the wire cap until the read projection leaves them out.
 */
export const MAX_STORED_SHARED_ROOM_DECOR_ITEMS = 1024;

function createSharedRoomDecorSnapshotSchema(maxPlacedItems: number) {
  return z.object({
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
      }).strict()).max(maxPlacedItems)
    }).strict()
  }).strict();
}

export const sharedRoomDecorSnapshotSchema = createSharedRoomDecorSnapshotSchema(MAX_SHARED_ROOM_DECOR_ITEMS);
/** Parses the stored row before the active-item projection; the wire schema above checks what is sent. */
export const storedSharedRoomDecorSnapshotSchema = createSharedRoomDecorSnapshotSchema(MAX_STORED_SHARED_ROOM_DECOR_ITEMS);
export type SharedRoomDecorSnapshot = z.infer<typeof sharedRoomDecorSnapshotSchema>;
