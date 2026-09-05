import type { ChatThread, ChatThreadList } from "@blumi/contracts"
import type { ClientEvent } from "@blumi/realtime-client"
import type { SessionActor } from "../session/sessionModel"
import {
  type RealtimeConnectionMeta,
  type RealtimeConnectionStatus
} from "./realtimeClient"
import {
  createLoadedDemoThreadList,
  shouldConnectGlobalRealtime
} from "./realtimeMode"

export interface GlobalRealtimeWarningToast {
  title: string
  body: string
}

export interface GlobalRealtimeLifecycleDependencies {
  sessionActor: SessionActor | null
  isMainRoute: boolean
  isAccountRestricted: boolean
  isCurrentSession: (expectedActor: SessionActor) => boolean
  isDemoMode: () => boolean
  setDemoMode: (enabled: boolean) => void
  resetInactiveSessionState: () => void
  refreshProductionThreads: () => Promise<void>
  hydrateBlockedUsersFromServer: (
    ownerUserId: string,
    sessionToken: string
  ) => Promise<void>
  connectGlobal: (
    wsBaseUrl: string,
    httpBaseUrl: string,
    sessionToken: string
  ) => void
  disconnectGlobal: () => void
  sendGlobal: (event: ClientEvent) => void
  subscribeToStatus: (
    listener: (status: RealtimeConnectionStatus, meta?: RealtimeConnectionMeta) => void
  ) => () => void
  applyChatThreadListed: (payload: ChatThreadList) => void
  getThreads: () => ChatThread[]
  isRealtimeAuthInvalidClose: (closeCode: number | undefined) => boolean
  clearSessionActor: () => Promise<void>
  refreshAccountModeration: () => Promise<void>
  showWarningToast: (toast: GlobalRealtimeWarningToast) => void
  wsBaseUrl: string
  httpBaseUrl: string
}

export type GlobalRealtimeLifecycleCleanup = () => void

const globalRefreshFailureCopy = {
  chats: "We couldn't refresh your chats yet. Check your connection and try again later.",
  safety: "We couldn't refresh your safety list yet. It will try again later."
} as const

/**
 * Owns the authenticated session's single global realtime lifecycle. The
 * returned starter is side-effectful by design, while its dependencies keep
 * transport, session, chat, and UI concerns explicit and testable.
 */
export function createGlobalRealtimeLifecycle(
  dependencies: GlobalRealtimeLifecycleDependencies
): () => GlobalRealtimeLifecycleCleanup {
  return (): GlobalRealtimeLifecycleCleanup => {
    const actor = dependencies.sessionActor
    if (!actor || !dependencies.isMainRoute || dependencies.isAccountRestricted) {
      dependencies.resetInactiveSessionState()
      return () => undefined
    }

    const isDemoSession = actor.session.mode === "demo"
    if (dependencies.isDemoMode() !== isDemoSession) {
      dependencies.resetInactiveSessionState()
      dependencies.setDemoMode(isDemoSession)
    }

    if (!shouldConnectGlobalRealtime(isDemoSession)) {
      dependencies.disconnectGlobal()
      dependencies.applyChatThreadListed(
        createLoadedDemoThreadList(actor.profile.userId, dependencies.getThreads())
      )
      return () => undefined
    }

    let active = true
    void dependencies.refreshProductionThreads().catch(() => {
      if (!active || !dependencies.isCurrentSession(actor)) return
      dependencies.showWarningToast({
        title: "Chats offline",
        body: globalRefreshFailureCopy.chats
      })
    })

    void dependencies
      .hydrateBlockedUsersFromServer(
        actor.profile.userId,
        actor.session.sessionToken
      )
      .catch(() => {
        if (!active || !dependencies.isCurrentSession(actor)) return
        dependencies.showWarningToast({
          title: "Safety list offline",
          body: globalRefreshFailureCopy.safety
        })
      })

    dependencies.connectGlobal(
      dependencies.wsBaseUrl,
      dependencies.httpBaseUrl,
      actor.session.sessionToken
    )

    const unsubscribeConnected = dependencies.subscribeToStatus((status) => {
      if (!active) return
      if (status === "connected") {
        dependencies.sendGlobal({ type: "chat.list_threads", payload: {} })
      }
    })

    const unsubscribeInvalidSession = dependencies.subscribeToStatus((_status, meta) => {
      if (!active) return
      if (dependencies.isRealtimeAuthInvalidClose(meta?.closeCode)) {
        active = false
        unsubscribeConnected()
        unsubscribeInvalidSession()
        dependencies.disconnectGlobal()
        void dependencies.clearSessionActor()
      }
      if (meta?.closeCode === 4403) {
        void dependencies.refreshAccountModeration()
      }
    })

    return () => {
      if (!active) return
      active = false
      unsubscribeConnected()
      unsubscribeInvalidSession()
      dependencies.disconnectGlobal()
    }
  }
}
