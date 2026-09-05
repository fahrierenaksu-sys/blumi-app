import type { UserRoomDecor } from "./roomV2.types"

export interface RoomV2EditorSession {
  /** Snapshot used only to decide whether this editor entry has unsaved work. */
  baselineDecor: UserRoomDecor
  /** Last layout confirmed by the server, when that evidence exists. */
  persistedBaselineDecor?: UserRoomDecor
  draftDecor: UserRoomDecor
  undoDecor?: UserRoomDecor
  isDirty: boolean
  canUndo: boolean
  canResetToPersistedBaseline: boolean
}

export function createRoomV2EditorSession(
  entryDecor: UserRoomDecor,
  persistedBaselineDecor?: UserRoomDecor
): RoomV2EditorSession {
  return buildSession({
    baselineDecor: copyDecor(entryDecor),
    persistedBaselineDecor: persistedBaselineDecor
      ? copyDecor(persistedBaselineDecor)
      : undefined,
    draftDecor: copyDecor(entryDecor)
  })
}

export function applyRoomV2EditorDraft(
  session: RoomV2EditorSession,
  nextDecor: UserRoomDecor
): RoomV2EditorSession {
  if (areRoomV2DecorEqual(session.draftDecor, nextDecor)) return session

  return buildSession({
    baselineDecor: session.baselineDecor,
    persistedBaselineDecor: session.persistedBaselineDecor,
    draftDecor: nextDecor,
    undoDecor: session.draftDecor
  })
}

export function undoRoomV2EditorSession(
  session: RoomV2EditorSession
): RoomV2EditorSession {
  if (!session.undoDecor) return session

  return buildSession({
    baselineDecor: session.baselineDecor,
    persistedBaselineDecor: session.persistedBaselineDecor,
    draftDecor: session.undoDecor
  })
}

export function resetRoomV2EditorSession(
  session: RoomV2EditorSession
): RoomV2EditorSession {
  if (
    !session.persistedBaselineDecor ||
    areRoomV2DecorEqual(session.draftDecor, session.persistedBaselineDecor)
  ) {
    return session
  }

  return buildSession({
    baselineDecor: session.baselineDecor,
    persistedBaselineDecor: session.persistedBaselineDecor,
    draftDecor: session.persistedBaselineDecor,
    undoDecor: session.draftDecor
  })
}

export function updateRoomV2EditorPersistedBaseline(
  session: RoomV2EditorSession,
  persistedBaselineDecor?: UserRoomDecor
): RoomV2EditorSession {
  if (
    (!session.persistedBaselineDecor && !persistedBaselineDecor) ||
    (
      session.persistedBaselineDecor &&
      persistedBaselineDecor &&
      areRoomV2DecorEqual(session.persistedBaselineDecor, persistedBaselineDecor)
    )
  ) {
    return session
  }

  return buildSession({
    baselineDecor: session.baselineDecor,
    persistedBaselineDecor,
    draftDecor: session.draftDecor,
    undoDecor: session.undoDecor
  })
}

/** Call only after persistence has been positively confirmed by the server. */
export function markRoomV2EditorSessionSaved(
  _session: RoomV2EditorSession,
  persistedDecor: UserRoomDecor
): RoomV2EditorSession {
  return buildSession({
    baselineDecor: persistedDecor,
    persistedBaselineDecor: persistedDecor,
    draftDecor: persistedDecor
  })
}

export function areRoomV2DecorEqual(
  left: UserRoomDecor,
  right: UserRoomDecor
): boolean {
  return stableSerialize(left) === stableSerialize(right)
}

function buildSession(input: {
  baselineDecor: UserRoomDecor
  persistedBaselineDecor?: UserRoomDecor
  draftDecor: UserRoomDecor
  undoDecor?: UserRoomDecor
}): RoomV2EditorSession {
  const baselineDecor = copyDecor(input.baselineDecor)
  const persistedBaselineDecor = input.persistedBaselineDecor
    ? copyDecor(input.persistedBaselineDecor)
    : undefined
  const draftDecor = copyDecor(input.draftDecor)
  const undoDecor = input.undoDecor ? copyDecor(input.undoDecor) : undefined

  return {
    baselineDecor,
    persistedBaselineDecor,
    draftDecor,
    undoDecor,
    isDirty: !areRoomV2DecorEqual(baselineDecor, draftDecor),
    canUndo: Boolean(undoDecor),
    canResetToPersistedBaseline: Boolean(persistedBaselineDecor)
  }
}

function copyDecor(decor: UserRoomDecor): UserRoomDecor {
  return {
    ...decor,
    ...(decor.migration ? { migration: { ...decor.migration } } : {}),
    placedItems: decor.placedItems.map((item) => ({
      ...item,
      ...(item.supportLocalPosition
        ? { supportLocalPosition: { ...item.supportLocalPosition } }
        : {})
    }))
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}
