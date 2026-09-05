import type { PersonalRoomDecorSnapshot } from "./personalRoomDecorApi"
import type { UserRoomDecor } from "./roomV2.types"

export interface PersonalRoomSyncMetadata {
  revision: number
  decorJson: string
}

export function readPersonalRoomSyncMetadata(
  rawValue: string | null
): PersonalRoomSyncMetadata | null {
  if (!rawValue) return null
  try {
    const value: unknown = JSON.parse(rawValue)
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !Number.isSafeInteger((value as { revision?: unknown }).revision) ||
      Number((value as { revision: number }).revision) < 0 ||
      typeof (value as { decorJson?: unknown }).decorJson !== "string"
    ) {
      return null
    }
    return {
      revision: Number((value as { revision: number }).revision),
      decorJson: (value as { decorJson: string }).decorJson
    }
  } catch {
    return null
  }
}

export interface PersonalRoomHydrationResult {
  decor: UserRoomDecor | null
  revision: number
  lastSyncedDecorJson: string
  needsServerSave: boolean
  conflictRecovered: boolean
}

interface ResolvePersonalRoomHydrationInput {
  localDecor: UserRoomDecor | null
  serverSnapshot: PersonalRoomDecorSnapshot | null
  syncMetadata: PersonalRoomSyncMetadata | null
}

export function resolvePersonalRoomHydration({
  localDecor,
  serverSnapshot,
  syncMetadata
}: ResolvePersonalRoomHydrationInput): PersonalRoomHydrationResult {
  const localDecorJson = localDecor ? JSON.stringify(localDecor) : ""
  const hasPendingLocalChange = Boolean(
    localDecor &&
    (!syncMetadata || localDecorJson !== syncMetadata.decorJson)
  )

  if (hasPendingLocalChange) {
    const expectedRevision = syncMetadata?.revision ?? 0
    const serverRevision = serverSnapshot?.revision ?? 0

    if (serverRevision === expectedRevision) {
      return {
        decor: copyDecor(localDecor!),
        revision: expectedRevision,
        lastSyncedDecorJson: syncMetadata?.decorJson ?? "",
        needsServerSave: true,
        conflictRecovered: false
      }
    }

    if (serverSnapshot) {
      return fromServerSnapshot(serverSnapshot, true)
    }
  }

  if (serverSnapshot) {
    return fromServerSnapshot(serverSnapshot, false)
  }

  if (localDecor) {
    return {
      decor: copyDecor(localDecor),
      revision: 0,
      lastSyncedDecorJson: "",
      needsServerSave: true,
      conflictRecovered: false
    }
  }

  return {
    decor: null,
    revision: 0,
    lastSyncedDecorJson: "",
    needsServerSave: false,
    conflictRecovered: false
  }
}

function fromServerSnapshot(
  snapshot: PersonalRoomDecorSnapshot,
  conflictRecovered: boolean
): PersonalRoomHydrationResult {
  const decor = copyDecor(snapshot.decor)
  return {
    decor,
    revision: snapshot.revision,
    lastSyncedDecorJson: JSON.stringify(decor),
    needsServerSave: false,
    conflictRecovered
  }
}

function copyDecor(decor: UserRoomDecor): UserRoomDecor {
  return {
    ...decor,
    placedItems: decor.placedItems.map((item) => ({ ...item }))
  }
}
