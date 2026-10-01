/**
 * Runs `task` for every item with at most `limit` in flight. The outbox uses
 * it so one claimed batch of 100 deliveries cannot hold more than `limit`
 * pooled PostgreSQL connections (each authorized send keeps a transaction
 * open across its provider call; the default pool has 10 connections that
 * every HTTP request shares).
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Concurrency limit must be a positive integer.")
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++]!
      await task(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}
