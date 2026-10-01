import { safeOperationalErrorKind } from "./safeErrorLog"

/**
 * Work a request starts but its response does not wait for: the side effects
 * of a change that is already durable (a new match's reward, pushes and chat
 * announcement). A failure is reported with its safe error kind only.
 * `drain()` waits for everything started so far (graceful shutdown, tests).
 */
export interface AfterResponseTasks {
  run(kind: string, task: () => Promise<unknown>): void
  drain(): Promise<void>
}

export function createAfterResponseTasks(options: {
  reportFailure?: (kind: string, error: unknown) => void
} = {}): AfterResponseTasks {
  const pending = new Set<Promise<void>>()
  const reportFailure = options.reportFailure ?? ((kind, error) => {
    console.error("After-response task failed", { kind, errorKind: safeOperationalErrorKind(error) })
  })
  return {
    run(kind, task) {
      const running: Promise<void> = Promise.resolve()
        .then(task)
        .then(() => undefined, (error: unknown) => {
          try { reportFailure(kind, error) } catch { /* Reporting must not throw. */ }
        })
        .finally(() => { pending.delete(running) })
      pending.add(running)
    },
    async drain() {
      while (pending.size > 0) await Promise.allSettled([...pending])
    }
  }
}
