import {
  classifyMiniRoomLeaveFailure,
  MINI_ROOM_LEAVE_EXIT_WAIT_MS,
  MINI_ROOM_LEAVE_RETRY_DELAYS_MS
} from "./miniRoomLeaveModel"

export type MiniRoomLeaveOutcome = "confirmed" | "unconfirmed"

export interface MiniRoomLeaveFlowInput {
  /** One leave request; resolves once the server confirmed the close (200). */
  attempt: () => Promise<unknown>
  /** HTTP status of a failed attempt, or null when no answer was read. */
  readFailureStatus: (error: unknown) => number | null
  /** Takes the person out of the room; called exactly once. */
  exit: () => void
  /** Called once, after `exit`, when the close could not be confirmed. */
  onUnconfirmed: () => void
  delaysMs?: readonly number[]
  exitWaitMs?: number
  wait?: (ms: number) => Promise<void>
  schedule?: (callback: () => void, ms: number) => () => void
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms) })
const defaultSchedule = (callback: () => void, ms: number) => {
  const timer = setTimeout(callback, ms)
  return () => clearTimeout(timer)
}

/**
 * Leaving a MiniRoom never traps the person (2026-10-01 owner report): the
 * room is left as soon as the server confirms, says there is nothing to close,
 * fails, or takes longer than `exitWaitMs`. An unconfirmed close is retried in
 * the background a bounded number of times; the leave route is idempotent, so
 * a retry closes the room for both people exactly once. Nothing is logged.
 */
export async function startMiniRoomLeave(input: MiniRoomLeaveFlowInput): Promise<MiniRoomLeaveOutcome> {
  const delays = input.delaysMs ?? MINI_ROOM_LEAVE_RETRY_DELAYS_MS
  const wait = input.wait ?? defaultWait
  let exited = false
  const exitOnce = (): void => {
    if (exited) return
    exited = true
    cancelExitDeadline()
    input.exit()
  }
  const cancelExitDeadline = (input.schedule ?? defaultSchedule)(exitOnce, input.exitWaitMs ?? MINI_ROOM_LEAVE_EXIT_WAIT_MS)
  const unconfirmed = (): MiniRoomLeaveOutcome => {
    exitOnce()
    input.onUnconfirmed()
    return "unconfirmed"
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      await input.attempt()
      exitOnce()
      return "confirmed"
    } catch (error) {
      let failure: ReturnType<typeof classifyMiniRoomLeaveFailure>
      try {
        failure = classifyMiniRoomLeaveFailure(input.readFailureStatus(error))
      } catch {
        return unconfirmed()
      }
      if (failure === "left") {
        exitOnce()
        return "confirmed"
      }
      if (failure === "stop" || attempt >= delays.length) return unconfirmed()
      // Out of the room now; the close is confirmed in the background.
      exitOnce()
      await wait(delays[attempt]!)
    }
  }
}
