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
  resynchronizeActiveConversation?: () => Promise<void>
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
  /** Returns false when the socket refused the event. */
  sendGlobal: (event: ClientEvent) => boolean | void
  /** Records a first-page thread list request so a stale reply cannot erase newer threads. */
  noteThreadListRequested?: () => void
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

/** Profile presentation changes must not tear down an authenticated socket. */
export function getGlobalRealtimeLifecycleIdentity(actor: SessionActor | null): string | null {
  if (!actor) return null
  return JSON.stringify([
    actor.session.mode,
    actor.session.accountId,
    actor.session.sessionId,
    actor.session.userId,
    actor.profile.userId,
    actor.session.sessionToken
  ])
}

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

    let hasConnected = false
    let connected = false
    let connectionGeneration = 0
    const unsubscribeConnected = dependencies.subscribeToStatus((status) => {
      if (!active || !dependencies.isCurrentSession(actor)) return
      if (status !== "connected") {
        if (connected) connectionGeneration += 1
        connected = false
        return
      }
      if (connected) return
      connected = true
      const generation = ++connectionGeneration
      const reconnect = hasConnected
      hasConnected = true
      if (dependencies.sendGlobal({ type: "chat.list_threads", payload: {} }) !== false) {
        dependencies.noteThreadListRequested?.()
      }
      if (!reconnect) return
      void dependencies.hydrateBlockedUsersFromServer(actor.profile.userId, actor.session.sessionToken)
        .catch(() => {
          if (!active || generation !== connectionGeneration || !dependencies.isCurrentSession(actor)) return
          dependencies.showWarningToast({ title: "Safety sync delayed", body: globalRefreshFailureCopy.safety })
        })
      void dependencies.resynchronizeActiveConversation?.().catch(() => {
        // The coordinator already reports a current history failure. Older
        // reconnect failures are intentionally silent after a newer snapshot.
      })
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
