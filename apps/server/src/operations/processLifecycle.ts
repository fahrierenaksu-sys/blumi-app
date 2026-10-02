import type { EventEmitter } from "node:events"
import { safeOperationalErrorKind } from "./safeErrorLog"
import { GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "./serviceLifecycle"

/**
 * Backstop for a shutdown promise that never settles. The graceful shutdown
 * already gives up at GRACEFUL_SHUTDOWN_TIMEOUT_MS; this only fires if that
 * deadline itself is lost.
 */
export const FORCED_EXIT_AFTER_MS = GRACEFUL_SHUTDOWN_TIMEOUT_MS + 5_000

/**
 * One exit path for the server process. SIGTERM/SIGINT, an uncaught
 * exception, an unhandled rejection and a failed startup all run the same
 * graceful shutdown once, then exit: 0 for a signal, 1 if anything failed.
 *
 * Fault logs carry only the origin and a safe error kind, never the message,
 * stack or enumerable fields, which can hold account data.
 *
 * Shutdown is idempotent: a signal that arrives while the process is already
 * stopping is ignored. Under `npm run start` the platform's SIGTERM reaches
 * node twice (npm forwards it, and the container signals the process group);
 * with `once` the second copy hit Node's default handler and killed the
 * process mid-drain on every deploy ("npm error signal SIGTERM"). Only the
 * graceful-shutdown deadline (or the backstop below) forces the exit.
 */
export function installProcessLifecycle(options: {
  /** `process`, or an EventEmitter in tests. */
  process: Pick<EventEmitter, "on" | "once">
  shutdown(): Promise<void>
  exit(code: number): void
  reportError(message: string, errorKind: string): void
  /** Defaults to FORCED_EXIT_AFTER_MS; the timer never keeps the process alive. */
  forcedExitAfterMs?: number
}): { fail(origin: "startup", error: unknown): void } {
  let exitCode = 0
  let stopping: Promise<void> | undefined

  const stop = (code: number) => {
    exitCode = Math.max(exitCode, code)
    if (stopping) return
    const backstop = setTimeout(() => {
      options.reportError("Blumi shutdown failed", "ForcedExitDeadline")
      options.exit(1)
    }, options.forcedExitAfterMs ?? FORCED_EXIT_AFTER_MS)
    backstop.unref?.()
    stopping = Promise.resolve()
      .then(options.shutdown)
      .catch((error: unknown) => {
        options.reportError("Blumi shutdown failed", safeOperationalErrorKind(error))
        exitCode = 1
      })
      .then(() => {
        clearTimeout(backstop)
        options.exit(exitCode)
      })
  }

  const fault = (origin: string) => (error: unknown) => {
    options.reportError("Blumi process fault", `${origin}:${safeOperationalErrorKind(error)}`)
    stop(1)
  }

  // `on`, not `once`: a repeated signal must reach this no-op, never Node's
  // default handler (which kills the process before data closes).
  options.process.on("SIGTERM", () => stop(0))
  options.process.on("SIGINT", () => stop(0))
  // With these listeners Node no longer crashes on its own: the process
  // drains first and then exits 1, instead of dying mid-request.
  options.process.on("uncaughtException", fault("uncaughtException"))
  options.process.on("unhandledRejection", fault("unhandledRejection"))

  return {
    fail(origin, error) {
      options.reportError(`Blumi ${origin} failed`, safeOperationalErrorKind(error))
      stop(1)
    }
  }
}
