import type { ChatMessage, ChatMessageList } from "@blumi/contracts"
import type { ClientEvent } from "@blumi/realtime-client"
import type { ProductEventName } from "../../analytics/productAnalytics"
import type { ProductEventProperties } from "../../analytics/productAnalyticsPolicy"
import type { SessionActor } from "../session/sessionModel"
import type {
  FetchThreadMessagesOptions,
  MarkThreadReadOptions,
  SendThreadMessageOptions
} from "./chatApi"
import {
  withoutEndedRoom,
  type ChatRoomInviteAction,
  type ChatRoomInviteTimelineItem
} from "./chatRoomInviteModel"
import {
  RoomInviteApiError,
  type RoomInviteDecisionResult,
  type RoomSessionJoinResult
} from "./chatRoomInviteApi"
import {
  getMessageListErrorMessageForDisplay,
  getMessageSendErrorMessageForDisplay,
  getRoomInvitationActionErrorMessageForDisplay,
  getRoomInvitationLoadErrorMessageForDisplay
} from "./chatErrorCopy"

const pendingMessageSendsBySessionThread = new Map<string, Promise<void>>()

export type RoomInvitesUpdater = (
  current: readonly ChatRoomInviteTimelineItem[]
) => ChatRoomInviteTimelineItem[]

export interface ChatCoordinatorDependencies {
  hasMessageHistory?: (threadId: string) => boolean
  getSessionActor: () => SessionActor | null
  isCurrentSession: (expectedActor: SessionActor) => boolean
  setRoomInvites: (update: RoomInvitesUpdater) => void
  fetchThreadRoomInvites: (
    baseHttpUrl: string,
    sessionToken: string,
    threadId: string
  ) => Promise<ChatRoomInviteTimelineItem[]>
  sendThreadMessage: (
    baseHttpUrl: string,
    sessionToken: string,
    threadId: string,
    body: string,
    options?: SendThreadMessageOptions
  ) => Promise<ChatMessage>
  fetchThreadMessages: (
    baseHttpUrl: string,
    sessionToken: string,
    threadId: string,
    options?: FetchThreadMessagesOptions
  ) => Promise<ChatMessageList>
  markThreadRead: (
    baseHttpUrl: string,
    sessionToken: string,
    threadId: string,
    options?: MarkThreadReadOptions
  ) => Promise<void>
  createThreadRoomInvite: (
    baseHttpUrl: string,
    sessionToken: string,
    threadId: string
  ) => Promise<ChatRoomInviteTimelineItem>
  leaveActiveRoom: (
    baseHttpUrl: string,
    sessionToken: string,
    expectedRoomSessionId: string
  ) => Promise<{ ended: boolean }>
  decideThreadRoomInvite: (
    baseHttpUrl: string,
    sessionToken: string,
    inviteId: string,
    status: "accepted" | "declined"
  ) => Promise<RoomInviteDecisionResult>
  cancelThreadRoomInvite: (
    baseHttpUrl: string,
    sessionToken: string,
    inviteId: string
  ) => Promise<ChatRoomInviteTimelineItem>
  joinRoomSession: (
    baseHttpUrl: string,
    sessionToken: string,
    roomSessionId: string
  ) => Promise<RoomSessionJoinResult>
  applyChatMessageListed: (payload: ChatMessageList) => void
  applyChatMessageListLoading: (threadId: string) => void
  applyChatMessageListFailed: (
    threadId: string,
    errorMessage: string
  ) => void
  confirmOptimisticMessage: (
    clientMessageId: string,
    message: ChatMessage,
    localUserId: string
  ) => void
  markOptimisticMessageFailed: (clientMessageId: string) => void
  markLocalThreadRead: (threadId: string) => void
  openReadyMiniRoom: (
    payload: RoomSessionJoinResult,
    options?: { allowReopen?: boolean }
  ) => void
  captureProductEvent: (
    eventName: ProductEventName,
    properties: ProductEventProperties
  ) => void
  showWarningToast: (toast: { title: string; body: string }) => void
  sendGlobal: (event: ClientEvent) => void
  baseHttpUrl: string
}

export interface ChatCoordinator {
  resynchronizeMessages: (threadId: string) => Promise<void>
  refreshThreadRoomInvites: (threadId: string) => Promise<void>
  sendChatMessage: (
    threadId: string,
    body: string,
    clientMessageId: string
  ) => Promise<void>
  requestMessages: (
    threadId: string,
    options?: FetchThreadMessagesOptions,
    config?: { purpose: "prefetch" }
  ) => Promise<void>
  handleRoomInviteAction: (action: ChatRoomInviteAction) => Promise<void>
  closeMyActiveRoom: (expectedRoomSessionId: string) => Promise<void>
  markChatThreadRead: (threadId: string, upToMessageId?: string) => void
  replaceThreadRoomInvites: (
    threadId: string,
    nextInvites: readonly ChatRoomInviteTimelineItem[]
  ) => void
  upsertRoomInvite: (invite: ChatRoomInviteTimelineItem) => void
  /**
   * `mini_room.ended`: the server ended this room. Its invite stops offering
   * entry, now and in any invite response that was already in flight.
   */
  closeEndedRoom: (roomSessionId: string) => void
}

export function createChatCoordinator(
  dependencies: ChatCoordinatorDependencies
): ChatCoordinator {
  const pendingFirstPages = new Map<string, Promise<void>>()
  const recentFirstPages = new Map<string, number>()
  const recentRoomInvitePages = new Map<string, number>()
  const requestEpochs = new Map<string, number>()
  const sessionThreadKey = (actor: SessionActor, threadId: string): string =>
    JSON.stringify([actor.profile.userId, actor.session.sessionId, actor.session.sessionToken, threadId])
  const roomInviteRevisions = new Map<string, number>()
  const roomInviteMutationRevisions = new Map<string, number>()
  const pendingRoomInviteRefreshes = new Map<string, {
    sessionToken: string
    sessionId: string
    userId: string
    promise: Promise<void>
  }>()
  const handledRoomInviteRefreshFailures = new WeakSet<Promise<void>>()
  // Room ids are never reused, so an ended room stays ended for this session.
  const endedRoomSessionIds = new Set<string>()
  const isRoomEnded = (roomSessionId: string): boolean => endedRoomSessionIds.has(roomSessionId)

  const getRoomInviteRevision = (threadId: string): number =>
    roomInviteRevisions.get(threadId) ?? 0

  const bumpRoomInviteRevision = (threadId: string, inviteId: string): number => {
    const nextRevision = getRoomInviteRevision(threadId) + 1
    roomInviteRevisions.set(threadId, nextRevision)
    roomInviteMutationRevisions.set(inviteId, nextRevision)
    return nextRevision
  }

  const getProductionActor = (): SessionActor | null => {
    const actor = dependencies.getSessionActor()
    return actor?.session.mode === "production" ? actor : null
  }

  const replaceThreadRoomInvites = (
    threadId: string,
    nextInvites: readonly ChatRoomInviteTimelineItem[],
    refreshStartedAt = getRoomInviteRevision(threadId)
  ): void => {
    const preserveNewerUpdates = getRoomInviteRevision(threadId) > refreshStartedAt
    dependencies.setRoomInvites((current) => [
      ...current.filter((invite) => invite.threadId !== threadId),
      ...nextInvites.map((nextInvite) => withoutEndedRoom(nextInvite, isRoomEnded)).map((invite) => {
        const currentInvite = current.find((entry) => entry.inviteId === invite.inviteId)
        const currentRevision = roomInviteMutationRevisions.get(invite.inviteId) ?? 0
        return preserveNewerUpdates && currentInvite && currentRevision > refreshStartedAt
          ? currentInvite
          : invite
      }),
      ...(preserveNewerUpdates
        ? current.filter(
            (invite) =>
              invite.threadId === threadId &&
              !nextInvites.some((nextInvite) => nextInvite.inviteId === invite.inviteId) &&
              (roomInviteMutationRevisions.get(invite.inviteId) ?? 0) > refreshStartedAt
          )
        : [])
    ])
  }

  const upsertRoomInvite = (invite: ChatRoomInviteTimelineItem): void => {
    bumpRoomInviteRevision(invite.threadId, invite.inviteId)
    dependencies.setRoomInvites((current) => [
      ...current.filter((entry) => entry.inviteId !== invite.inviteId),
      withoutEndedRoom(invite, isRoomEnded)
    ])
  }

  const closeEndedRoom = (roomSessionId: string): void => {
    if (endedRoomSessionIds.has(roomSessionId)) return
    endedRoomSessionIds.add(roomSessionId)
    dependencies.setRoomInvites((current) =>
      current.map((invite) => withoutEndedRoom(invite, isRoomEnded))
    )
  }

  const refreshThreadRoomInvites = (threadId: string): Promise<void> => {
    const actor = getProductionActor()
    if (!actor) return Promise.resolve()
    const key = sessionThreadKey(actor, threadId)
    const epoch = requestEpochs.get(key) ?? 0
    const pending = pendingRoomInviteRefreshes.get(threadId)
    if (pending?.sessionToken === actor.session.sessionToken &&
      pending.sessionId === actor.session.sessionId &&
      pending.userId === actor.profile.userId) {
      return pending.promise
    }
    const refreshStartedAt = getRoomInviteRevision(threadId)
    const promise = (async () => {
      const invites = await dependencies.fetchThreadRoomInvites(
        dependencies.baseHttpUrl,
        actor.session.sessionToken,
        threadId
      )
      if (!dependencies.isCurrentSession(actor) || (requestEpochs.get(key) ?? 0) !== epoch) return
      replaceThreadRoomInvites(threadId, invites, refreshStartedAt)
      recentRoomInvitePages.set(sessionThreadKey(actor, threadId), Date.now())
    })()
    pendingRoomInviteRefreshes.set(threadId, {
      sessionToken: actor.session.sessionToken,
      sessionId: actor.session.sessionId,
      userId: actor.profile.userId,
      promise
    })
    const clearPending = (): void => {
      if (pendingRoomInviteRefreshes.get(threadId)?.promise === promise) {
        pendingRoomInviteRefreshes.delete(threadId)
      }
    }
    void promise.then(clearPending, clearPending)
    return promise
  }

  const sendChatMessage = (
    threadId: string,
    body: string,
    clientMessageId: string
  ): Promise<void> => {
    const actor = getProductionActor()
    if (!actor) {
      dependencies.sendGlobal({
        type: "chat.send_message",
        payload: { threadId, body }
      })
      return Promise.resolve()
    }

    const queueKey = JSON.stringify([
      actor.profile.userId,
      actor.session.sessionId,
      threadId
    ])
    const send = async (): Promise<void> => {
      if (!dependencies.isCurrentSession(actor)) return
      try {
        const message = await dependencies.sendThreadMessage(
          dependencies.baseHttpUrl,
          actor.session.sessionToken,
          threadId,
          body,
          { clientMessageId }
        )
        if (dependencies.isCurrentSession(actor)) {
          dependencies.confirmOptimisticMessage(
            clientMessageId,
            message,
            actor.profile.userId
          )
        }
      } catch (error) {
        if (dependencies.isCurrentSession(actor)) {
          dependencies.markOptimisticMessageFailed(clientMessageId)
          dependencies.showWarningToast({
            title: "Message not sent",
            body: getMessageSendErrorMessageForDisplay(error)
          })
        }
        throw error
      }
    }

    const previous = pendingMessageSendsBySessionThread.get(queueKey)
    const pending = previous
      ? previous.catch(() => undefined).then(send)
      : send()
    pendingMessageSendsBySessionThread.set(queueKey, pending)
    const clearQueue = (): void => {
      if (pendingMessageSendsBySessionThread.get(queueKey) === pending) {
        pendingMessageSendsBySessionThread.delete(queueKey)
      }
    }
    void pending.then(clearQueue, clearQueue)
    return pending
  }

  const requestMessages = (
    threadId: string,
    options: FetchThreadMessagesOptions = {},
    config?: { purpose: "prefetch" }
  ): Promise<void> => {
    const actor = getProductionActor()
    if (!actor) {
      dependencies.applyChatMessageListLoading(threadId)
      dependencies.sendGlobal({
        type: "chat.list_messages",
        payload: { threadId }
      })
      return Promise.resolve()
    }

    const key = sessionThreadKey(actor, threadId)
    const epoch = requestEpochs.get(key) ?? 0
    const isCurrentRequest = (): boolean => dependencies.isCurrentSession(actor) &&
      (requestEpochs.get(key) ?? 0) === epoch
    let openingInvites = Promise.resolve()
    const inviteFetchedAt = recentRoomInvitePages.get(sessionThreadKey(actor, threadId))
    if (inviteFetchedAt === undefined || Date.now() - inviteFetchedAt >= 10_000) {
      const inviteRefresh = refreshThreadRoomInvites(threadId)
      openingInvites = inviteRefresh.catch(() => undefined)
      if (config?.purpose === "prefetch") {
        // Warm the durable invite alongside history, without unsolicited alerts.
        // Opening can attach its own error handling to the same in-flight request.
        void inviteRefresh.catch(() => undefined)
      } else if (!handledRoomInviteRefreshFailures.has(inviteRefresh)) {
        handledRoomInviteRefreshFailures.add(inviteRefresh)
        void inviteRefresh.catch((error) => {
          if (!isCurrentRequest()) return
          dependencies.showWarningToast({
            title: "Room invitations unavailable",
            body: getRoomInvitationLoadErrorMessageForDisplay(
              error instanceof Error ? error.message : ""
            )
          })
        })
      }
    }

    const firstPageKey = !options.before && options.limit === undefined
      ? sessionThreadKey(actor, threadId)
      : null
    if (firstPageKey) {
      const pending = pendingFirstPages.get(firstPageKey)
      if (pending) return pending
      const fetchedAt = recentFirstPages.get(firstPageKey)
      if (fetchedAt !== undefined && Date.now() - fetchedAt < 10_000) {
        return openingInvites
      }
    }

    // A prefetch is invisible: it starts on a row's press-in, and marking the
    // thread "loading" would notify every chat store reader (the Inbox
    // re-render) while the finger is down, delaying the tap's own navigation.
    // An opened chat waiting on it shows its loading state without the flag.
    if (config?.purpose !== "prefetch") dependencies.applyChatMessageListLoading(threadId)
    const request = (async () => {
      try {
        const messageList = await dependencies.fetchThreadMessages(
          dependencies.baseHttpUrl,
          actor.session.sessionToken,
          threadId,
          options
        )
        // Both requests start concurrently. Only the cold first page waits for
        // its invite snapshot before publication; cached conversations and
        // older-history pagination stay visible and independent.
        if (!options.before && !dependencies.hasMessageHistory?.(threadId)) {
          await openingInvites
        }
        if (!isCurrentRequest()) return
        dependencies.applyChatMessageListed(messageList)
        if (firstPageKey) recentFirstPages.set(firstPageKey, Date.now())
      } catch (error) {
        if (isCurrentRequest()) {
          const errorMessage = getMessageListErrorMessageForDisplay(
            error instanceof Error ? error.message : ""
          )
          dependencies.applyChatMessageListFailed(threadId, errorMessage)
          if (config?.purpose !== "prefetch") {
            dependencies.showWarningToast({ title: "Chat not loaded", body: errorMessage })
          }
        }
        throw error
      }
    })()
    if (firstPageKey) {
      pendingFirstPages.set(firstPageKey, request)
      const clearPending = (): void => {
        if (pendingFirstPages.get(firstPageKey) === request) pendingFirstPages.delete(firstPageKey)
      }
      void request.then(clearPending, clearPending)
    }
    return request
  }

  const resynchronizeMessages = (threadId: string): Promise<void> => {
    const actor = getProductionActor()
    if (!actor) return Promise.resolve()
    const key = sessionThreadKey(actor, threadId)
    requestEpochs.set(key, (requestEpochs.get(key) ?? 0) + 1)
    recentFirstPages.delete(key)
    recentRoomInvitePages.delete(key)
    pendingFirstPages.delete(key)
    const pending = pendingRoomInviteRefreshes.get(threadId)
    if (pending?.sessionToken === actor.session.sessionToken &&
      pending.sessionId === actor.session.sessionId && pending.userId === actor.profile.userId) {
      pendingRoomInviteRefreshes.delete(threadId)
    }
    return requestMessages(threadId)
  }

  const handleRoomInviteAction = async (
    action: ChatRoomInviteAction
  ): Promise<void> => {
    const actor = getProductionActor()
    if (!actor) {
      throw new Error("Blumi Room invitations are available after a mutual match.")
    }

    try {
      if (action.type === "create") {
        const invite = await dependencies.createThreadRoomInvite(
          dependencies.baseHttpUrl,
          actor.session.sessionToken,
          action.threadId
        )
        if (!dependencies.isCurrentSession(actor)) return
        upsertRoomInvite(invite)
        dependencies.captureProductEvent("room_invite_sent", { mode: actor.session.mode })
        return
      }

      if (action.type === "accept" || action.type === "decline") {
        const { readyRoom, ...invite } = await dependencies.decideThreadRoomInvite(
          dependencies.baseHttpUrl,
          actor.session.sessionToken,
          action.inviteId,
          action.type === "accept" ? "accepted" : "declined"
        )
        if (!dependencies.isCurrentSession(actor)) return
        upsertRoomInvite(invite)
        // Acceptance unlocks the card. Revalidate entry with an explicit join;
        // do not retain the decision's media token for a later, stale entry.
        void readyRoom
        dependencies.captureProductEvent(
          action.type === "accept" ? "room_invite_accepted" : "room_invite_declined",
          { mode: actor.session.mode }
        )
        return
      }

      if (action.type === "cancel") {
        const invite = await dependencies.cancelThreadRoomInvite(
          dependencies.baseHttpUrl,
          actor.session.sessionToken,
          action.inviteId
        )
        if (!dependencies.isCurrentSession(actor)) return
        upsertRoomInvite(invite)
        dependencies.captureProductEvent("room_invite_cancelled", { mode: actor.session.mode })
        return
      }

      const roomReady = await dependencies.joinRoomSession(
        dependencies.baseHttpUrl,
        actor.session.sessionToken,
        action.roomSessionId
      )
      if (!dependencies.isCurrentSession(actor)) return
      dependencies.openReadyMiniRoom(roomReady, { allowReopen: true })
      dependencies.captureProductEvent("room_joined", { mode: actor.session.mode })
    } catch (error) {
      const busyCode = error instanceof RoomInviteApiError ? error.code : null
      if (dependencies.isCurrentSession(actor) &&
        !(action.type === "create" && busyCode === "SELF_IN_ROOM")) {
        dependencies.showWarningToast({
          title: "Room invitation unavailable",
          body: getRoomInvitationActionErrorMessageForDisplay(
            error instanceof Error ? error.message : "",
            undefined,
            busyCode
          )
        })
      }
      throw error
    }
  }

  const closeMyActiveRoom = async (expectedRoomSessionId: string): Promise<void> => {
    const actor = getProductionActor()
    if (!actor) throw new Error("A signed-in account is required to close a room.")
    await dependencies.leaveActiveRoom(
      dependencies.baseHttpUrl,
      actor.session.sessionToken,
      expectedRoomSessionId
    )
  }

  const markChatThreadRead = (threadId: string, upToMessageId?: string): void => {
    const actor = getProductionActor()
    if (actor) {
      void dependencies
        .markThreadRead(
          dependencies.baseHttpUrl,
          actor.session.sessionToken,
          threadId,
          { expectedUserId: actor.session.userId, ...(upToMessageId ? { upToMessageId } : {}) }
        )
        .catch(() => undefined)
    }
    dependencies.markLocalThreadRead(threadId)
  }

  return {
    resynchronizeMessages,
    refreshThreadRoomInvites,
    sendChatMessage,
    requestMessages,
    handleRoomInviteAction,
    closeMyActiveRoom,
    markChatThreadRead,
    replaceThreadRoomInvites,
    upsertRoomInvite,
    closeEndedRoom
  }
}
