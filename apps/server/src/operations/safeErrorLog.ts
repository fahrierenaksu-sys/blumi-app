import { DatabaseError } from "pg"

const SAFE_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "AggregateError",
  "AbortError",
  "TimeoutError",
  "DatabaseError"
])

/** Never pass provider/PG error objects to operational logs: enumerable fields may contain account data. */
export function safeOperationalErrorKind(error: unknown): string {
  if (!(error instanceof Error)) return "NonError"
  // node-postgres names its server errors "error"; report the class instead.
  if (error instanceof DatabaseError) return "DatabaseError"
  return SAFE_ERROR_NAMES.has(error.name) ? error.name : "ServiceError"
}
