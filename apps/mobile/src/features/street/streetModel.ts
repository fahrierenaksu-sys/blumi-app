import type { StreetChangeKind, StreetResponse, StreetRoom, StreetWindow } from "@blumi/contracts"
import type { StreetCopy } from "./streetCopy"

/** Spec §3: the street collapses to portholes past 36 pt of list scroll and opens again at the top. */
export const STREET_COLLAPSE_OFFSET = 36

export type StreetSlot =
  | { kind: "self"; key: "self"; closed: boolean; room: StreetRoom | null }
  | { kind: "window"; key: string; window: StreetWindow; isNew: boolean }
  | { kind: "empty"; key: string }

export interface StreetView {
  slots: readonly StreetSlot[]
  note: string
  footer: string | null
  railLabel: string
  windowCount: number
  changedCount: number
}

/** The server orders the windows; the client keeps that order, puts "Sen" first and, with 0 or 1 match, one "find neighbours" slot last. */
export function buildStreetView(street: StreetResponse, copy: StreetCopy, seenThreadIds: ReadonlySet<string>): StreetView {
  const windows = street.windows
  const changedCount = windows.filter((window) => window.change !== null).length
  const hasInvite = windows.length <= 1
  const slots: StreetSlot[] = [
    { kind: "self", key: "self", closed: street.self.closed, room: street.self.room },
    ...windows.map((window): StreetSlot => ({
      kind: "window",
      key: window.threadId,
      window,
      isNew: window.change !== null && !seenThreadIds.has(window.threadId)
    })),
    ...(hasInvite ? [{ kind: "empty", key: "empty-0" } as const] : [])
  ]
  return {
    slots,
    note: changedCount > 0 ? copy.newsNote(changedCount) : copy.calmNote,
    footer: windows.length === 0 ? copy.buildingStreet : windows.length === 1 ? copy.growingStreet : null,
    railLabel: copy.railLabel(slots.length),
    windowCount: windows.length,
    changedCount
  }
}

export function streetChangeLabel(change: StreetChangeKind | null, copy: StreetCopy): string | null {
  return change ? copy.changes[change] : null
}

/** VoiceOver: one sentence per window. Never a time, a date or an absence count. */
export function streetWindowAccessibilityLabel(window: StreetWindow, copy: StreetCopy, fallbackName: string): string {
  const name = window.displayName ?? fallbackName
  if (window.closed) return `${name}. ${copy.closedWindow}.`
  const parts = [name]
  const change = streetChangeLabel(window.change, copy)
  if (change) parts.push(`${copy.thisMorning} ${change}`)
  if (window.unread > 0) parts.push(copy.unread(window.unread))
  return `${parts.join(". ")}.`
}

/** Hysteresis: collapse past the offset, open only back at the top. */
export function nextStreetCollapsed(collapsed: boolean, scrollOffset: number): boolean {
  "worklet"
  if (!collapsed && scrollOffset > STREET_COLLAPSE_OFFSET) return true
  if (collapsed && scrollOffset <= 0) return false
  return collapsed
}

/** Per-device memory for one account (never sent anywhere). */
export interface StreetDeviceState {
  infoCardSeen: boolean
  /** Edition whose morning wake-up already played on this device. */
  wakeEdition: string | null
  /** Edition the seen windows belong to; a new edition starts with none seen. */
  seenEdition: string | null
  seenThreadIds: readonly string[]
  /** The last look and room this device saw per window, for Dün / Bugün. */
  snapshots: Readonly<Record<string, StreetWindowSnapshot>>
}

export interface StreetWindowSnapshot {
  edition: string
  room: StreetRoom | null
  avatar: StreetWindow["avatar"]
}

export const EMPTY_STREET_DEVICE_STATE: StreetDeviceState = Object.freeze({
  infoCardSeen: false,
  wakeEdition: null,
  seenEdition: null,
  seenThreadIds: Object.freeze([]) as readonly string[],
  snapshots: Object.freeze({})
})

/**
 * After a fetch: forget windows that left the street (unmatch, block, deletion), start a new edition with nothing seen,
 * and remember today's look and room only for windows not yet snapshotted this edition, so yesterday's stays for Dün.
 */
export function reconcileStreetDeviceState(state: StreetDeviceState, street: StreetResponse): StreetDeviceState {
  const present = new Set(street.windows.map((window) => window.threadId))
  const snapshots: Record<string, StreetWindowSnapshot> = {}
  for (const [threadId, snapshot] of Object.entries(state.snapshots)) {
    if (present.has(threadId)) snapshots[threadId] = snapshot
  }
  const isNewEdition = state.seenEdition !== street.edition
  return {
    ...state,
    seenEdition: street.edition,
    seenThreadIds: isNewEdition ? [] : state.seenThreadIds.filter((threadId) => present.has(threadId)),
    snapshots
  }
}

/** Whether Dün / Bugün can be offered: the window changed and this device kept an older state. */
export function previousStreetSnapshot(
  state: StreetDeviceState,
  window: StreetWindow,
  edition: string
): StreetWindowSnapshot | null {
  if (!window.change || window.closed) return null
  const snapshot = state.snapshots[window.threadId]
  return snapshot && snapshot.edition !== edition ? snapshot : null
}

/** Opening a window marks it seen and stores today's state for tomorrow's compare. */
export function markStreetWindowOpened(state: StreetDeviceState, window: StreetWindow, edition: string): StreetDeviceState {
  const seen = state.seenThreadIds.includes(window.threadId) ? state.seenThreadIds : [...state.seenThreadIds, window.threadId]
  const previous = state.snapshots[window.threadId]
  const keepsYesterday = previous && previous.edition !== edition && window.change !== null
  return {
    ...state,
    seenThreadIds: seen,
    snapshots: keepsYesterday
      ? state.snapshots
      : { ...state.snapshots, [window.threadId]: { edition, room: window.room, avatar: window.avatar } }
  }
}

export function shouldPlayStreetWakeUp(state: StreetDeviceState, edition: string, reduceMotion: boolean): boolean {
  return !reduceMotion && state.wakeEdition !== edition
}
