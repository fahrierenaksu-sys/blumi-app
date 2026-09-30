import { useCallback, useRef, useState } from "react"
import { runDiscoveryRefresh } from "../discoveryRefreshModel"
import { getDiscoveryErrorMessageForDisplay } from "../discoveryErrorCopy"
import type { LobbyFeedbackCopy } from "../../lobby/lobbyFeedbackCopy"
import { showToast } from "../../../ui/toast"

// Pull-to-refresh and "Check again": awaits the real refresh boundary (the
// production query, or the legacy lobby snapshot outside production) and
// always clears the spinner in `finally`.
export function useDiscoveryRefresh(input: {
  isProductionDiscovery: boolean
  filtersReady: boolean
  refreshProductionDiscover: () => Promise<void>
  requestRefresh: () => Promise<void>
  lobbyCopy: LobbyFeedbackCopy
}) {
  const {
    isProductionDiscovery,
    filtersReady,
    refreshProductionDiscover,
    requestRefresh,
    lobbyCopy
  } = input
  const [refreshing, setRefreshing] = useState(false)
  const refreshInFlightRef = useRef(false)

  const handleRefresh = useCallback(async () => {
    if (isProductionDiscovery && !filtersReady) return
    if (refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    setRefreshing(true)
    try {
      const result = await runDiscoveryRefresh(() =>
        isProductionDiscovery
          ? refreshProductionDiscover()
          : requestRefresh()
      )
      if (result.status === "error") {
        throw new Error(result.message)
      }
    } catch (error) {
      showToast({
        title: lobbyCopy.refreshTitle,
        body: getDiscoveryErrorMessageForDisplay("refresh", error),
        type: "warning"
      })
    } finally {
      refreshInFlightRef.current = false
      setRefreshing(false)
    }
  }, [
    filtersReady,
    isProductionDiscovery,
    lobbyCopy,
    requestRefresh,
    refreshProductionDiscover
  ])

  return { refreshing, handleRefresh }
}
