import type { UserRoomDecor } from "./roomV2.types"

/**
 * The editor's draft and its local history. Undo and redo only move the draft
 * between snapshots on this device; Save still sends just the final draft and
 * the server decides what is kept.
 */
export interface RoomV2EditorSession {
  /** Snapshot used only to decide whether this editor entry has unsaved work. */
  baselineDecor: UserRoomDecor
  /** Last layout confirmed by the server, when that evidence exists. */
  persistedBaselineDecor?: UserRoomDecor
  draftDecor: UserRoomDecor
  /** The draft before the last change (the top of `undoStack`). */
  undoDecor?: UserRoomDecor
  /** Earlier drafts, oldest first, at most `historyLimit`. */
  undoStack: UserRoomDecor[]
  /** Undone drafts, the next redo last. Any new change clears it. */
  redoStack: UserRoomDecor[]
  /** How many steps undo can go back (1 keeps the single-step undo). */
  historyLimit: number
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  canResetToPersistedBaseline: boolean
}

/** The single-step undo every build has had; the 2.5D editor asks for more. */
export const ROOM_V2_EDITOR_DEFAULT_HISTORY_LIMIT = 1

export function createRoomV2EditorSession(
  entryDecor: UserRoomDecor,
  persistedBaselineDecor?: UserRoomDecor,
  options?: { historyLimit?: number }
): RoomV2EditorSession {
  return buildSession({
    baselineDecor: copyDecor(entryDecor),
    persistedBaselineDecor: persistedBaselineDecor
      ? copyDecor(persistedBaselineDecor)
      : undefined,
    draftDecor: copyDecor(entryDecor),
    historyLimit: options?.historyLimit ?? ROOM_V2_EDITOR_DEFAULT_HISTORY_LIMIT
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
    undoStack: [...session.undoStack, session.draftDecor],
    redoStack: [],
    historyLimit: session.historyLimit
  })
}

export function undoRoomV2EditorSession(
  session: RoomV2EditorSession
): RoomV2EditorSession {
  const previous = session.undoStack[session.undoStack.length - 1]
  if (!previous) return session

  return buildSession({
    baselineDecor: session.baselineDecor,
    persistedBaselineDecor: session.persistedBaselineDecor,
    draftDecor: previous,
    undoStack: session.undoStack.slice(0, -1),
    // single-step history keeps no redo, exactly as before
    redoStack: session.historyLimit > 1 ? [...session.redoStack, session.draftDecor] : [],
    historyLimit: session.historyLimit
  })
}

export function redoRoomV2EditorSession(
  session: RoomV2EditorSession
): RoomV2EditorSession {
  const next = session.redoStack[session.redoStack.length - 1]
  if (!next) return session

  return buildSession({
    baselineDecor: session.baselineDecor,
    persistedBaselineDecor: session.persistedBaselineDecor,
    draftDecor: next,
    undoStack: [...session.undoStack, session.draftDecor],
    redoStack: session.redoStack.slice(0, -1),
    historyLimit: session.historyLimit
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
    undoStack: [...session.undoStack, session.draftDecor],
    redoStack: [],
    historyLimit: session.historyLimit
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
    undoStack: session.undoStack,
    redoStack: session.redoStack,
    historyLimit: session.historyLimit
  })
}

/** Call only after persistence has been positively confirmed by the server. */
export function markRoomV2EditorSessionSaved(
  session: RoomV2EditorSession,
  persistedDecor: UserRoomDecor
): RoomV2EditorSession {
  return buildSession({
    baselineDecor: persistedDecor,
    persistedBaselineDecor: persistedDecor,
    draftDecor: persistedDecor,
    historyLimit: session.historyLimit
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
  undoStack?: readonly UserRoomDecor[]
  redoStack?: readonly UserRoomDecor[]
  historyLimit: number
}): RoomV2EditorSession {
  const historyLimit = Math.max(1, Math.floor(input.historyLimit))
  const baselineDecor = copyDecor(input.baselineDecor)
  const persistedBaselineDecor = input.persistedBaselineDecor
    ? copyDecor(input.persistedBaselineDecor)
    : undefined
  const draftDecor = copyDecor(input.draftDecor)
  // the oldest steps fall off the bottom; snapshots are immutable copies
  const undoStack = (input.undoStack ?? []).slice(-historyLimit).map(copyDecor)
  const redoStack = (input.redoStack ?? []).slice(-historyLimit).map(copyDecor)
  const undoDecor = undoStack[undoStack.length - 1]

  return {
    baselineDecor,
    persistedBaselineDecor,
    draftDecor,
    undoDecor,
    undoStack,
    redoStack,
    historyLimit,
    isDirty: !areRoomV2DecorEqual(baselineDecor, draftDecor),
    canUndo: Boolean(undoDecor),
    canRedo: redoStack.length > 0,
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
