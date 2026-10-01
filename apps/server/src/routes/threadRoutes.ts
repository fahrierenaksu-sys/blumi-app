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
  CompleteAvatarSelection,
  UserProfile
} from "@blumi/contracts"
import { cloneCompleteAvatarSelection } from "../avatar/avatarSelectionPersistence"
import {
  projectAvatarSelectionForRead,
  resolveRequestCapabilities
} from "../avatar/avatarReadProjection"
import type { AuthService } from "../auth/authService"
import type { CapabilityService } from "../capabilities/capabilityService"
import {
  ChatMessageIdempotencyConflictError,
  type ChatService,
  type CreateThreadInput
} from "../chat/chatService"
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
  resolveProductSession,
  schemaValidationFailed
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

  app.post("/v1/threads/sync-matches", {
    schema: { response: { 200: successResponseJsonSchema, ...authenticatedErrorResponses } }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const userId = resolved.account.userId
    const [discoveryMatches, connectionMatches] = await Promise.all([
      matchService.repository.listMatchesForUser(userId),
      services.connectionService?.repository.listMatchesForUser(userId) ?? Promise.resolve([])
    ])
    const sources = [
      ...discoveryMatches.map((match) => ({
        source: "match" as const,
        sourceId: match.matchId,
        miniRoomId: `match_${match.matchId}`,
        participantUserIds: match.participantUserIds
      })),
      ...connectionMatches.map((match) => ({
        source: "connection" as const,
        sourceId: match.miniRoomId,
        miniRoomId: match.miniRoomId,
        participantUserIds: match.participantUserIds
      }))
    ]
    const existingThreadIds = await chatService.repository.findExistingThreadIds(
      sources.map(createAuthorizedThreadId)
    )
    const sourcesByPartner = new Map<string, typeof sources>()
    for (const source of sources) {
      const partnerUserId = source.participantUserIds.find((id) => id !== userId)
      if (!partnerUserId) continue
      const group = sourcesByPartner.get(partnerUserId) ?? []
      group.push(source)
      sourcesByPartner.set(partnerUserId, group)
    }
    // Batched: one block query and one account query cover every partner
    // still missing a thread, instead of per-partner lookups (N+1).
    const missingPartners = [...sourcesByPartner].filter(([, group]) =>
      !group.some((source) => existingThreadIds.has(createAuthorizedThreadId(source))))
    const blockedBeforeCreate = new Set(missingPartners.length === 0
      ? []
      : await services.safetyService.listBlockedUserIdsBetween(
        userId,
        missingPartners.map(([partnerUserId]) => partnerUserId)
      ))
    const creatable = missingPartners.filter(([partnerUserId]) => !blockedBeforeCreate.has(partnerUserId))
    const accountsByUserId = new Map((creatable.length === 0
      ? []
      : await authService.repository.findAccountsByUserIds([
        ...new Set(creatable.flatMap(([, group]) => group[0]!.participantUserIds))
      ])).map((account) => [account.userId, account]))
    const created: Array<{ partnerUserId: string; thread: ChatThread }> = []
    try {
      for (const [partnerUserId, group] of creatable) {
        const source = group[0]!
        const threadId = createAuthorizedThreadId(source)
        const participantUserIds = [...source.participantUserIds].sort() as [string, string]
        const accounts = participantUserIds.map((id) => accountsByUserId.get(id))
        if (accounts.some((account) => !account?.profile.displayName)) continue
        const thread = await chatService.createThread({
          threadId,
          miniRoomId: source.miniRoomId,
          participantUserIds,
          participants: participantUserIds.map((id, index) => ({
            userId: id,
            displayName: accounts[index]!.profile.displayName,
            avatar: completeAvatarForChat(accounts[index]!.profile.avatar)
          })) as CreateThreadInput["participants"]
        })
        existingThreadIds.add(threadId)
        created.push({ partnerUserId, thread })
      }
    } finally {
      // Re-check blocks after creation (a block may land meanwhile) with one
      // batched query, then announce only the still-unblocked threads.
      if (created.length > 0) {
        const blockedAfterCreate = new Set(await services.safetyService.listBlockedUserIdsBetween(
          userId,
          created.map(({ partnerUserId }) => partnerUserId)
        ))
        for (const { partnerUserId, thread } of created) {
          if (blockedAfterCreate.has(partnerUserId)) continue
          services.connectionManager.sendToUsers(thread.participantUserIds, {
            type: "chat.thread_created",
            payload: thread
          })
        }
      }
    }
    const page = await chatService.listThreadsPage(userId)
    const allowV2 = resolveRequestCapabilities(
      request, userId, capabilityService
    ).capabilities.avatar_loadout_v2_read
    return parseChatResponse(chatThreadListSchema, {
      userId,
      nextCursor: page.nextCursor,
      threads: page.threads.map((thread) => projectChatThreadForAvatarRead(thread, allowV2))
    })
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
    config: { requestValidation: "enforced" },
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
      !participantUserIds.includes(resolved.account.userId) ||
      schemaValidationFailed(request)
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

    let existing = await chatService.repository.findThread(input.threadId as string)
    if (!existing && authorization.source === "match" && services.connectionService) {
      const connectionMatches = await services.connectionService.repository.listMatchesForUser(resolved.account.userId)
      for (const connection of connectionMatches) {
        if (!connection.participantUserIds.includes(canonicalParticipantUserIds[0]) ||
            !connection.participantUserIds.includes(canonicalParticipantUserIds[1])) continue
        existing = await chatService.repository.findThread(`thread_connection_${connection.miniRoomId}`)
        if (existing) break
      }
    }
    const thread = existing ?? await chatService.createThread(input)
    if (!existing && !await services.safetyService.hasBlockBetween(
      canonicalParticipantUserIds[0], canonicalParticipantUserIds[1]
    )) {
      services.connectionManager.sendToUsers(thread.participantUserIds, {
        type: "chat.thread_created",
        payload: thread
      })
    }
    const partnerUserId = canonicalParticipantUserIds.find(
      (userId) => userId !== resolved.account.userId
    )
    const persona = partnerUserId
      ? await chatService.repository.findTestPersona(partnerUserId)
      : null
    if (persona) {
      await deliveryService.sendMessage({
        senderUserId: persona.userId,
        threadId: thread.threadId,
        body: persona.greeting,
        clientMessageId: `test-persona-greeting-${thread.threadId}`
      })
    }
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
    config: { requestValidation: "enforced" },
    schema: threadIdRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const threadId = readParam(request, "threadId")
    const miniRoomService = services.miniRoomService
    if (!threadId || schemaValidationFailed(request)) {
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
    if (!context || context === "hidden") {
      return sendUnavailableInviteContext(context, reply, "That room invite is not available.")
    }
    try {
      let invites = await miniRoomService.listChatInvites(
        resolved.account.userId,
        threadId
      )
      // A synthetic test partner can initiate a real, persisted chat invitation
      // when the user opens the conversation. Reopening it is idempotent, and
      // normal accounts never enter this branch.
      if (!invites.some((invite) => invite.status === "pending" || invite.status === "accepted")) {
        const persona = await chatService.repository.findTestPersona(context.partnerAccount.userId)
        if (persona) {
          try {
            const result = await miniRoomService.createChatInvite({
              threadId,
              senderProfile: context.partnerAccount.profile,
              recipientProfile: resolved.account.profile
            })
            if (result.created) {
              services.connectionManager.sendToUsers(
                [persona.userId, resolved.account.userId],
                { type: "chat.room_invite_updated", payload: result.invite }
              )
            }
            invites = await miniRoomService.listChatInvites(resolved.account.userId, threadId)
          } catch (error) {
            if (
              !(error instanceof ChatRoomInviteError) ||
              (error.code !== "PARTICIPANT_BUSY" && error.code !== "SELF_IN_ROOM")
            ) {
              throw error
            }
          }
        }
      }
      return { threadId, invites }
    } catch (error) {
      return sendChatRoomInviteError(error, reply)
    }
  })

  app.post("/v1/threads/:threadId/room-invites", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: threadIdRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const threadId = readParam(request, "threadId")
    const miniRoomService = services.miniRoomService
    if (!threadId || schemaValidationFailed(request)) {
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
    if (!context || context === "hidden") {
      return sendUnavailableInviteContext(context, reply, "That room invite is not available.")
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
    config: { requestValidation: "enforced" },
    schema: roomSessionRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const roomSessionId = readParam(request, "roomSessionId")
    const miniRoomService = services.miniRoomService
    if (!roomSessionId || schemaValidationFailed(request)) {
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
    if (!context || context === "hidden") {
      return sendUnavailableInviteContext(context, reply, "That room is not available.")
    }
    const roomProfiles = resolvePairProfiles(miniRoom.participantUserIds, resolved.account, context.partnerAccount)
    if (!roomProfiles) {
      return reply.code(403).send({ error: "That room is not available." })
    }
    try {
      return await miniRoomService.joinChatRoom({
        miniRoomId: roomSessionId,
        actorUserId: resolved.account.userId,
        senderProfile: roomProfiles[0],
        recipientProfile: roomProfiles[1]
      })
    } catch (error) {
      return sendChatRoomInviteError(error, reply)
    }
  })

  app.post("/v1/room-sessions/:roomSessionId/leave", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: roomSessionRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const roomSessionId = readParam(request, "roomSessionId")
    const miniRoomService = services.miniRoomService
    if (!roomSessionId || schemaValidationFailed(request)) {
      return reply.code(400).send({ error: "Choose a room first." })
    }
    if (!miniRoomService) {
      return reply.code(503).send({ error: "Rooms are temporarily unavailable." })
    }
    const room = await miniRoomService.findMiniRoom(roomSessionId)
    if (!room || !room.participantUserIds.includes(resolved.account.userId)) {
      return reply.code(404).send({ error: "That room is not available." })
    }
    const ended = await miniRoomService.leaveMiniRoom(roomSessionId, resolved.account.userId)
    if (ended) {
      services.connectionManager.sendToUsers(ended.participantUserIds, {
        type: "mini_room.ended",
        payload: ended
      })
    }
    return { ended: Boolean(ended) }
  })

  app.post("/v1/users/me/active-room/leave", {
    schema: {
      body: {
        type: "object",
        required: ["expectedRoomSessionId"],
        properties: { expectedRoomSessionId: { type: "string", minLength: 1 } },
        additionalProperties: false
      },
      response: {
        200: successResponseJsonSchema,
        ...authenticatedErrorResponses
      }
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const miniRoomService = services.miniRoomService
    if (!miniRoomService) {
      return reply.code(503).send({ error: "Rooms are temporarily unavailable." })
    }
    const expectedRoomSessionId = (request.body as { expectedRoomSessionId: string }).expectedRoomSessionId
    const activeRoom = await miniRoomService.findActiveMiniRoomForUser(resolved.account.userId)
    if (!activeRoom) return { ended: false }
    if (activeRoom.miniRoomId !== expectedRoomSessionId) {
      return reply.code(409).send({ error: "Your active room changed. Nothing was closed." })
    }
    const ended = await miniRoomService.leaveMiniRoom(
      activeRoom.miniRoomId,
      resolved.account.userId
    )
    if (ended) {
      services.connectionManager.sendToUsers(ended.participantUserIds, {
        type: "mini_room.ended",
        payload: ended
      })
    }
    return { ended: Boolean(ended) }
  })

  app.post("/v1/room-invites/:inviteId/decision", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
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
    if (!inviteId || !parsed.success || schemaValidationFailed(request)) {
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
    if (!context || context === "hidden") {
      return sendUnavailableInviteContext(context, reply, "That room invite is not available.")
    }
    const inviteProfiles = resolvePairProfiles(
      [invite.senderUserId, invite.recipientUserId],
      resolved.account,
      context.partnerAccount
    )
    if (!inviteProfiles) {
      return reply.code(403).send({ error: "That room invite is not available." })
    }
    try {
      const result = await miniRoomService.decideChatInvite({
        inviteId,
        actorUserId: resolved.account.userId,
        senderProfile: inviteProfiles[0],
        recipientProfile: inviteProfiles[1],
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
    config: { requestValidation: "enforced" },
    schema: inviteIdRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return
    const inviteId = readParam(request, "inviteId")
    const miniRoomService = services.miniRoomService
    if (!inviteId || schemaValidationFailed(request)) {
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
    config: { requestValidation: "enforced" },
    schema: {
      ...threadIdRouteSchema,
      querystring: coreApiJsonSchemas.listChatMessagesQuery
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const threadId = readParam(request, "threadId")
    if (!threadId || schemaValidationFailed(request, "params")) {
      return reply.code(400).send({ error: "Choose a conversation first." })
    }
    if (schemaValidationFailed(request, "querystring")) {
      return reply.code(400).send({ error: "Choose valid message page options." })
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
    config: { requestValidation: "enforced" },
    schema: {
      ...threadIdRouteSchema,
      body: coreApiJsonSchemas.sendChatMessage
    }
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const threadId = readParam(request, "threadId")
    if (!threadId || schemaValidationFailed(request, "params")) {
      return reply.code(400).send({ error: "Choose a conversation first." })
    }

    const parsed = sendChatMessageRequestSchema.safeParse(request.body)
    if (!parsed.success || schemaValidationFailed(request, "body")) {
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
      if (error instanceof ChatMessageIdempotencyConflictError) {
        return reply.code(409).send({ code: error.code, error: error.message })
      }
      // A block hides the thread from both users: answered like a thread the
      // sender is not in (the delivery error carries the same message).
      const message = error.message
      const statusCode = error instanceof ChatDeliveryBlockedError || /conversation/.test(message)
        ? 404
        : 400
      return reply.code(statusCode).send({ error: message })
    }
  })

  app.post("/v1/threads/:threadId/read", {
    attachValidation: true,
    config: { requestValidation: "enforced" },
    schema: threadIdRouteSchema
  }, async (request, reply) => {
    const resolved = await resolveProductSession({ request, reply, authService })
    if (!resolved) return

    const threadId = readParam(request, "threadId")
    if (!threadId || schemaValidationFailed(request)) {
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

type MutualChatInviteContext =
  | { thread: ChatThread; partnerAccount: NonNullable<Awaited<ReturnType<AuthService["repository"]["findAccountByUserId"]>>> }
  // The thread is missing, not the caller's, or hidden by a block in either
  // direction: answered 404 like any conversation the caller cannot see.
  | "hidden"
  // A visible thread that no longer authorizes invites (source or partner): 403.
  | null

async function resolveMutualChatInviteContext(input: {
  services: ThreadRouteServices
  threadId: string
  userId: string
}): Promise<MutualChatInviteContext> {
  const thread = await input.services.chatService.repository.findThread(input.threadId)
  if (!thread || !thread.participantUserIds.includes(input.userId)) return "hidden"
  const partnerUserId = thread.participantUserIds.find(
    (userId) => userId !== input.userId
  )
  if (!partnerUserId) return null
  if (await input.services.safetyService.hasBlockBetween(input.userId, partnerUserId)) return "hidden"
  const [match, connection] = await Promise.all([
    input.services.matchService.repository.findMatchBetween(input.userId, partnerUserId),
    input.services.connectionService?.repository.findMatchBetween(input.userId, partnerUserId)
      ?? Promise.resolve(null)
  ])
  const authorizedSources = [
    ...(match ? [{ source: "match" as const, sourceId: match.matchId,
      miniRoomId: `match_${match.matchId}` }] : []),
    ...(connection ? [{ source: "connection" as const, sourceId: connection.miniRoomId,
      miniRoomId: connection.miniRoomId }] : [])
  ]
  if (!authorizedSources.some((source) =>
    thread.threadId === createAuthorizedThreadId(source) &&
    thread.miniRoomId === source.miniRoomId
  )) return null
  // One round trip: the partner's profile and moderation state together.
  const [partnerAccount, partnerAllowed] = await Promise.all([
    input.services.authService.repository.findAccountByUserId(partnerUserId),
    input.services.authService.isRealtimeUserAllowed(partnerUserId)
  ])
  if (!partnerAccount || !partnerAllowed) {
    return null
  }
  return { thread, partnerAccount }
}

/**
 * The [sender, recipient] profiles of an invite or room from the caller's
 * session account and the partner the invite context already read and
 * checked; the caller's moderation was checked with the session. Null when
 * the pair is not exactly the caller and that partner (answered 403).
 */
function resolvePairProfiles(
  pairUserIds: readonly [string, string],
  callerAccount: { userId: string; profile: UserProfile },
  partnerAccount: { userId: string; profile: UserProfile }
): [UserProfile, UserProfile] | null {
  if (pairUserIds[0] === pairUserIds[1]) return null
  const profiles = new Map([
    [callerAccount.userId, callerAccount.profile],
    [partnerAccount.userId, partnerAccount.profile]
  ])
  const sender = profiles.get(pairUserIds[0])
  const recipient = profiles.get(pairUserIds[1])
  return sender && recipient ? [sender, recipient] : null
}

function sendUnavailableInviteContext(
  context: "hidden" | null,
  reply: import("fastify").FastifyReply,
  error: string
) {
  return reply.code(context === "hidden" ? 404 : 403).send({ error })
}

function sendChatRoomInviteError(error: unknown, reply: import("fastify").FastifyReply) {
  if (!(error instanceof ChatRoomInviteError)) throw error
  const statusCode = error.code === "INVITE_FORBIDDEN" || error.code === "PAIR_BLOCKED"
    ? 403
    : error.code === "INVITE_EXPIRED"
      ? 410
      : 409
  return reply.code(statusCode).send({
    code: error.code,
    error: error.message,
    ...(error.code === "SELF_IN_ROOM" && error.roomSessionId
      ? { roomSessionId: error.roomSessionId }
      : {})
  })
}
