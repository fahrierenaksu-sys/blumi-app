/**
 * Holds open while a sensitive SMS re-authentication (account deletion,
 * phone change, data export) waits for its code. The server binds each
 * re-auth challenge to the session token that requested it, and a token
 * refresh rotates that token, so a foreground refresh in that window would
 * void the code the user is about to type. Holds expire on their own a little
 * after the server challenge does, so a forgotten hold cannot stop refreshes.
 */
export const SENSITIVE_REAUTH_HOLD_MS = 6 * 60 * 1000

let holdExpiries: ReadonlyMap<number, number> = new Map()
let nextHoldId = 0

function withoutHold(id: number): ReadonlyMap<number, number> {
  const next = new Map(holdExpiries)
  next.delete(id)
  return next
}

/** Starts a hold and returns its release; releasing twice is harmless. */
export function holdSensitiveReauth(nowMs = Date.now()): () => void {
  nextHoldId += 1
  const id = nextHoldId
  holdExpiries = new Map(holdExpiries).set(id, nowMs + SENSITIVE_REAUTH_HOLD_MS)
  return () => {
    holdExpiries = withoutHold(id)
  }
}

export function isSensitiveReauthOpen(nowMs = Date.now()): boolean {
  for (const expiresAtMs of holdExpiries.values()) {
    if (expiresAtMs > nowMs) return true
  }
  return false
}
