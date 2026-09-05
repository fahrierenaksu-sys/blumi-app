import type { ChatThread, ChatThreadList } from "@blumi/contracts"

export function shouldConnectGlobalRealtime(isDemoMode: boolean): boolean {
  return !isDemoMode
}

export function createLoadedDemoThreadList(
  userId: string,
  threads: ChatThread[]
): ChatThreadList {
  return {
    userId,
    threads: [...threads]
  }
}
