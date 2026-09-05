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
