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
  type ChatRoomInvitePage,
  type FetchRoomInvitePageOptions,
  type RoomInviteDecisionResult,
  type RoomSessionJoinResult
} from "./chatRoomInviteApi"
import {
  applyLatestRoomInvitePage,
  applyOlderRoomInvitePage,
  getChatRoomInviteHistory,
  observeRoomInviteArrival,
  observeRoomInviteActiveContext
} from "./chatRoomInvitePagingStore"
import {
  getMessageListErrorMessageForDisplay,
  getMessageSendErrorMessageForDisplay,
  getRoomInvitationActionErrorMessageForDisplay,
  getRoomInvitationLoadErrorMessageForDisplay
} from "./chatErrorCopy"
import { areRoomInviteListsEqual } from "./roomInviteListEquality"
import { CHAT_INITIAL_HISTORY_LIMIT } from "./chatHistoryPolicy"

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
  fetchThreadRoomInvitePage?: (
    baseHttpUrl: string, sessionToken: string, threadId: string, options: FetchRoomInvitePageOptions
  ) => Promise<ChatRoomInvitePage>
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
  applyChatMessageListed: (payload: ChatMessageList, options?: { before?: string }) => void
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
  /** False when the bubble already settled or was removed; no failure UI is needed. */
  markOptimisticMessageFailed: (clientMessageId: string) => boolean | void
  markLocalThreadRead: (threadId: string, upToMessageId?: string) => void
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
  requestOlderRoomInvites: (threadId: string, before: string) => Promise<readonly string[]>
  ensureRoomInvite: (threadId: string, inviteId: string) => Promise<boolean>
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
  const pendingInvitePages = new Map<string, Promise<readonly string[]>>()
  const knownInviteIds = new Set<string>()
  const currentInviteRecords = new Map<string, ChatRoomInviteTimelineItem>()
  const liveInviteArrivalRevisions = new Map<string, number>()
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
    dependencies.setRoomInvites((current) => {
      const threadInvites = [
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
      ]
      // An unchanged refresh keeps the current list, so the navigator that
      // holds it does not re-render (up to six refreshes per Inbox visit).
      const currentThreadInvites = current.filter((invite) => invite.threadId === threadId)
      if (areRoomInviteListsEqual(currentThreadInvites, threadInvites)) return current as ChatRoomInviteTimelineItem[]
      return [
        ...current.filter((invite) => invite.threadId !== threadId),
        ...threadInvites
      ]
    })
  }

  const mergeThreadRoomInvites = (threadId: string, nextInvites: readonly ChatRoomInviteTimelineItem[], refreshStartedAt: number): void => {
    for (const invite of nextInvites) {
      knownInviteIds.add(invite.inviteId)
      if ((roomInviteMutationRevisions.get(invite.inviteId) ?? 0) <= refreshStartedAt) {
        currentInviteRecords.set(invite.inviteId, withoutEndedRoom(invite, isRoomEnded))
      }
    }
    dependencies.setRoomInvites(current => {
      const byId = new Map(current.filter(invite => invite.threadId === threadId).map(invite => [invite.inviteId, invite]))
      for (const next of nextInvites) {
        const newer = (roomInviteMutationRevisions.get(next.inviteId) ?? 0) > refreshStartedAt
        if (!newer || !byId.has(next.inviteId)) byId.set(next.inviteId, withoutEndedRoom(next, isRoomEnded))
      }
      const merged = [...byId.values()]
      if (areRoomInviteListsEqual(current.filter(invite => invite.threadId === threadId), merged)) return current as ChatRoomInviteTimelineItem[]
      return [...current.filter(invite => invite.threadId !== threadId), ...merged]
    })
  }

  const upsertRoomInvite = (invite: ChatRoomInviteTimelineItem, targeted = false): void => {
    const actor = getProductionActor()
    if (actor && invite.senderUserId !== actor.profile.userId && invite.recipientUserId !== actor.profile.userId) return
    const isNew = !knownInviteIds.has(invite.inviteId)
    knownInviteIds.add(invite.inviteId)
    const revision = bumpRoomInviteRevision(invite.threadId, invite.inviteId)
    currentInviteRecords.set(invite.inviteId, withoutEndedRoom(invite, isRoomEnded))
    if (isNew && !targeted) liveInviteArrivalRevisions.set(invite.inviteId, revision)
    dependencies.setRoomInvites((current) => [
      ...current.filter((entry) => entry.inviteId !== invite.inviteId),
      withoutEndedRoom(invite, isRoomEnded)
    ])
    if (actor) {
      if (isNew && !targeted) observeRoomInviteArrival(actor.profile.userId, invite.threadId, invite.inviteId)
      observeRoomInviteActiveContext(actor.profile.userId, invite.threadId, invite.inviteId,
        invite.status === "pending" || invite.status === "accepted" && Boolean(invite.roomSessionId) && !isRoomEnded(invite.roomSessionId!))
    }
  }

  const closeEndedRoom = (roomSessionId: string): void => {
    if (endedRoomSessionIds.has(roomSessionId)) return
    endedRoomSessionIds.add(roomSessionId)
    dependencies.setRoomInvites((current) =>
      current.map((invite) => withoutEndedRoom(invite, isRoomEnded))
    )
    const actor = getProductionActor()
    for (const [id, invite] of currentInviteRecords) {
      if (invite.roomSessionId !== roomSessionId) continue
      currentInviteRecords.set(id, withoutEndedRoom(invite, isRoomEnded))
      if (actor) observeRoomInviteActiveContext(actor.profile.userId, invite.threadId, id, false)
    }
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
      const page = dependencies.fetchThreadRoomInvitePage ? await dependencies.fetchThreadRoomInvitePage(
        dependencies.baseHttpUrl, actor.session.sessionToken, threadId, { limit: CHAT_INITIAL_HISTORY_LIMIT }
      ) : null
      const invites = page ? page.invites : await dependencies.fetchThreadRoomInvites(
        dependencies.baseHttpUrl,
        actor.session.sessionToken,
        threadId
      )
      if (!dependencies.isCurrentSession(actor) || (requestEpochs.get(key) ?? 0) !== epoch) return
      if (page) {
        mergeThreadRoomInvites(threadId, [...invites, ...page.activeInvites], refreshStartedAt)
        const activeIds = new Set([...page.activeInvites, ...invites].filter(invite => {
          const current = currentInviteRecords.get(invite.inviteId) ?? invite
          return current.status === "pending" || current.status === "accepted" && Boolean(current.roomSessionId)
        }).map(invite => invite.inviteId))
        for (const current of currentInviteRecords.values()) {
          if (current.threadId === threadId && (roomInviteMutationRevisions.get(current.inviteId) ?? 0) > refreshStartedAt) {
            if (current.status === "pending" || current.status === "accepted" && Boolean(current.roomSessionId)) activeIds.add(current.inviteId)
            else activeIds.delete(current.inviteId)
          }
        }
        applyLatestRoomInvitePage({ userId: actor.profile.userId, threadId, inviteIds: invites.map(invite => invite.inviteId),
          activeInviteIds: [...activeIds],
          activeContextKnown: page.paged, nextCursor: page.nextCursor })
        for (const [id, revision] of liveInviteArrivalRevisions) {
          if (revision > refreshStartedAt && currentInviteRecords.get(id)?.threadId === threadId) {
            observeRoomInviteArrival(actor.profile.userId, threadId, id)
          }
        }
      } else replaceThreadRoomInvites(threadId, invites, refreshStartedAt)
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

  const requestOlderRoomInvites = (threadId: string, before: string): Promise<readonly string[]> => {
    const actor = getProductionActor()
    if (!actor || !dependencies.fetchThreadRoomInvitePage) return Promise.resolve([])
    const key = sessionThreadKey(actor, threadId)
    const pendingKey = `${key}:${before}`
    const pending = pendingInvitePages.get(pendingKey)
    if (pending) return pending
    const epoch = requestEpochs.get(key) ?? 0
    const revision = getRoomInviteRevision(threadId)
    const request = (async () => {
      const page = await dependencies.fetchThreadRoomInvitePage!(dependencies.baseHttpUrl, actor.session.sessionToken,
        threadId, { before, limit: CHAT_INITIAL_HISTORY_LIMIT })
      if (!dependencies.isCurrentSession(actor) || (requestEpochs.get(key) ?? 0) !== epoch ||
        getChatRoomInviteHistory(threadId, actor.profile.userId).nextCursor !== before) return []
      mergeThreadRoomInvites(threadId, page.invites, revision)
      if (!applyOlderRoomInvitePage({ userId: actor.profile.userId, threadId, before,
        inviteIds: page.invites.map(invite => invite.inviteId), nextCursor: page.nextCursor })) return []
      return page.invites.map(invite => invite.inviteId)
    })()
    pendingInvitePages.set(pendingKey, request)
    const clear = () => { if (pendingInvitePages.get(pendingKey) === request) pendingInvitePages.delete(pendingKey) }
    void request.then(clear, clear)
    return request
  }

  const ensureRoomInvite = async (threadId: string, inviteId: string): Promise<boolean> => {
    const actor = getProductionActor()
    if (!actor || !dependencies.fetchThreadRoomInvitePage) return false
    const revision = getRoomInviteRevision(threadId)
    const page = await dependencies.fetchThreadRoomInvitePage(dependencies.baseHttpUrl, actor.session.sessionToken,
      threadId, { inviteId })
    // An exact invitation lookup is independent from a message reconnect.
    // Cancellation is retryable; it must not masquerade as an authoritative
    // missing invitation and consume a notification action.
    if (!dependencies.isCurrentSession(actor)) {
      const cancelled = new Error("Room invitation lookup was cancelled.")
      cancelled.name = "AbortError"
      throw cancelled
    }
    const invite = page.invites.find(invite => invite.inviteId === inviteId)
    if (!invite) return false
    mergeThreadRoomInvites(threadId, [invite], revision)
    bumpRoomInviteRevision(threadId, invite.inviteId)
    const current = currentInviteRecords.get(invite.inviteId) ?? invite
    observeRoomInviteActiveContext(actor.profile.userId, threadId, invite.inviteId,
      current.status === "pending" || current.status === "accepted" && Boolean(current.roomSessionId))
    return true
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
          // Realtime may have published the committed message before a lost
          // HTTP response times out. Only warn for a bubble still marked failed;
          // this does not turn the transport failure into an invented ACK.
          const failed = dependencies.markOptimisticMessageFailed(clientMessageId)
          if (failed !== false) {
            dependencies.showWarningToast({
              title: "Message not sent",
              body: getMessageSendErrorMessageForDisplay(error)
            })
          }
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
    const requestOptions = !options.before && options.limit === undefined
      ? { ...options, limit: CHAT_INITIAL_HISTORY_LIMIT }
      : options
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
    if (config?.purpose !== "prefetch" && !dependencies.hasMessageHistory?.(threadId)) {
      dependencies.applyChatMessageListLoading(threadId)
    }
    const request = (async () => {
      try {
        const messageList = await dependencies.fetchThreadMessages(
          dependencies.baseHttpUrl,
          actor.session.sessionToken,
          threadId,
          requestOptions
        )
        // Messages are readable as soon as their own service answers. A slow
        // invitation request must not hold the conversation's history hostage;
        // it independently merges its durable cards into the same timeline.
        if (!isCurrentRequest()) return
        if (messageList.userId !== actor.profile.userId || messageList.threadId !== threadId ||
          messageList.messages.some((message) => message.threadId !== threadId)) {
          throw new Error("Blumi could not confirm that conversation.")
        }
        dependencies.applyChatMessageListed(messageList, { before: requestOptions.before })
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
    dependencies.markLocalThreadRead(threadId, upToMessageId)
  }

  return {
    resynchronizeMessages,
    refreshThreadRoomInvites,
    requestOlderRoomInvites,
    ensureRoomInvite,
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
