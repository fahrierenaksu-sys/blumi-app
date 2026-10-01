/**
 * The intro's native-driven values are linear clocks. Their position is read
 * from wall time when an animation stops, instead of from `addListener`
 * callbacks that copied every native frame back to the JS thread (ONB-03).
 */
export interface LinearClockRun {
  /** Progress (0..1) when this run started. */
  startProgress: number
  startedAtMs: number
  /** Time for a full 0 -> 1 pass. */
  durationMs: number
}

/** Progress of a run that stops at 1. */
export function getClampedClockProgress(run: LinearClockRun, nowMs: number): number {
  if (!(run.durationMs > 0)) return 1
  const advanced = run.startProgress + Math.max(0, nowMs - run.startedAtMs) / run.durationMs
  return Math.max(0, Math.min(1, advanced))
}

/** Progress of a run that wraps around (the endless globe turn). */
export function getLoopingClockProgress(run: LinearClockRun, nowMs: number): number {
  if (!(run.durationMs > 0)) return 0
  const advanced = run.startProgress + Math.max(0, nowMs - run.startedAtMs) / run.durationMs
  return ((advanced % 1) + 1) % 1
}

/** Progress of a run that winds back towards 0 (the handoff rollback). */
export function getRewindClockProgress(run: LinearClockRun, nowMs: number): number {
  if (!(run.durationMs > 0)) return 0
  const rewound = run.startProgress - Math.max(0, nowMs - run.startedAtMs) / run.durationMs
  return Math.max(0, Math.min(1, rewound))
}
