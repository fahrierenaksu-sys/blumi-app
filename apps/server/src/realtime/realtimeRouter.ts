import type { ClientEvent, ServerEvent } from "@blumi/contracts"
import type { ChatService } from "../chat/chatService"
import { createChatMessageDeliveryService } from "../chat/chatMessageDeliveryService"
import type { ConnectionService } from "../connections/connectionService"
import type { MiniRoomService } from "../miniRooms/miniRoomService"
import type { NotificationService } from "../notifications/notificationService"
import type { PresenceService } from "../presence/presenceService"
import type { ReactionService } from "../reactions/reactionService"
import type { SafetyService } from "../safety/safetyService"
import type {
  ConnectionManager,
  RealtimeConnection
} from "./connectionManager"
import {
  isRealtimePresenceRoomAllowed,
  PRESENCE_ROOM_UNAVAILABLE_CODE,
  PRESENCE_ROOM_UNAVAILABLE_MESSAGE,
  type RealtimePresenceRoomPolicy
} from "./realtimePresencePolicy"
import { safeOperationalErrorKind } from "../operations/safeErrorLog"

export interface RealtimeRouter {
  handleClientEvent(
    connection: RealtimeConnection,
    event: ClientEvent
  ): Promise<void>
  handleDisconnect(connection: RealtimeConnection): Promise<void>
}

export interface CreateRealtimeRouterOptions {
  connectionManager: ConnectionManager
  presenceService: PresenceService
  miniRoomService: MiniRoomService
  connectionService: ConnectionService
  reactionService: ReactionService
  chatService: ChatService
  safetyService: SafetyService
  notificationService: NotificationService
  /**
   * Which realtime presence rooms an authenticated actor may join, move in,
   * receive presence for, or react in. Defaults to the deny-all policy (legacy
   * public lobby retired, owner decision 2026-09-30); tests inject a narrower
   * allow rule to exercise presence mechanics.
   */
  isPresenceRoomAllowed?: RealtimePresenceRoomPolicy
}

export function createRealtimeRouter(
  options: CreateRealtimeRouterOptions
): RealtimeRouter {
  const {
    connectionManager,
    presenceService,
    miniRoomService,
    connectionService,
    reactionService,
    chatService,
    safetyService,
    notificationService
  } = options
  const isPresenceRoomAllowed =
    options.isPresenceRoomAllowed ?? isRealtimePresenceRoomAllowed
  const chatMessageDeliveryService = createChatMessageDeliveryService({
    chatService,
    safetyService,
    connectionManager,
    notificationService
  })

  /**
   * Publishes presence per recipient. Owner decision 2026-09-30: a user's
   * presence is never sent to someone who blocks or is blocked by them (blocked
   * peers are removed, not flagged), there is no unfiltered room broadcast, and
   * a recipient whose block lookup fails receives nothing (fail closed).
   * Recipients the presence-room policy does not allow receive nothing, which
   * makes the retired public lobby publish to nobody.
   */
  async function publishRoomPresence(roomId: string): Promise<void> {
    const snapshot = await presenceService.createSnapshot(roomId)
    await Promise.all(
      snapshot.users.map(async (user) => {
        let blockedUserIds: string[]
        try {
          if (!(await isPresenceRoomAllowed({ userId: user.userId }, roomId))) return
          blockedUserIds = await safetyService.listBlockedUserIdsBetween(
            user.userId,
            snapshot.users
              .filter((candidate) => candidate.userId !== user.userId)
              .map((candidate) => candidate.userId)
          )
        } catch (error) {
          console.error(
            "Realtime presence recipient check failed",
            safeOperationalErrorKind(error)
          )
          return
        }
        const blocked = new Set(blockedUserIds)
        connectionManager.sendToUser(user.userId, {
          type: "presence.snapshot",
          payload: {
            ...snapshot,
            users: snapshot.users.filter((candidate) => !blocked.has(candidate.userId))
          }
        })
        const nearbyUsers = await presenceService.listNearbyUsers(
          roomId,
          user.userId,
          blockedUserIds
        )
        connectionManager.sendToUser(user.userId, {
          type: "presence.nearby",
          payload: {
            roomId,
            userId: user.userId,
            nearbyUsers: nearbyUsers.filter(
              (nearbyUser) => !nearbyUser.blocked && !blocked.has(nearbyUser.userId)
            )
          }
        })
      })
    )
  }

  function rejectPresenceRoomRequest(
    connection: RealtimeConnection,
    requestType: ClientEvent["type"]
  ): void {
    connectionManager.sendToConnection(connection.connectionId, {
      type: "realtime.error",
      payload: {
        code: PRESENCE_ROOM_UNAVAILABLE_CODE,
        requestType,
        message: PRESENCE_ROOM_UNAVAILABLE_MESSAGE
      }
    })
  }

  async function canUsePresenceRoom(
    connection: RealtimeConnection,
    roomId: unknown
  ): Promise<boolean> {
    if (typeof roomId !== "string" || !roomId.trim()) return false
    return Boolean(await isPresenceRoomAllowed({ userId: connection.userId }, roomId))
  }

  async function endActiveRoomBetween(
    actorUserId: string,
    otherUserId: string
  ): Promise<void> {
    const endedRooms = await miniRoomService.separateUserPair(
      actorUserId,
      otherUserId
    )
    for (const ended of endedRooms) {
      connectionManager.sendToUsers(ended.participantUserIds, {
        type: "mini_room.ended",
        payload: ended
      })
      await publishRoomPresence(ended.lobbyRoomId)
    }
  }

  return {
    async handleClientEvent(connection, event) {
      switch (event.type) {
        case "room.join": {
          if (!(await canUsePresenceRoom(connection, event.payload.roomId))) {
            rejectPresenceRoomRequest(connection, event.type)
            return
          }
          const joined = await presenceService.joinRoom({
            roomId: event.payload.roomId,
            profile: connection.profile,
            initialSpotId: event.payload.initialSpotId
          })
          // The socket may have closed while room presence was being persisted.
          // Disconnect cleanup waits for this join, so do not attach or fan out
          // the completed join on behalf of a connection that is already gone.
          if (!connectionManager.getConnection(connection.connectionId)) return
          const joinedPeers = joined.snapshot.users
            .filter((user) => user.userId !== connection.userId)
            .map((user) => user.userId)
          let blockedPeers: Set<string>
          try {
            blockedPeers = new Set(
              await safetyService.listBlockedUserIdsBetween(connection.userId, joinedPeers)
            )
          } catch (error) {
            // Fail closed: never hand out an unfiltered join snapshot.
            await presenceService.leaveRoom(joined.roomId, connection.userId)
            throw error
          }
          connectionManager.joinRoom(connection.connectionId, joined.roomId)
          connectionManager.sendToConnection(connection.connectionId, {
            type: "room.joined",
            payload: {
              ...joined,
              snapshot: {
                ...joined.snapshot,
                users: joined.snapshot.users.filter((user) => !blockedPeers.has(user.userId))
              }
            }
          })
          await publishRoomPresence(joined.roomId)
          return
        }
        case "room.leave": {
          // Client frames are not schema-checked; never echo a room.left the
          // client contract rejects (roomId is required).
          if (typeof event.payload.roomId !== "string" || !event.payload.roomId.trim()) return
          await presenceService.leaveRoom(event.payload.roomId, connection.userId)
          connectionManager.leaveRoom(connection.connectionId, event.payload.roomId)
          connectionManager.sendToConnection(connection.connectionId, {
            type: "room.left",
            payload: { roomId: event.payload.roomId }
          })
          await publishRoomPresence(event.payload.roomId)
          return
        }
        case "presence.move_to_spot": {
          if (!(await canUsePresenceRoom(connection, event.payload.roomId))) {
            rejectPresenceRoomRequest(connection, event.type)
            return
          }
          await presenceService.moveToSpot(
            event.payload.roomId,
            connection.userId,
            event.payload.spotId
          )
          await publishRoomPresence(event.payload.roomId)
          return
        }
        case "mini_room.invite": {
          // Legacy lobby invites require presence-room access. Chat-initiated
          // room invites use the authenticated HTTP thread routes instead.
          if (!(await canUsePresenceRoom(connection, event.payload.roomId))) {
            rejectPresenceRoomRequest(connection, event.type)
            return
          }
          const invite = await miniRoomService.createInvite({
            roomId: event.payload.roomId,
            senderProfile: connection.profile,
            recipientUserId: event.payload.recipientUserId
          })
          if (!invite.roomId) {
            throw new Error("That room invite is not available.")
          }
          connectionManager.sendToUser(invite.recipientUserId, {
            type: "mini_room.invite_received",
            payload: invite
          })
          await notifyOfflineUser(invite.recipientUserId, {
            title: "Blumi",
            body: `${displayNameForPush(connection.profile.displayName)} wants to meet you`,
            data: {
              type: "mini_room.invite",
              inviteId: invite.inviteId,
              roomId: invite.roomId
            }
          })
          return
        }
        case "mini_room.invite_decision": {
          const legacyInvite = await miniRoomService.repository.findInvite(
            event.payload.inviteId
          )
          if (
            !legacyInvite ||
            legacyInvite.recipientUserId !== connection.userId ||
            !(await canUsePresenceRoom(connection, legacyInvite.roomId))
          ) {
            rejectPresenceRoomRequest(connection, event.type)
            return
          }
          const result = await miniRoomService.decideInvite({
            inviteId: event.payload.inviteId,
            actorProfile: connection.profile,
            status: event.payload.status
          })
          connectionManager.sendToUsers(
            [result.decision.senderUserId, result.decision.recipientUserId],
            {
              type: "mini_room.invite_decided",
              payload: result.decision
            }
          )
          if (result.miniRoom && result.mediaSessions && result.participants) {
            for (const userId of result.miniRoom.participantUserIds) {
              connectionManager.sendToUser(userId, {
                type: "mini_room.ready",
                payload: {
                  miniRoom: result.miniRoom,
                  mediaSession: result.mediaSessions[userId],
                  participants: result.participants.map((participant) => ({
                    ...participant,
                    avatar: { ...participant.avatar }
                  })) as typeof result.participants
                }
              })
            }
            const thread = await chatService.repository.findThread(
              `thread_${result.miniRoom.miniRoomId}`
            )
            if (thread) {
              connectionManager.sendToUsers(thread.participantUserIds, {
                type: "chat.thread_created",
                payload: thread
              })
            }
            await publishRoomPresence(result.miniRoom.lobbyRoomId)
          }
          return
        }
        case "mini_room.leave": {
          const ended = await miniRoomService.leaveMiniRoom(
            event.payload.miniRoomId,
            connection.userId
          )
          if (!ended) return
          connectionManager.sendToUsers(ended.participantUserIds, {
            type: "mini_room.ended",
            payload: ended
          })
          await publishRoomPresence(ended.lobbyRoomId)
          return
        }
        case "connection.decide": {
          const result = await connectionService.decide(
            connection.userId,
            event.payload
          )
          connectionManager.sendToUser(connection.userId, {
            type: "connection.decision_recorded",
            payload: result.decision
          })
          if (result.match) {
            connectionManager.sendToUsers(result.match.participantUserIds, {
              type: "connection.matched",
              payload: result.match
            })
            await Promise.all(
              result.match.participantUserIds.map((userId) =>
                notifyOfflineUser(userId, {
                  title: "Blumi",
                  body: "You have a new match! 🎉",
                  data: {
                    type: "connection.matched",
                    miniRoomId: result.match?.miniRoomId ?? ""
                  }
                })
              )
            )
          }
          return
        }
        case "reaction.send": {
          const activeMiniRoom = await miniRoomService.findMiniRoom(event.payload.roomId)
          if (activeMiniRoom) {
            if (!activeMiniRoom.participantUserIds.includes(connection.userId)) {
              throw new Error("That room is not available.")
            }
            // An ended room (for example one closed by a block) must not keep
            // relaying reactions between its former participants.
            const partnerUserId = activeMiniRoom.participantUserIds.find(
              (userId) => userId !== connection.userId
            )
            if (
              activeMiniRoom.endedAt ||
              (partnerUserId &&
                (await safetyService.hasBlockBetween(connection.userId, partnerUserId)))
            ) {
              throw new Error("That room is not available.")
            }
          } else {
            if (!(await canUsePresenceRoom(connection, event.payload.roomId))) {
              rejectPresenceRoomRequest(connection, event.type)
              return
            }
            const presence = await presenceService.findUserPresence(
              event.payload.roomId,
              connection.userId
            )
            if (!presence) throw new Error("Join the room first.")
          }
          const reaction = await reactionService.createReaction({
            roomId: event.payload.roomId,
            actorUserId: connection.userId,
            reaction: event.payload.reaction,
            targetUserId: event.payload.targetUserId
          })
          const reactionEvent: ServerEvent = {
            type: "reaction.received",
            payload: reaction
          }
          if (activeMiniRoom) {
            connectionManager.sendToUsers(
              activeMiniRoom.participantUserIds,
              reactionEvent
            )
          } else {
            // Presence-room reactions reach only present, policy-allowed users
            // with no block relationship to the actor (fails closed on lookup).
            const snapshot = await presenceService.createSnapshot(event.payload.roomId)
            const peers = snapshot.users
              .map((user) => user.userId)
              .filter((userId) => userId !== connection.userId)
            const blocked = new Set(
              await safetyService.listBlockedUserIdsBetween(connection.userId, peers)
            )
            const recipients: string[] = [connection.userId]
            for (const userId of peers) {
              if (blocked.has(userId)) continue
              if (!(await isPresenceRoomAllowed({ userId }, event.payload.roomId))) continue
              recipients.push(userId)
            }
            connectionManager.sendToUsers(recipients, reactionEvent)
          }
          return
        }
        // List requests are answered on the requesting socket only. Sending a
        // page to every socket of the user made each device request the next
        // page, doubling the page queries per page with two devices.
        case "chat.list_threads": {
          const page = await chatService.listThreadsPage(connection.userId, event.payload)
          connectionManager.sendToConnection(connection.connectionId, {
            type: "chat.thread_listed",
            payload: {
              userId: connection.userId,
              ...page,
              append: Boolean(event.payload.cursor)
            }
          })
          return
        }
        case "chat.list_messages": {
          connectionManager.sendToConnection(connection.connectionId, {
            type: "chat.message_listed",
            payload: {
              userId: connection.userId,
              threadId: event.payload.threadId,
              messages: await chatService.listMessages(
                connection.userId,
                event.payload.threadId
              )
            }
          })
          return
        }
        case "chat.send_message": {
          // Optional retry id (2026-09-30): the same idempotent send as the
          // HTTP route, acknowledged only to this socket with the id so the
          // client can settle its bubble. The fanout copy never carries it.
          const clientMessageId = readRealtimeClientMessageId(event.payload)
          const delivery = await chatMessageDeliveryService.sendMessage({
            senderUserId: connection.userId,
            senderDisplayName: connection.profile.displayName,
            threadId: event.payload.threadId,
            body: event.payload.body,
            ...(clientMessageId ? { clientMessageId } : {})
          })
          if (clientMessageId) {
            connectionManager.sendToConnection(connection.connectionId, {
              type: "chat.message_received",
              payload: { ...delivery.message, clientMessageId }
            })
          }
          return
        }
        case "safety.block": {
          const block = await safetyService.blockUser(
            connection.userId,
            event.payload.blockedUserId
          )
          connectionManager.sendToUser(connection.userId, {
            type: "safety.user_blocked",
            payload: { blockedUserId: block.blockedUserId }
          })
          await endActiveRoomBetween(connection.userId, block.blockedUserId)
          return
        }
        case "safety.report": {
          const result = await safetyService.reportUser(connection.userId, {
            reportedUserId: event.payload.reportedUserId,
            reason: event.payload.reason,
            note: event.payload.note
          })
          connectionManager.sendToUser(connection.userId, {
            type: "safety.user_blocked",
            payload: { blockedUserId: result.block.blockedUserId }
          })
          await endActiveRoomBetween(connection.userId, result.block.blockedUserId)
          return
        }
        default:
          return
      }
    },
    async handleDisconnect(connection) {
      const clearedRoomIds = await presenceService.disconnectConnection(
        connection.connectionId,
        connection.userId
      )
      await Promise.all(clearedRoomIds.map(publishRoomPresence))
    }
  }

  async function notifyOfflineUser(
    userId: string,
    notification: {
      title: string
      body: string
      data?: Record<string, string>
    }
  ): Promise<void> {
    if (connectionManager.hasUserConnections(userId)) return
    try {
      await notificationService.sendPushToUser(userId, notification)
    } catch {
      return
    }
  }
}

/**
 * The in-room retry id when it can be echoed safely (the contract bounds it to
 * 1–128 characters). Format validation stays with the chat service.
 */
export function readRealtimeClientMessageId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined
  const value = (payload as Record<string, unknown>).clientMessageId
  return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : undefined
}

function displayNameForPush(displayName: string | undefined): string {
  const normalized = displayName?.trim()
  return normalized || "Someone"
}
