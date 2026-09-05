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
import type {
  ChatRoomInviteAction,
  ChatRoomInviteTimelineItem
} from "./chatRoomInviteModel"
import type { RoomSessionJoinResult } from "./chatRoomInviteApi"
import {
  getMessageListErrorMessageForDisplay,
  getMessageSendErrorMessageForDisplay,
  getRoomInvitationActionErrorMessageForDisplay,
  getRoomInvitationLoadErrorMessageForDisplay
} from "./chatErrorCopy"

export type RoomInvitesUpdater = (
  current: readonly ChatRoomInviteTimelineItem[]
) => ChatRoomInviteTimelineItem[]

export interface ChatCoordinatorDependencies {
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
  decideThreadRoomInvite: (
    baseHttpUrl: string,
    sessionToken: string,
    inviteId: string,
    status: "accepted" | "declined"
  ) => Promise<ChatRoomInviteTimelineItem>
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
  refreshThreadRoomInvites: (threadId: string) => Promise<void>
  sendChatMessage: (
    threadId: string,
    body: string,
    clientMessageId: string
  ) => Promise<void>
  requestMessages: (
    threadId: string,
    options?: FetchThreadMessagesOptions
  ) => Promise<void>
  handleRoomInviteAction: (action: ChatRoomInviteAction) => Promise<void>
  markChatThreadRead: (threadId: string) => void
  replaceThreadRoomInvites: (
    threadId: string,
    nextInvites: readonly ChatRoomInviteTimelineItem[]
  ) => void
  upsertRoomInvite: (invite: ChatRoomInviteTimelineItem) => void
}

export function createChatCoordinator(
  dependencies: ChatCoordinatorDependencies
): ChatCoordinator {
  const roomInviteRevisions = new Map<string, number>()
  const roomInviteMutationRevisions = new Map<string, number>()

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
      ...nextInvites.map((invite) => {
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
      invite
    ])
  }

  const refreshThreadRoomInvites = async (threadId: string): Promise<void> => {
    const actor = getProductionActor()
    if (!actor) return
    const refreshStartedAt = getRoomInviteRevision(threadId)
    const invites = await dependencies.fetchThreadRoomInvites(
      dependencies.baseHttpUrl,
      actor.session.sessionToken,
      threadId
    )
    if (!dependencies.isCurrentSession(actor)) return
    replaceThreadRoomInvites(threadId, invites, refreshStartedAt)
  }

  const sendChatMessage = async (
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
      return
    }

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
          body: getMessageSendErrorMessageForDisplay(
            error instanceof Error ? error.message : ""
          )
        })
      }
      throw error
    }
  }

  const requestMessages = async (
    threadId: string,
    options: FetchThreadMessagesOptions = {}
  ): Promise<void> => {
    dependencies.applyChatMessageListLoading(threadId)
    const actor = getProductionActor()
    if (!actor) {
      dependencies.sendGlobal({
        type: "chat.list_messages",
        payload: { threadId }
      })
      return
    }

    try {
      const messageList = await dependencies.fetchThreadMessages(
        dependencies.baseHttpUrl,
        actor.session.sessionToken,
        threadId,
        options
      )
      if (!dependencies.isCurrentSession(actor)) return
      dependencies.applyChatMessageListed(messageList)
      void refreshThreadRoomInvites(threadId).catch((error) => {
        if (!dependencies.isCurrentSession(actor)) return
        dependencies.showWarningToast({
          title: "Room invitations unavailable",
          body: getRoomInvitationLoadErrorMessageForDisplay(
            error instanceof Error ? error.message : ""
          )
        })
      })
    } catch (error) {
      if (dependencies.isCurrentSession(actor)) {
        const errorMessage = getMessageListErrorMessageForDisplay(
          error instanceof Error ? error.message : ""
        )
        dependencies.applyChatMessageListFailed(threadId, errorMessage)
        dependencies.showWarningToast({
          title: "Chat not loaded",
          body: errorMessage
        })
      }
      throw error
    }
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
        const invite = await dependencies.decideThreadRoomInvite(
          dependencies.baseHttpUrl,
          actor.session.sessionToken,
          action.inviteId,
          action.type === "accept" ? "accepted" : "declined"
        )
        if (!dependencies.isCurrentSession(actor)) return
        upsertRoomInvite(invite)
        if (action.type === "accept" && invite.roomSessionId) {
          const roomReady = await dependencies.joinRoomSession(
            dependencies.baseHttpUrl,
            actor.session.sessionToken,
            invite.roomSessionId
          )
          if (!dependencies.isCurrentSession(actor)) return
          dependencies.openReadyMiniRoom(roomReady, { allowReopen: true })
        }
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
      if (dependencies.isCurrentSession(actor)) {
        dependencies.showWarningToast({
          title: "Room invitation unavailable",
          body: getRoomInvitationActionErrorMessageForDisplay(
            error instanceof Error ? error.message : ""
          )
        })
      }
      throw error
    }
  }

  const markChatThreadRead = (threadId: string): void => {
    const actor = getProductionActor()
    if (actor) {
      void dependencies
        .markThreadRead(
          dependencies.baseHttpUrl,
          actor.session.sessionToken,
          threadId,
          { expectedUserId: actor.session.userId }
        )
        .catch(() => undefined)
    }
    dependencies.markLocalThreadRead(threadId)
  }

  return {
    refreshThreadRoomInvites,
    sendChatMessage,
    requestMessages,
    handleRoomInviteAction,
    markChatThreadRead,
    replaceThreadRoomInvites,
    upsertRoomInvite
  }
}
