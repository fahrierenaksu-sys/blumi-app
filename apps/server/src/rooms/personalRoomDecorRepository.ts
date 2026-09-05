export type PersonalRoomRotation = "front" | "back" | "left" | "right"

export interface PersonalRoomPlacedItem {
  instanceId: string
  itemId: string
  x: number
  y: number
  rotation: PersonalRoomRotation
  depth?: number
  width?: number
  height?: number
}

export interface PersonalRoomDecor {
  schemaVersion?: number
  geometryVersion?: string
  migration?: {
    fromSchemaVersion: number
    sourceShellId: string
  }
  roomShellId: string
  placedItems: PersonalRoomPlacedItem[]
}

export interface PersonalRoomDecorSnapshot {
  userId: string
  revision: number
  decor: PersonalRoomDecor
  updatedAt: string
}

export interface PersonalRoomDecorRepository {
  get(userId: string): Promise<PersonalRoomDecorSnapshot | null>
  save(input: {
    userId: string
    expectedRevision: number
    decor: PersonalRoomDecor
    updatedAt: string
  }): Promise<
    | { kind: "saved"; snapshot: PersonalRoomDecorSnapshot }
    | { kind: "conflict"; current: PersonalRoomDecorSnapshot }
  >
}

export function createInMemoryPersonalRoomDecorRepository():
PersonalRoomDecorRepository {
  let snapshots = new Map<string, PersonalRoomDecorSnapshot>()

  return {
    async get(userId) {
      const snapshot = snapshots.get(userId)
      return snapshot ? clonePersonalRoomDecorSnapshot(snapshot) : null
    },
    async save(input) {
      const current = snapshots.get(input.userId)
      const currentRevision = current?.revision ?? 0
      if (currentRevision !== input.expectedRevision) {
        return {
          kind: "conflict",
          current: clonePersonalRoomDecorSnapshot(current!)
        }
      }
      const snapshot: PersonalRoomDecorSnapshot = {
        userId: input.userId,
        revision: currentRevision + 1,
        decor: clonePersonalRoomDecor(input.decor),
        updatedAt: input.updatedAt
      }
      snapshots = new Map(snapshots)
      snapshots.set(input.userId, snapshot)
      return {
        kind: "saved",
        snapshot: clonePersonalRoomDecorSnapshot(snapshot)
      }
    }
  }
}

export function clonePersonalRoomDecor(
  decor: PersonalRoomDecor
): PersonalRoomDecor {
  return {
    ...decor,
    ...(decor.migration
      ? { migration: { ...decor.migration } }
      : {}),
    placedItems: decor.placedItems.map((item) => ({ ...item }))
  }
}

export function clonePersonalRoomDecorSnapshot(
  snapshot: PersonalRoomDecorSnapshot
): PersonalRoomDecorSnapshot {
  return {
    ...snapshot,
    decor: clonePersonalRoomDecor(snapshot.decor)
  }
}
