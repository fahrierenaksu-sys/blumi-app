import AsyncStorage from "@react-native-async-storage/async-storage"
import { useCallback, useEffect, useSyncExternalStore } from "react"
import {
  EMPTY_INBOX_CONVERSATION_PREFS,
  parseInboxConversationPrefs,
  serializeInboxConversationPrefs,
  type InboxConversationPrefs
} from "./inboxConversationPrefsModel"

/**
 * Pinned and deleted-for-me conversations, kept per account on this phone.
 * Every read and write names its owner; one account never sees another's
 * entries, and an account switch needs no reset (the cache is keyed).
 */
const STORAGE_PREFIX = "@blumi/inboxConversationPrefs/v1"

type Updater = (prefs: InboxConversationPrefs) => InboxConversationPrefs

interface OwnerState {
  prefs: InboxConversationPrefs
  hydration: "idle" | "loading" | "ready"
  /** Changes made before the stored value was read; replayed on top of it. */
  pending: Updater[]
}

const owners = new Map<string, OwnerState>()
const listeners = new Map<string, Set<() => void>>()

export function getInboxConversationPrefsStorageKey(ownerUserId: string): string {
  const owner = ownerUserId.trim()
  if (!owner) throw new Error("An inbox preferences owner is required.")
  return `${STORAGE_PREFIX}:${encodeURIComponent(owner)}`
}

function stateOf(ownerUserId: string): OwnerState {
  let state = owners.get(ownerUserId)
  if (!state) {
    state = { prefs: EMPTY_INBOX_CONVERSATION_PREFS, hydration: "idle", pending: [] }
    owners.set(ownerUserId, state)
  }
  return state
}

function notify(ownerUserId: string): void {
  for (const listener of [...(listeners.get(ownerUserId) ?? [])]) listener()
}

export function getInboxConversationPrefs(ownerUserId: string): InboxConversationPrefs {
  return owners.get(ownerUserId)?.prefs ?? EMPTY_INBOX_CONVERSATION_PREFS
}

export function subscribeToInboxConversationPrefs(ownerUserId: string, listener: () => void): () => void {
  let set = listeners.get(ownerUserId)
  if (!set) {
    set = new Set()
    listeners.set(ownerUserId, set)
  }
  set.add(listener)
  return () => { set.delete(listener) }
}

/** Reads this account's stored preferences once; later calls reuse them. */
export async function hydrateInboxConversationPrefs(ownerUserId: string): Promise<void> {
  if (!ownerUserId) return
  const state = stateOf(ownerUserId)
  if (state.hydration !== "idle") return
  state.hydration = "loading"
  let stored = EMPTY_INBOX_CONVERSATION_PREFS
  try {
    stored = parseInboxConversationPrefs(await AsyncStorage.getItem(getInboxConversationPrefsStorageKey(ownerUserId)))
  } catch {
    // Unreadable storage: start empty and keep this session's changes.
  }
  state.hydration = "ready"
  const pending = state.pending
  state.pending = []
  state.prefs = pending.reduce((prefs, update) => update(prefs), stored)
  notify(ownerUserId)
  if (pending.length > 0) persist(ownerUserId, state.prefs)
}

export function updateInboxConversationPrefs(ownerUserId: string, update: Updater): void {
  if (!ownerUserId) return
  const state = stateOf(ownerUserId)
  const next = update(state.prefs)
  if (state.hydration !== "ready") state.pending.push(update)
  if (next === state.prefs) return
  state.prefs = next
  notify(ownerUserId)
  if (state.hydration === "ready") persist(ownerUserId, next)
}

function persist(ownerUserId: string, prefs: InboxConversationPrefs): void {
  void AsyncStorage.setItem(getInboxConversationPrefsStorageKey(ownerUserId), serializeInboxConversationPrefs(prefs))
    .catch(() => { /* The list keeps working for this session; the next change retries. */ })
}

/** Test helper: forget every account's in-memory state. */
export function resetInboxConversationPrefsForTests(): void {
  owners.clear()
  listeners.clear()
}

export function useInboxConversationPrefs(ownerUserId: string): {
  prefs: InboxConversationPrefs
  update: (update: Updater) => void
} {
  useEffect(() => {
    void hydrateInboxConversationPrefs(ownerUserId)
  }, [ownerUserId])
  const subscribe = useCallback(
    (listener: () => void) => subscribeToInboxConversationPrefs(ownerUserId, listener),
    [ownerUserId]
  )
  const read = useCallback(() => getInboxConversationPrefs(ownerUserId), [ownerUserId])
  const prefs = useSyncExternalStore(subscribe, read, read)
  const update = useCallback((next: Updater) => updateInboxConversationPrefs(ownerUserId, next), [ownerUserId])
  return { prefs, update }
}
