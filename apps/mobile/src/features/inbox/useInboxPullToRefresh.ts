import { useCallback, useState } from "react"
import { hapticLight } from "../../ui/haptics"
import { runInboxPullRefresh } from "./inboxPullRefreshModel"

export interface InboxPullToRefresh {
  refreshing: boolean
  onRefresh: () => void
}

/** Pull-to-refresh state for the inbox list; the spinner stays until the request settles. */
export function useInboxPullToRefresh(onRetryThreads: () => Promise<void>): InboxPullToRefresh {
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(() => {
    void runInboxPullRefresh({ refresh: onRetryThreads, onFeedback: hapticLight, setRefreshing })
  }, [onRetryThreads])
  return { refreshing, onRefresh }
}
