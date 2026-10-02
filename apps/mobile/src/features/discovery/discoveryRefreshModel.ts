import {DiscoveryRefreshLimitError} from "./discoveryApi"
export type DiscoveryRefreshResult =
  | { status: "success" }
  | { status: "error"; message: string }

export async function runDiscoveryRefresh(
  refresh: () => Promise<void>
): Promise<DiscoveryRefreshResult> {
  try {
    await refresh()
    return { status: "success" }
  } catch (error) {
    if (error instanceof DiscoveryRefreshLimitError) throw error
    return {
      status: "error",
      message: "Couldn't refresh Discover. Check your connection and try again."
    }
  }
}

export type DiscoveryRefreshRun = DiscoveryRefreshResult | { status: "skipped" }

export interface DiscoveryRefreshController {
  /**
   * Runs one refresh. A call while another is in flight is skipped. Pending
   * turns on before the refresh starts and always turns off when it settles,
   * including when it rethrows a DiscoveryRefreshLimitError.
   */
  run(refresh: () => Promise<void>): Promise<DiscoveryRefreshRun>
}

export function createDiscoveryRefreshController(options: {
  onPendingChange: (pending: boolean) => void
}): DiscoveryRefreshController {
  let inFlight = false
  return {
    async run(refresh) {
      if (inFlight) return { status: "skipped" }
      inFlight = true
      options.onPendingChange(true)
      try {
        return await runDiscoveryRefresh(refresh)
      } finally {
        inFlight = false
        options.onPendingChange(false)
      }
    }
  }
}
