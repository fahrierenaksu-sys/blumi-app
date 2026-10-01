/**
 * Inbound realtime admission by event class (2026-10-01).
 *
 * Each class has its own windows and in-flight slots, so one kind of traffic
 * can never use up another's budget:
 *
 * | class     | events                                   | over budget |
 * |-----------|------------------------------------------|-------------|
 * | motion    | mini_room.move                           | dropped     |
 * | transient | reaction.send, presence.move_to_spot     | dropped     |
 * | receipt   | chat.ack_delivered                       | dropped     |
 * | chat      | chat.send_message                        | refused with CHAT_MESSAGE_NOT_SENT (retryable); closed only far above a human rate |
 * | control   | everything else (lists, invites, scene, safety) | socket closed with 4429 |
 *
 * Motion keeps the MiniRoom quota introduced with movement sync (60 per user
 * per 10 s, 2 in flight per socket, 4 per user). Superseded or ephemeral
 * events are dropped rather than closing the socket, because a close would
 * also cut the user's chat. User windows outlive a socket, so reconnecting
 * cannot reset a budget.
 *
 * Motion admission only counts the window: the server's handleMovement keeps
 * one step in flight per socket and replaces a pending step with the latest,
 * so a step is never dropped for being busy. Delivery acks are cumulative, so
 * the next one covers a dropped one.
 */
export const REALTIME_EVENT_WINDOW_MS = 10_000

export type RealtimeEventClass = "motion" | "transient" | "receipt" | "chat" | "control"

export type RealtimeAdmission =
  | { kind: "admit"; release(): void }
  | { kind: "drop" }
  | { kind: "refuse_chat" }
  | { kind: "close" }

interface ClassLimits {
  connectionWindow?: number
  userWindow: number
  connectionInFlight: number
  userInFlight: number
  /** Chat only: above this many per user window the socket is closed. */
  abuseWindow?: number
}

export const REALTIME_EVENT_LIMITS: Readonly<Record<RealtimeEventClass, ClassLimits>> = Object.freeze({
  motion: { userWindow: 60, connectionInFlight: 2, userInFlight: 4 },
  transient: { userWindow: 30, connectionInFlight: 2, userInFlight: 4 },
  receipt: { userWindow: 30, connectionInFlight: 2, userInFlight: 4 },
  // 3 messages per second sustained is far above typing speed; a burst of
  // queued retries after a reconnect still fits.
  chat: { userWindow: 30, connectionInFlight: 4, userInFlight: 8, abuseWindow: 90 },
  control: { connectionWindow: 60, userWindow: 100, connectionInFlight: 8, userInFlight: 16 }
})

const OVER_BUDGET: Readonly<Record<RealtimeEventClass, RealtimeAdmission["kind"]>> = Object.freeze({
  motion: "drop",
  transient: "drop",
  receipt: "drop",
  chat: "refuse_chat",
  control: "close"
})

export function classifyRealtimeEvent(type: string): RealtimeEventClass {
  switch (type) {
    case "mini_room.move":
      return "motion"
    case "reaction.send":
    case "presence.move_to_spot":
      return "transient"
    case "chat.ack_delivered":
      return "receipt"
    case "chat.send_message":
      return "chat"
    default:
      return "control"
  }
}

interface Window {
  startedAt: number
  count: number
}

export interface RealtimeEventBudget {
  admit(input: { connectionId: string; userId: string; eventClass: RealtimeEventClass; now: number }): RealtimeAdmission
  forgetConnection(connectionId: string): void
  purgeExpired(now: number): void
}

export function createRealtimeEventBudget(
  limits: Readonly<Record<RealtimeEventClass, ClassLimits>> = REALTIME_EVENT_LIMITS
): RealtimeEventBudget {
  const windows = new Map<string, Window>()
  const connectionWindowKeys = new Map<string, Set<string>>()
  const inFlight = new Map<string, number>()

  /** Counts the event in the window; returns the count including it. */
  function count(key: string, now: number): number {
    const current = windows.get(key)
    if (!current || current.startedAt + REALTIME_EVENT_WINDOW_MS <= now) {
      windows.set(key, { startedAt: now, count: 1 })
      return 1
    }
    current.count += 1
    return current.count
  }

  function release(key: string): void {
    const remaining = (inFlight.get(key) ?? 1) - 1
    if (remaining <= 0) inFlight.delete(key)
    else inFlight.set(key, remaining)
  }

  return {
    admit({ connectionId, userId, eventClass, now }) {
      const classLimits = limits[eventClass]
      const userKey = `${eventClass}\u0000user\u0000${userId}`
      const connectionKey = `${eventClass}\u0000connection\u0000${connectionId}`
      const userCount = count(userKey, now)
      let withinWindow = userCount <= classLimits.userWindow
      if (classLimits.connectionWindow !== undefined) {
        let keys = connectionWindowKeys.get(connectionId)
        if (!keys) connectionWindowKeys.set(connectionId, keys = new Set())
        keys.add(connectionKey)
        withinWindow = count(connectionKey, now) <= classLimits.connectionWindow && withinWindow
      }
      if (classLimits.abuseWindow !== undefined && userCount > classLimits.abuseWindow) {
        return { kind: "close" }
      }
      const connectionSlots = `${connectionKey}\u0000inflight`
      const userSlots = `${userKey}\u0000inflight`
      if (!withinWindow ||
        (inFlight.get(connectionSlots) ?? 0) >= classLimits.connectionInFlight ||
        (inFlight.get(userSlots) ?? 0) >= classLimits.userInFlight) {
        return { kind: OVER_BUDGET[eventClass] } as RealtimeAdmission
      }
      inFlight.set(connectionSlots, (inFlight.get(connectionSlots) ?? 0) + 1)
      inFlight.set(userSlots, (inFlight.get(userSlots) ?? 0) + 1)
      let released = false
      return {
        kind: "admit",
        release() {
          if (released) return
          released = true
          release(connectionSlots)
          release(userSlots)
        }
      }
    },
    forgetConnection(connectionId) {
      for (const key of connectionWindowKeys.get(connectionId) ?? []) windows.delete(key)
      connectionWindowKeys.delete(connectionId)
    },
    purgeExpired(now) {
      for (const [key, window] of windows) {
        if (window.startedAt + REALTIME_EVENT_WINDOW_MS <= now) windows.delete(key)
      }
    }
  }
}
