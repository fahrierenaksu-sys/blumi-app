const TECHNICAL_ERROR_FRAGMENTS = [
  "failed to fetch",
  "network request failed",
  "fetch failed:",
  "could not connect to the server",
  "expomodulescore",
  "promise.swift",
  "connection refused",
  "econnrefused"
]

const SESSION_UNAVAILABLE_COPY =
  "Blumi is hard to reach right now. Your vibe is still safe."

/**
 * Session-level failures can be shown across onboarding, profile setup, and
 * returning-user entry. Preserve intentional product feedback, but never put
 * native transport diagnostics on those shared screens.
 */
export function getSessionErrorMessageForDisplay(error: unknown): string {
  if (!(error instanceof Error)) return SESSION_UNAVAILABLE_COPY

  const message = error.message.trim()
  if (!message) return SESSION_UNAVAILABLE_COPY

  const normalized = message.toLowerCase()
  return TECHNICAL_ERROR_FRAGMENTS.some((fragment) => normalized.includes(fragment))
    ? SESSION_UNAVAILABLE_COPY
    : message
}
