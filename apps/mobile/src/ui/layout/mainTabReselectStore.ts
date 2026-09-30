export type MainTabReselectKey = "discover" | "chats" | "myroom" | "shop"
type Listener = (key: MainTabReselectKey) => void
const listeners = new Set<Listener>()
/** Fired when the already-selected bottom tab is tapped again (iOS: scroll to top). */
export function publishMainTabReselect(key: MainTabReselectKey): void {
  for (const listener of [...listeners]) listener(key)
}
export function subscribeToMainTabReselect(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
