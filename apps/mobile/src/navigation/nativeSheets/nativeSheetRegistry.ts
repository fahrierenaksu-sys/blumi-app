/**
 * The bridge between a screen that opens a native sheet and the sheet route.
 *
 * Route params must stay serialisable, so the `NativeSheet` route carries only
 * `{ sheet, requestId }`. Everything else the sheet needs (props, callbacks,
 * the session) lives here under that request id for as long as the opener is
 * mounted. Plain module, no React Native imports, so it is unit tested.
 *
 * Lifecycle of one request:
 * - `open` (opener) → the opener pushes the route with the returned id.
 * - `update` (opener, every render) → the sheet re-renders with fresh props.
 * - `requestClose` (sheet content or opener) → the sheet route pops itself.
 *   Only the first call starts closing; later calls only queue their
 *   `afterDismiss` work.
 * - `dismissed` (sheet route unmount, after a swipe, tap outside, back or a
 *   requested close) → `onDismissed` tells the opener the sheet is gone, then
 *   queued `afterDismiss` work runs (for example, leave the screen after a
 *   block), so it never acts on the sheet instead of the screen.
 * - `release` (opener unmount) → the sheet closes and no callback reaches the
 *   unmounted opener.
 */

export type NativeSheetPhase = "open" | "closing"

export interface NativeSheetSnapshot<P = unknown> {
  readonly kind: string
  readonly props: P
  readonly phase: NativeSheetPhase
}

interface Entry {
  snapshot: NativeSheetSnapshot
  onDismissed: (() => void) | null
  afterDismiss: (() => void)[]
  listeners: Set<() => void>
}

export interface NativeSheetRegistry {
  open(kind: string, props: unknown, onDismissed: () => void): string
  update(id: string, props: unknown): void
  read(id: string): NativeSheetSnapshot | undefined
  subscribe(id: string, listener: () => void): () => void
  /** True when this call started the close (the sheet should pop now). */
  requestClose(id: string, afterDismiss?: () => void): boolean
  dismissed(id: string): void
  release(id: string): void
  /** Number of live requests (tests and leak checks). */
  size(): number
}

function shallowEqual(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true
  if (
    typeof previous !== "object" || previous === null ||
    typeof next !== "object" || next === null
  ) return false
  const previousKeys = Object.keys(previous)
  const nextKeys = Object.keys(next)
  if (previousKeys.length !== nextKeys.length) return false
  return previousKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(next, key) &&
    Object.is((previous as Record<string, unknown>)[key], (next as Record<string, unknown>)[key])
  )
}

export function createNativeSheetRegistry(
  createId: () => string = createDefaultIdFactory()
): NativeSheetRegistry {
  const entries = new Map<string, Entry>()

  const notify = (entry: Entry) => {
    for (const listener of [...entry.listeners]) listener()
  }

  const setSnapshot = (entry: Entry, next: Partial<NativeSheetSnapshot>) => {
    entry.snapshot = Object.freeze({ ...entry.snapshot, ...next })
    notify(entry)
  }

  return {
    open(kind, props, onDismissed) {
      const id = createId()
      entries.set(id, {
        snapshot: Object.freeze({ kind, props, phase: "open" as const }),
        onDismissed,
        afterDismiss: [],
        listeners: new Set()
      })
      return id
    },
    update(id, props) {
      const entry = entries.get(id)
      if (!entry || shallowEqual(entry.snapshot.props, props)) return
      setSnapshot(entry, { props })
    },
    read(id) {
      return entries.get(id)?.snapshot
    },
    subscribe(id, listener) {
      const entry = entries.get(id)
      if (!entry) return () => undefined
      entry.listeners.add(listener)
      return () => {
        entry.listeners.delete(listener)
      }
    },
    requestClose(id, afterDismiss) {
      const entry = entries.get(id)
      if (!entry) return false
      if (afterDismiss) entry.afterDismiss.push(afterDismiss)
      if (entry.snapshot.phase === "closing") return false
      setSnapshot(entry, { phase: "closing" })
      return true
    },
    dismissed(id) {
      const entry = entries.get(id)
      if (!entry) return
      entries.delete(id)
      entry.listeners.clear()
      const { onDismissed, afterDismiss } = entry
      entry.onDismissed = null
      entry.afterDismiss = []
      onDismissed?.()
      for (const work of afterDismiss) work()
    },
    release(id) {
      const entry = entries.get(id)
      if (!entry) return
      // The opener is gone: nothing may call back into it.
      entry.onDismissed = null
      entry.afterDismiss = []
      if (entry.snapshot.phase === "closing") {
        entries.delete(id)
        entry.listeners.clear()
        return
      }
      // The mounted sheet sees "closing" and pops; its unmount then calls
      // `dismissed`, which finds nothing left to call.
      if (entry.listeners.size > 0) {
        setSnapshot(entry, { phase: "closing" })
        return
      }
      entries.delete(id)
    },
    size() {
      return entries.size
    }
  }
}

function createDefaultIdFactory(): () => string {
  let counter = 0
  return () => {
    counter += 1
    return `sheet-${Date.now().toString(36)}-${counter}`
  }
}

/** The app's one registry (navigation/nativeSheets). */
export const nativeSheetRegistry = createNativeSheetRegistry()
