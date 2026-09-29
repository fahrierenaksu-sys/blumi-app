import type { DiscoveryWatchRecord } from "@blumi/contracts"
import type { QueryClient } from "@tanstack/react-query"
import { buildDiscoveryWatchQueryKey } from "./discoveryQueryOptions"

export async function runDiscoveryWatchMutation(input: {
  queryClient: QueryClient
  baseHttpUrl: string
  userId: string
  mutation(): Promise<DiscoveryWatchRecord | null>
}): Promise<void> {
  const queryKey = buildDiscoveryWatchQueryKey(input)
  const filters = { queryKey, exact: true }
  await input.queryClient.cancelQueries(filters)
  try {
    const watch = await input.mutation()
    // Focus/reconnect can start another GET while the mutation is in flight.
    // Cancel that read too before publishing the server acknowledgement.
    await input.queryClient.cancelQueries(filters)
    input.queryClient.setQueryData(queryKey, watch)
  } catch (error) {
    // With no cached data, invalidation may reuse an in-flight GET. Abort it
    // explicitly so reconciliation checks the server after the failed write.
    await input.queryClient.cancelQueries(filters)
    throw error
  } finally {
    // A timeout can leave the server outcome unknown. Reconcile through GET;
    // never replay the mutation or let a read failure mask its original result.
    void input.queryClient.invalidateQueries(filters).catch(() => undefined)
  }
}
