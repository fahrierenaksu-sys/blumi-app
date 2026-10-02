import { useCallback, useState } from "react"
import { createDiscoveryRefreshController } from "../discoveryRefreshModel"
import { getDiscoveryErrorMessageForDisplay } from "../discoveryErrorCopy"
import type { LobbyFeedbackCopy } from "../../lobby/lobbyFeedbackCopy"
import { showToast } from "../../../ui/toast"

// Pull-to-refresh and "Check again": awaits the real refresh boundary (the
// production query, or the legacy lobby snapshot outside production) and
// always clears the spinner when it settles.
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
  // One controller per screen: a second pull while a refresh runs is skipped,
  // and the spinner always clears when the refresh settles.
  const [refreshController] = useState(() =>
    createDiscoveryRefreshController({ onPendingChange: setRefreshing })
  )

  const handleRefresh = useCallback(async () => {
    if (isProductionDiscovery && !filtersReady) return
    try {
      const result = await refreshController.run(() =>
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
    }
  }, [
    filtersReady,
    isProductionDiscovery,
    lobbyCopy,
    refreshController,
    requestRefresh,
    refreshProductionDiscover
  ])

  return { refreshing, handleRefresh }
}
