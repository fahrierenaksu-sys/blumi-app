import type { AuthRepository } from "./authRepository"

export function createFirebaseUserDeletionDispatch(input: {
  repository: AuthRepository
  deleteUser(uid: string): Promise<void>
  now?: () => Date
}) {
  return async function dispatchDue(): Promise<void> {
    const now = input.now?.() ?? new Date()
    const pending = await input.repository.listDueFirebaseUserDeletions(now, 20)
    for (const item of pending) {
      try {
        await input.deleteUser(item.uid)
        await input.repository.completeFirebaseUserDeletion(item.uid)
      } catch (error) {
        if ((error as { code?: unknown })?.code === "auth/user-not-found") {
          await input.repository.completeFirebaseUserDeletion(item.uid)
          continue
        }
        const backoffMs = Math.min(60 * 60_000, 30_000 * 2 ** Math.min(item.attemptCount, 7))
        await input.repository.retryFirebaseUserDeletion(item.uid, new Date(now.getTime() + backoffMs))
      }
    }
  }
}
