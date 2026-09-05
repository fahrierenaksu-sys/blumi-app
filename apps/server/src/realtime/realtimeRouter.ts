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
  const chatMessageDeliveryService = createChatMessageDeliveryService({
    chatService,
    safetyService,
    connectionManager,
    notificationService
  })

  async function publishRoomPresence(roomId: string): Promise<void> {
    const snapshot = await presenceService.createSnapshot(roomId)
    connectionManager.broadcastRoom(roomId, {
      type: "presence.snapshot",
      payload: snapshot
    })

    await Promise.all(
      snapshot.users.map(async (user) => {
        const blockedUserIds = (
          await Promise.all(
            snapshot.users
              .filter((candidate) => candidate.userId !== user.userId)
              .map(async (candidate) =>
                (await safetyService.hasBlockBetween(user.userId, candidate.userId))
                  ? candidate.userId
                  : null
              )
          )
        ).filter((userId): userId is string => typeof userId === "string")
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
            nearbyUsers
          }
        })
      })
    )
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
          const joined = await presenceService.joinRoom({
            roomId: event.payload.roomId,
            profile: connection.profile,
            initialSpotId: event.payload.initialSpotId
          })
          connectionManager.joinRoom(connection.connectionId, joined.roomId)
          connectionManager.sendToConnection(connection.connectionId, {
            type: "room.joined",
            payload: joined
          })
          await publishRoomPresence(joined.roomId)
          return
        }
        case "room.leave": {
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
          await presenceService.moveToSpot(
            event.payload.roomId,
            connection.userId,
            event.payload.spotId
          )
          await publishRoomPresence(event.payload.roomId)
          return
        }
        case "mini_room.invite": {
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
          } else {
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
            connectionManager.broadcastRoom(event.payload.roomId, reactionEvent)
          }
          return
        }
        case "chat.list_threads": {
          const page = await chatService.listThreadsPage(connection.userId, event.payload)
          connectionManager.sendToUser(connection.userId, {
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
          connectionManager.sendToUser(connection.userId, {
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
          await chatMessageDeliveryService.sendMessage({
            senderUserId: connection.userId,
            senderDisplayName: connection.profile.displayName,
            threadId: event.payload.threadId,
            body: event.payload.body
          })
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
      if (connectionManager.hasUserConnections(connection.userId)) {
        return
      }
      const joinedRoomIds = [...connection.joinedRoomIds]
      await presenceService.leaveAllRooms(connection.userId)
      await Promise.all(joinedRoomIds.map(publishRoomPresence))
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

function displayNameForPush(displayName: string | undefined): string {
  const normalized = displayName?.trim()
  return normalized || "Someone"
}
