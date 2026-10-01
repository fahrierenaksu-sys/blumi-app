import type { EventEmitter } from "node:events"
import { safeOperationalErrorKind } from "./safeErrorLog"

/**
 * One exit path for the server process. SIGTERM/SIGINT, an uncaught
 * exception, an unhandled rejection and a failed startup all run the same
 * graceful shutdown once, then exit: 0 for a signal, 1 if anything failed.
 *
 * Fault logs carry only the origin and a safe error kind, never the message,
 * stack or enumerable fields, which can hold account data. Signals use
 * `once`, so a second Ctrl+C or SIGTERM still force-quits.
 */
export function installProcessLifecycle(options: {
  /** `process`, or an EventEmitter in tests. */
  process: Pick<EventEmitter, "on" | "once">
  shutdown(): Promise<void>
  exit(code: number): void
  reportError(message: string, errorKind: string): void
}): { fail(origin: "startup", error: unknown): void } {
  let exitCode = 0
  let stopping: Promise<void> | undefined

  const stop = (code: number) => {
    exitCode = Math.max(exitCode, code)
    stopping ??= Promise.resolve()
      .then(options.shutdown)
      .catch((error: unknown) => {
        options.reportError("Blumi shutdown failed", safeOperationalErrorKind(error))
        exitCode = 1
      })
      .then(() => options.exit(exitCode))
  }

  const fault = (origin: string) => (error: unknown) => {
    options.reportError("Blumi process fault", `${origin}:${safeOperationalErrorKind(error)}`)
    stop(1)
  }

  options.process.once("SIGTERM", () => stop(0))
  options.process.once("SIGINT", () => stop(0))
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
