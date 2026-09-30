export type ChatLatencyPhase = "persist" | "fanout" | "push_enqueue"
export interface ChatLatencySample {
  phase: ChatLatencyPhase
  durationMs: number
  outcome: "ok" | "error"
  count: number
}
export type ChatPhaseMeasure = <T>(phase: ChatLatencyPhase, work: () => Promise<T>) => Promise<T>

/** Explicit local diagnostics only; request data and errors never reach the sink. */
export function createChatLatencyDiagnostics(options: {
  nodeEnv: string
  enabled: boolean
  now?: () => number
  report?: (sample: ChatLatencySample) => void
}): ChatPhaseMeasure {
  if (!options.enabled || !["development", "test"].includes(options.nodeEnv)) return (_phase, work) => work()
  const now = options.now ?? (() => performance.now())
  const report = options.report ?? ((sample) => console.info("Local chat latency", sample))
  return async (phase, work) => {
    const startedAt = now()
    let outcome: ChatLatencySample["outcome"] = "error"
    try {
      const result = await work()
      outcome = "ok"
      return result
    } finally {
      try { report({ phase, durationMs: Math.max(0, now() - startedAt), outcome, count: 1 }) }
      catch { /* Measurements never alter message acknowledgement or retries. */ }
    }
  }
}
