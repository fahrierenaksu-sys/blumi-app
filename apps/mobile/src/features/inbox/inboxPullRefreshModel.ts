export interface InboxPullRefreshDependencies {
  refresh: () => Promise<void>
  onFeedback: () => void
  setRefreshing: (refreshing: boolean) => void
}

/**
 * Runs one pull-to-refresh: feedback, spinner on, request, spinner off.
 * A failure is not re-thrown: the refresh has already recorded it in the chat
 * store (`threadListState: "failed"`), which the empty inbox shows with a
 * retry, while an existing list simply stays readable.
 */
export async function runInboxPullRefresh(dependencies: InboxPullRefreshDependencies): Promise<void> {
  dependencies.onFeedback()
  dependencies.setRefreshing(true)
  try {
    await dependencies.refresh()
  } catch {
    // Recorded by the chat store; see above.
  } finally {
    dependencies.setRefreshing(false)
  }
}
