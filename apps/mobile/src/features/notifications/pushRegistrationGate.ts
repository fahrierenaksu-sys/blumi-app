import type { PushPlatform } from "./notificationApi"

/**
 * Keeps push registration to at most one POST /v1/devices per foreground.
 *
 * Build 14 looped: every sync fetched the push token, iOS re-emitted the
 * device token event for that fetch, the token listener started another
 * sync, and the phone posted the same registration every ~340 ms. The gate
 * breaks the loop three ways:
 * - a token event carrying a token this session already saw (including the
 *   one its own fetch just produced) starts nothing;
 * - token events are debounced, so a burst becomes one sync;
 * - an unchanged registration is sent once per foreground, not once per sync.
 */
export const PUSH_TOKEN_EVENT_DEBOUNCE_MS = 750

export interface PushRegistrationGate {
  /** The token listener fired; true only when the event can carry a new token. */
  acceptTokenEvent(token: unknown): boolean
  /** The device token this session's own fetch produced. */
  noteDeviceToken(token: unknown): void
  /** The app came back from the background: one unchanged registration is allowed again. */
  noteForeground(): void
  shouldRegister(input: { platform: PushPlatform; pushToken: string }): boolean
  noteRegistered(input: { platform: PushPlatform; pushToken: string }): void
}

export function createPushRegistrationGate(): PushRegistrationGate {
  const seenTokens = new Set<string>()
  let registeredThisForeground: string | null = null
  const keyOf = (input: { platform: PushPlatform; pushToken: string }) => `${input.platform}\n${input.pushToken}`
  const remember = (token: unknown) => {
    if (typeof token !== "string" || token.length === 0) return
    // Bounded: a session sees one or two tokens; rotation adds one each time.
    if (seenTokens.size >= 16) seenTokens.clear()
    seenTokens.add(token)
  }
  return {
    acceptTokenEvent(token) {
      if (typeof token !== "string" || token.length === 0) return false
      if (seenTokens.has(token)) return false
      remember(token)
      return true
    },
    noteDeviceToken: remember,
    noteForeground() {
      registeredThisForeground = null
    },
    shouldRegister(input) {
      return registeredThisForeground !== keyOf(input)
    },
    noteRegistered(input) {
      registeredThisForeground = keyOf(input)
      remember(input.pushToken)
    }
  }
}

/** Coalesces a burst of calls into one, `delayMs` after the last. */
export function createDebouncedRunner(
  run: () => void,
  delayMs: number,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout }
): { schedule(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    schedule() {
      if (timer !== null) timers.clear(timer)
      timer = timers.set(() => {
        timer = null
        run()
      }, delayMs)
    },
    cancel() {
      if (timer !== null) timers.clear(timer)
      timer = null
    }
  }
}
