/**
 * Where the visible bottom bar ends, for the global toast. The bottom bar
 * publishes its inset while it is shown on the focused screen and clears it
 * when it hides or loses focus; the toast reads it to sit above the bar. Each
 * bar publishes under its own owner token so a leaving bar cannot clear a
 * newer one. Updates are event based (focus, layout), never per frame.
 */

type Listener = () => void

const insetsByOwner = new Map<symbol, number>()
const listeners = new Set<Listener>()
let snapshot: number | null = null

function resolveSnapshot(): number | null {
  let highest: number | null = null
  for (const inset of insetsByOwner.values()) {
    highest = highest === null ? inset : Math.max(highest, inset)
  }
  return highest
}

export function publishToastBottomBarInset(owner: symbol, inset: number | null): void {
  if (inset === null || !Number.isFinite(inset) || inset < 0) {
    insetsByOwner.delete(owner)
  } else {
    insetsByOwner.set(owner, inset)
  }
  const next = resolveSnapshot()
  if (next === snapshot) return
  snapshot = next
  for (const listener of listeners) listener()
}

export function getToastBottomBarInset(): number | null {
  return snapshot
}

export function subscribeToToastBottomBarInset(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
