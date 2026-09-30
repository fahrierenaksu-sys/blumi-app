/** Holds the active movement handle (a UI-thread movement run in the store). */
export interface MiniRoomAnimationFrameRef<THandle = number> {
  current: THandle | null
}

export interface MiniRoomMovementCompletionRef<TTimer> {
  current: TTimer | null
}

/** Cancels one active movement and invalidates its shared handle. */
export function cancelActiveMiniRoomMovement<THandle>(
  frameRef: MiniRoomAnimationFrameRef<THandle>,
  cancelFrame: (frame: THandle) => void
): void {
  const frame = frameRef.current
  if (frame === null) return
  frameRef.current = null
  cancelFrame(frame)
}

export function cancelPendingMiniRoomMovementCompletion<TTimer>(
  timerRef: MiniRoomMovementCompletionRef<TTimer>,
  clearTimer: (timer: TTimer) => void
): void {
  const timer = timerRef.current
  if (timer === null) return
  timerRef.current = null
  clearTimer(timer)
}

export function scheduleMiniRoomMovementCompletion<TTimer>(
  timerRef: MiniRoomMovementCompletionRef<TTimer>,
  setTimer: (callback: () => void, delayMs: number) => TTimer,
  clearTimer: (timer: TTimer) => void,
  complete: () => void,
  delayMs: number
): void {
  cancelPendingMiniRoomMovementCompletion(timerRef, clearTimer)
  let timer: TTimer
  timer = setTimer(() => {
    if (timerRef.current !== timer) return
    timerRef.current = null
    complete()
  }, delayMs)
  timerRef.current = timer
}
