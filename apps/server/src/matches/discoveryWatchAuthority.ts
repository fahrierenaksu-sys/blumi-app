import { randomUUID } from "node:crypto"
import type { NotificationPolicyDeliveryDecision } from "../notifications/notificationRepository"

export function createKeyedSerialQueue() {
  const pending = new Map<string, Promise<unknown>>()
  return async function run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const prior = pending.get(key) ?? Promise.resolve()
    const result = prior.catch(() => undefined).then(work)
    pending.set(key, result)
    try { return await result } finally { if (pending.get(key) === result) pending.delete(key) }
  }
}

export interface DiscoveryWatchAuthorization {
  enqueue(now: Date, work: () => Promise<NotificationPolicyDeliveryDecision>, invalidate: () => void): Promise<NotificationPolicyDeliveryDecision>
  dispatch<T>(now: Date, work: () => Promise<T>): Promise<{ authorized: boolean; value?: T }>
}

export function createInMemoryWatchAuthority() {
  const run = createKeyedSerialQueue()
  const generations = new Map<string, { generation: string; completed: boolean; expiresAt: number; invalidate?: () => void }>()
  return {
    exclusive: run,
    async change<T>(userId: string, expiresAt: number, work: () => Promise<T>): Promise<T> {
      return run(userId, async () => {
        const result = await work()
        generations.get(userId)?.invalidate?.()
        generations.set(userId, { generation: randomUUID(), completed: false, expiresAt })
        return result
      })
    },
    generation(userId: string, expiresAt: number): string {
      if (!generations.has(userId)) generations.set(userId, { generation: randomUUID(), completed: false, expiresAt })
      return generations.get(userId)!.generation
    },
    guard(userId: string, generation: string, validClaim: (now: Date) => boolean, complete: () => void): DiscoveryWatchAuthorization {
      return {
        enqueue: (now, work, invalidate) => run(userId, async () => {
          const current = generations.get(userId)
          if (current?.generation !== generation || current.completed || !validClaim(now)) {
            return { allowed: false, reason: "stale_watch", deliveryCount: 0 }
          }
          const result = await work()
          if (result.allowed) {
            generations.set(userId, { ...current, completed: true, invalidate })
            complete()
          }
          return result
        }),
        dispatch: (now, work) => run(userId, async () => {
          const current = generations.get(userId)
          if (current?.generation !== generation || !current.completed || current.expiresAt <= now.getTime()) return { authorized: false }
          return { authorized: true, value: await work() }
        })
      }
    }
  }
}
