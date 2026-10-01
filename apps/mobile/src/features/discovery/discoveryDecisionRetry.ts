import {
  DiscoveryDecisionNotEligibleError,
  DiscoveryDecisionQuotaExhaustedError,
  DiscoveryDecisionRequestError
} from "./discoveryApi"

/**
 * The card leaves on release; its decision is sent in the background. A
 * dropped connection or a server-side error is retried with this backoff
 * before the card comes back (DSC-03). Retrying is safe: the server replays a
 * repeated decision without spending quota or creating a second match.
 */
export const DISCOVERY_DECISION_RETRY_DELAYS_MS = [400, 1200] as const

export function isRetryableDiscoveryDecisionError(error: unknown): boolean {
  if (error instanceof DiscoveryDecisionNotEligibleError) return false
  if (error instanceof DiscoveryDecisionQuotaExhaustedError) return false
  if (error instanceof DiscoveryDecisionRequestError) {
    return error.status >= 500 || error.status === 408 || error.status === 429
  }
  // A cancelled request was abandoned on purpose.
  if (error instanceof Error && error.name === "AbortError") return false
  // fetch rejects with a TypeError when the connection fails; TimeoutError
  // comes from the request deadline.
  return error instanceof Error
}

export async function runDiscoveryDecisionWithRetry<Result>(
  attempt: () => Promise<Result>,
  options: {
    delaysMs?: readonly number[]
    sleep?: (ms: number) => Promise<void>
  } = {}
): Promise<Result> {
  const delays = options.delaysMs ?? DISCOVERY_DECISION_RETRY_DELAYS_MS
  const sleep = options.sleep ?? defaultSleep
  for (let retry = 0; ; retry += 1) {
    try {
      return await attempt()
    } catch (error) {
      const delay = delays[retry]
      if (delay === undefined || !isRetryableDiscoveryDecisionError(error)) throw error
      await sleep(delay)
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
