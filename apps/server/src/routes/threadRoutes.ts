import type { FastifyInstance } from "fastify"
import { z } from "zod"
import {
  authenticatedErrorResponses,
  chatMessageEnvelopeSchema,
  chatMessageListSchema,
  chatThreadEnvelopeSchema,
  chatThreadListSchema,
  chatThreadReadSchema,
  coreApiJsonSchemas,
  createThreadRequestSchema,
  listChatMessagesQuerySchema,
  roomInviteDecisionRequestSchema,
  sendChatMessageRequestSchema,
  successResponseJsonSchema
} from "@blumi/contracts"
import type {
  AvatarSelection,
  ChatThread,
  CompleteAvatarSelection
} from "@blumi/contracts"
import { cloneCompleteAvatarSelection } from "../avatar/avatarSelectionPersistence"
import {
  projectAvatarSelectionForRead,
  resolveRequestCapabilities
} from "../avatar/avatarReadProjection"
import type { AuthService } from "../auth/authService"
import type { CapabilityService } from "../capabilities/capabilityService"
import type { ChatService, CreateThreadInput } from "../chat/chatService"
import {
  ChatDeliveryBlockedError,
  createChatMessageDeliveryService
} from "../chat/chatMessageDeliveryService"
import type { ConnectionService } from "../connections/connectionService"
import { isPublicRequestError } from "../errors/publicRequestError"
import type { MatchService } from "../matches/matchService"
import {
  ChatRoomInviteError,
  type MiniRoomService
} from "../miniRooms/miniRoomService"
import type { NotificationService } from "../notifications/notificationService"
import type { ConnectionManager } from "../realtime/connectionManager"
import type { SafetyService } from "../safety/safetyService"
import {
  readLimit,
  readParam,
  resolveProductSession
} from "./routeHelpers"
import {
  createAuthorizedThreadId,
  findThreadAuthorization
} from "./threadAuthorization"

export interface ThreadRouteServices {
  authService: AuthService
  chatService: ChatService
  matchService: MatchService
  connectionService?: ConnectionService
  safetyService: SafetyService
  notificationService: NotificationService
  connectionManager: ConnectionManager
  miniRoomService?: MiniRoomService
  capabilityService: CapabilityService
}

const threadIdRouteSchema = {
  params: coreApiJsonSchemas.pathId,
  response: {
    200: successResponseJsonSchema,
    201: successResponseJsonSchema,
    ...authenticatedErrorResponses
  }
}

const inviteIdRouteSchema = {
  params: {
    type: "object",
    required: ["inviteId"],
    properties: { inviteId: { type: "string", minLength: 1 } },
    additionalProperties: false
  },
  response: {
    200: successResponseJsonSchema,
    201: successResponseJsonSchema,
    ...authenticatedErrorResponses
  }
}

const roomSessionRouteSchema = {
  params: {
    type: "object",
    required: ["roomSessionId"],
    properties: { roomSessionId: { type: "string", minLength: 1 } },
    additionalProperties: false
  },
  response: {
    200: successResponseJsonSchema,
    ...authenticatedErrorResponses
  }
}

export async function registerThreadRoutes(
  app: FastifyInstance,
  services: ThreadRouteServices
): Promise<void> {
  const { authService, chatService, matchService, capabilityService } = services
  const deliveryService = createChatMessageDeliveryService({
    chatService,
    safetyService: services.safetyService,
    connectionManager: services.connectionManager,
    notificationService: services.notificationService
  })

  app.get<{ Querystring: { cursor?: string; limit?: number } }>("/v1/threads", {
    schema: {
      querystring: { type: "object", additionalProperties: false, properties: {
        cursor: { type: "string", minLength: 1, maxLength: 1024 }, limit: { type: "integer", minimum: 1, maximum: 100 }
      } },
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    let page
    try { page = await chatService.listThreadsPage(resolved.account.userId, request.query) }
    catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(400).send({ error: error.message })
    }
    const allowV2 = resolveRequestCapabilities(
      request,
      resolved.account.userId,
      capabilityService
    ).capabilities.avatar_loadout_v2_read
    return parseChatResponse(chatThreadListSchema, {
      userId: resolved.account.userId,
      nextCursor: page.nextCursor,
      threads: page.threads.map((thread) =>
        projectChatThreadForAvatarRead(thread, allowV2)
      )
    })
  })

  app.post("/v1/threads", {
    attachValidation: true,
    schema: {
      body: coreApiJsonSchemas.createThread,
      response: {
        200: successResponseJsonSchema,
        201: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const parsed = createThreadRequestSchema.safeParse(request.body)
    const participantUserIds = parsed.success
      ? parsed.data.participantUserIds
      : []
    if (
      participantUserIds.length !== 2 ||
      !participantUserIds.includes(resolved.account.userId)
    ) {
      return reply.code(400).send({ error: "Choose two conversation participants." })
    }

    const uniqueParticipantUserIds = [...new Set(participantUserIds)]
    if (uniqueParticipantUserIds.length !== 2) {
      return reply.code(400).send({ error: "Choose two conversation participants." })
    }

    const canonicalParticipantUserIds = [...uniqueParticipantUserIds].sort() as [
      string,
      string
    ]
    if (
      await services.safetyService.hasBlockBetween(
        canonicalParticipantUserIds[0],
        canonicalParticipantUserIds[1]
      )
    ) {
      return reply.code(403).send({ error: "That conversation is not available." })
    }
    const authorization = await findThreadAuthorization({
      participantUserIds: canonicalParticipantUserIds,
      matchRepository: matchService.repository,
      connectionRepository: services.connectionService?.repository
    })
    if (!authorization) {
      return reply.code(403).send({ error: "Chat opens only after you both match." })
    }

    const participants = await Promise.all(
      canonicalParticipantUserIds.map(async (userId) => {
        const account = await authService.repository.findAccountByUserId(userId)
        return {
          userId,
          displayName: account?.profile.displayName || undefined,
          avatar: account
            ? completeAvatarForChat(account.profile.avatar)
            : undefined
        }
      })
    )
    if (participants.some((participant) => !participant.displayName)) {
      return reply.code(400).send({ error: "That conversation is not available." })
    }

    const input: CreateThreadInput = {
      threadId: createAuthorizedThreadId(authorization),
      miniRoomId: authorization.miniRoomId,
      participantUserIds: canonicalParticipantUserIds,
      participants: [
        { ...participants[0] },
        { ...participants[1] }
      ]
    }

    const existing = await chatService.repository.findThread(input.threadId as string)
    const thread = await chatService.createThread(input)
    const allowV2 = resolveRequestCapabilities(
      request,
      resolved.account.userId,
      capabilityService
    ).capabilities.avatar_loadout_v2_read
    return reply
      .code(existing ? 200 : 201)
      .send(parseChatResponse(chatThreadEnvelopeSchema, {
        thread: projectChatThreadForAvatarRead(thread, allowV2)
      }))
  })

  app.get("/v1/threads/:threadId/room-invites", {
    attachValidation: true,
    schema: threadIdRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const threadId = readParam(request, "threadId")
    const miniRoomService = services.miniRoomService
    if (!threadId) {
      return reply.code(400).send({ error: "Choose a conversation first." })
    }
    if (!miniRoomService) {
      return reply.code(503).send({ error: "Room invites are temporarily unavailable." })
    }
    const context = await resolveMutualChatInviteContext({
      services,
      threadId,
      userId: resolved.account.userId
    })
    if (!context) {
      return reply.code(403).send({ error: "That room invite is not available." })
    }
    try {
      return {
        threadId,
        invites: await miniRoomService.listChatInvites(
          resolved.account.userId,
          threadId
        )
      }
    } catch (error) {
      return sendChatRoomInviteError(error, reply)
    }
  })

  app.post("/v1/threads/:threadId/room-invites", {
    attachValidation: true,
    schema: threadIdRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const threadId = readParam(request, "threadId")
    const miniRoomService = services.miniRoomService
    if (!threadId) {
      return reply.code(400).send({ error: "Choose a conversation first." })
    }
    if (!miniRoomService) {
      return reply.code(503).send({ error: "Room invites are temporarily unavailable." })
    }
    const context = await resolveMutualChatInviteContext({
      services,
      threadId,
      userId: resolved.account.userId
    })
    if (!context || !context.partnerAccount) {
      return reply.code(403).send({ error: "That room invite is not available." })
    }
    try {
      const result = await miniRoomService.createChatInvite({
        threadId,
        senderProfile: resolved.account.profile,
        recipientProfile: context.partnerAccount.profile
      })
      if (result.created) {
        services.connectionManager.sendToUsers(
          [result.invite.senderUserId, result.invite.recipientUserId],
          { type: "chat.room_invite_updated", payload: result.invite }
        )
      }
      if (
        result.created &&
        !services.connectionManager.hasUserConnections(result.invite.recipientUserId)
      ) {
        try {
          await services.notificationService.sendPushToUser(
            result.invite.recipientUserId,
            {
              title: "Blumi",
              body: "You have a new room invitation.",
              data: {
                type: "chat.room_invite",
                threadId,
                inviteId: result.invite.inviteId
              }
            }
          )
        } catch {
          // A push provider failure must not discard the authoritative invite.
        }
      }
      return reply.code(result.created ? 201 : 200).send(result)
    } catch (error) {
      return sendChatRoomInviteError(error, reply)
    }
  })

  app.post("/v1/room-sessions/:roomSessionId/join", {
    attachValidation: true,
    schema: roomSessionRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const roomSessionId = readParam(request, "roomSessionId")
    const miniRoomService = services.miniRoomService
    if (!roomSessionId) {
      return reply.code(400).send({ error: "Choose a room first." })
    }
    if (!miniRoomService) {
      return reply.code(503).send({ error: "Rooms are temporarily unavailable." })
    }
    const miniRoom = await miniRoomService.findMiniRoom(roomSessionId)
    if (!miniRoom?.sourceThreadId || !miniRoom.participantUserIds.includes(resolved.account.userId)) {
      return reply.code(404).send({ error: "That room is not available." })
    }
    const context = await resolveMutualChatInviteContext({
      services,
      threadId: miniRoom.sourceThreadId,
      userId: resolved.account.userId
    })
    if (!context) {
      return reply.code(403).send({ error: "That room is not available." })
    }
    const senderAccount = await authService.repository.findAccountByUserId(
      miniRoom.participantUserIds[0]
    )
    const recipientAccount = await authService.repository.findAccountByUserId(
      miniRoom.participantUserIds[1]
    )
    if (
      !senderAccount ||
      !recipientAccount ||
      !(await authService.isRealtimeUserAllowed(senderAccount.userId)) ||
      !(await authService.isRealtimeUserAllowed(recipientAccount.userId))
    ) {
      return reply.code(403).send({ error: "That room is not available." })
    }
    try {
      return await miniRoomService.joinChatRoom({
        miniRoomId: roomSessionId,
        actorUserId: resolved.account.userId,
        senderProfile: senderAccount.profile,
        recipientProfile: recipientAccount.profile
      })
    } catch (error) {
      return sendChatRoomInviteError(error, reply)
    }
  })

  app.post("/v1/room-invites/:inviteId/decision", {
    attachValidation: true,
    schema: {
      ...inviteIdRouteSchema,
      body: coreApiJsonSchemas.roomInviteDecision
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const inviteId = readParam(request, "inviteId")
    const miniRoomService = services.miniRoomService
    const parsed = roomInviteDecisionRequestSchema.safeParse(request.body)
    if (!inviteId || !parsed.success) {
      return reply.code(400).send({ error: "Choose a valid room invite decision." })
    }
    if (!miniRoomService) {
      return reply.code(503).send({ error: "Room invites are temporarily unavailable." })
    }
    const invite = await miniRoomService.repository.findInvite(inviteId)
    if (!invite?.sourceThreadId) {
      return reply.code(404).send({ error: "That room invite is not available." })
    }
    const context = await resolveMutualChatInviteContext({
      services,
      threadId: invite.sourceThreadId,
      userId: resolved.account.userId
    })
    if (!context) {
      return reply.code(403).send({ error: "That room invite is not available." })
    }
    const senderAccount = await authService.repository.findAccountByUserId(
      invite.senderUserId
    )
    const recipientAccount = await authService.repository.findAccountByUserId(
      invite.recipientUserId
    )
    if (
      !senderAccount ||
      !recipientAccount ||
      !(await authService.isRealtimeUserAllowed(invite.senderUserId)) ||
      !(await authService.isRealtimeUserAllowed(invite.recipientUserId))
    ) {
      return reply.code(403).send({ error: "That room invite is not available." })
    }
    try {
      const result = await miniRoomService.decideChatInvite({
        inviteId,
        actorUserId: resolved.account.userId,
        senderProfile: senderAccount.profile,
        recipientProfile: recipientAccount.profile,
        status: parsed.data.status
      })
      services.connectionManager.sendToUsers(
        [result.invite.senderUserId, result.invite.recipientUserId],
        { type: "chat.room_invite_updated", payload: result.invite }
      )
      if (result.miniRoom && result.mediaSessions && result.participants) {
        for (const userId of result.miniRoom.participantUserIds) {
          services.connectionManager.sendToUser(userId, {
            type: "mini_room.ready",
            payload: {
              miniRoom: result.miniRoom,
              mediaSession: result.mediaSessions[userId]!,
              participants: result.participants
            }
          })
        }
      }
      return {
        invite: result.invite,
        decision: result.decision,
        ...(result.miniRoom ? { miniRoom: result.miniRoom } : {}),
        ...(result.participants ? { participants: result.participants } : {}),
        ...(result.mediaSessions?.[resolved.account.userId]
          ? { mediaSession: result.mediaSessions[resolved.account.userId] }
          : {})
      }
    } catch (error) {
      return sendChatRoomInviteError(error, reply)
    }
  })

  app.post("/v1/room-invites/:inviteId/cancel", {
    attachValidation: true,
    schema: inviteIdRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const inviteId = readParam(request, "inviteId")
    const miniRoomService = services.miniRoomService
    if (!inviteId) {
      return reply.code(400).send({ error: "Choose a room invite first." })
    }
    if (!miniRoomService) {
      return reply.code(503).send({ error: "Room invites are temporarily unavailable." })
    }
    try {
      const invite = await miniRoomService.cancelChatInvite({
        inviteId,
        actorUserId: resolved.account.userId
      })
      services.connectionManager.sendToUsers(
        [invite.senderUserId, invite.recipientUserId],
        { type: "chat.room_invite_updated", payload: invite }
      )
      return { invite }
    } catch (error) {
      return sendChatRoomInviteError(error, reply)
    }
  })

  app.get("/v1/threads/:threadId/messages", {
    attachValidation: true,
    schema: {
      ...threadIdRouteSchema,
      querystring: coreApiJsonSchemas.listChatMessagesQuery
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const threadId = readParam(request, "threadId")
    if (!threadId) {
      return reply.code(400).send({ error: "Choose a conversation first." })
    }

    try {
      const parsedQuery = listChatMessagesQuerySchema.safeParse(request.query)
      const query = parsedQuery.success ? parsedQuery.data : {}
      const messages = await chatService.listMessages(
        resolved.account.userId,
        threadId,
        {
          beforeMessageId:
            typeof query.before === "string" ? query.before : undefined,
          limit: readLimit(query.limit)
        }
      )
      return parseChatResponse(chatMessageListSchema, {
        userId: resolved.account.userId,
        threadId,
        messages
      })
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(404).send({
        error: error.message
      })
    }
  })

  app.post("/v1/threads/:threadId/messages", {
    attachValidation: true,
    schema: {
      ...threadIdRouteSchema,
      body: coreApiJsonSchemas.sendChatMessage
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const threadId = readParam(request, "threadId")
    if (!threadId) {
      return reply.code(400).send({ error: "Choose a conversation first." })
    }

    const parsed = sendChatMessageRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: "Write a message first." })
    }

    try {
      const delivery = await deliveryService.sendMessage({
        senderUserId: resolved.account.userId,
        senderDisplayName: resolved.account.profile.displayName,
        threadId,
        body: parsed.data.body,
        ...(parsed.data.clientMessageId
          ? { clientMessageId: parsed.data.clientMessageId }
          : {})
      })
      return reply
        .code(delivery.created ? 201 : 200)
        .send(parseChatResponse(chatMessageEnvelopeSchema, {
          message: delivery.message
        }))
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      const message = error.message
      const statusCode = error instanceof ChatDeliveryBlockedError
        ? 403
        : /conversation/.test(message)
          ? 404
          : 400
      return reply.code(statusCode).send({ error: message })
    }
  })

  app.post("/v1/threads/:threadId/read", {
    attachValidation: true,
    schema: threadIdRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const threadId = readParam(request, "threadId")
    if (!threadId) {
      return reply.code(400).send({ error: "Choose a conversation first." })
    }

    try {
      const result = await chatService.markThreadRead(
        resolved.account.userId,
        threadId
      )
      services.connectionManager.sendToUser(resolved.account.userId, {
        type: "chat.thread_read", payload: { userId: resolved.account.userId, threadId, readAt: result.readAt }
      })
      return parseChatResponse(chatThreadReadSchema, {
        userId: resolved.account.userId,
        threadId,
        readAt: result.readAt
      })
    } catch (error) {
      if (!isPublicRequestError(error)) throw error
      return reply.code(404).send({
        error: error.message
      })
    }
  })
}

function completeAvatarForChat(
  avatar: AvatarSelection
): CompleteAvatarSelection | undefined {
  if (!avatar.loadout || typeof avatar.revision !== "number") return undefined
  try {
    return cloneCompleteAvatarSelection({
      presetId: avatar.presetId,
      revision: avatar.revision,
      loadout: avatar.loadout
    })
  } catch {
    return undefined
  }
}

export function projectChatThreadForAvatarRead(
  thread: ChatThread,
  allowV2: boolean
): ChatThread {
  return {
    ...thread,
    participantUserIds: [...thread.participantUserIds] as [string, string],
    participants: thread.participants.map((participant) => ({
      ...participant,
      ...(participant.avatar
        ? { avatar: projectAvatarSelectionForRead(participant.avatar, allowV2) }
        : {})
    })) as ChatThread["participants"],
    ...(thread.lastMessage ? { lastMessage: { ...thread.lastMessage } } : {})
  }
}

function parseChatResponse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new Error("Internal chat response contract violation.")
  }
  return parsed.data
}

async function resolveMutualChatInviteContext(input: {
  services: ThreadRouteServices
  threadId: string
  userId: string
}) {
  const thread = await input.services.chatService.repository.findThread(input.threadId)
  if (!thread || !thread.participantUserIds.includes(input.userId)) return null
  const partnerUserId = thread.participantUserIds.find(
    (userId) => userId !== input.userId
  )
  if (!partnerUserId) return null
  const match = await input.services.matchService.repository.findMatchBetween(
    input.userId,
    partnerUserId
  )
  if (!match) return null
  const expectedThreadId = createAuthorizedThreadId({
    source: "match",
    sourceId: match.matchId,
    miniRoomId: `match_${match.matchId}`
  })
  if (thread.threadId !== expectedThreadId) return null
  const partnerAccount = await input.services.authService.repository.findAccountByUserId(
    partnerUserId
  )
  if (!partnerAccount || !(await input.services.authService.isRealtimeUserAllowed(partnerUserId))) {
    return null
  }
  return { thread, partnerAccount }
}

function sendChatRoomInviteError(error: unknown, reply: import("fastify").FastifyReply) {
  if (!(error instanceof ChatRoomInviteError)) throw error
  const statusCode = error.code === "INVITE_FORBIDDEN" || error.code === "PAIR_BLOCKED"
    ? 403
    : error.code === "INVITE_EXPIRED"
      ? 410
      : 409
  return reply.code(statusCode).send({ code: error.code, error: error.message })
}
