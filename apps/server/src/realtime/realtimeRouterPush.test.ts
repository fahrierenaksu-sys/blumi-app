import assert from "node:assert/strict"
import test from "node:test"
import type { ClientEvent, UserProfile } from "@blumi/contracts"
import { createAvatarSelection, DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import type { WebSocket } from "ws"
import { createChatService } from "../chat/chatService"
import type { ConnectionService } from "../connections/connectionService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createNotificationService } from "../notifications/notificationService"
import type { PushNotification } from "../notifications/pushProvider"
import { createPresenceService } from "../presence/presenceService"
import { createReactionService } from "../reactions/reactionService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createConnectionManager } from "./connectionManager"
import { createRealtimeRouter } from "./realtimeRouter"

// P-03: a socket the server still counts may belong to a phone that already
// went to the background. Realtime-triggered pushes are queued regardless;
// the phone decides whether to show them.
test("a realtime connection match queues pushes for both people even while their sockets look open", async () => {
  const ada = profile("push_ada", "Ada")
  const bora = profile("push_bora", "Bora")
  const sent: Array<{ pushToken: string; notification: PushNotification }> = []
  const notificationService = createNotificationService({
    pushProvider: { async sendPush(pushToken, notification) { sent.push({ pushToken, notification }) } }
  })
  await notificationService.registerDevice(ada.userId, { platform: "ios", pushToken: "ada-device" })
  await notificationService.registerDevice(bora.userId, { platform: "ios", pushToken: "bora-device" })
  const connectionManager = createConnectionManager()
  const connect = (userProfile: UserProfile) => connectionManager.addConnection({
    profile: userProfile,
    socket: { readyState: 1, send() {} } as unknown as WebSocket
  })
  const adaConnection = connect(ada)
  connect(bora)
  const chatService = createChatService()
  const safetyService = createSafetyService()
  const presenceService = createPresenceService({ roomService: createRoomService() })
  const router = createRealtimeRouter({
    connectionManager,
    presenceService,
    miniRoomService: createMiniRoomService({
      presenceService,
      safetyService,
      chatService,
      livekitTokenService: { createMediaSession: () => ({ token: "test" }) } as never
    }),
    connectionService: {
      async decide(actorUserId: string) {
        return {
          decision: { miniRoomId: "room_1", userId: actorUserId, partnerUserId: bora.userId, status: "saved", decidedAt: "2026-09-30T10:00:00.000Z" },
          match: { miniRoomId: "room_1", participantUserIds: [ada.userId, bora.userId], matchedAt: "2026-09-30T10:00:00.000Z" }
        }
      }
    } as unknown as ConnectionService,
    reactionService: createReactionService(),
    chatService,
    safetyService,
    notificationService
  })

  await router.handleClientEvent(adaConnection, {
    type: "connection.decide",
    payload: { miniRoomId: "room_1", partnerUserId: bora.userId, status: "saved" }
  } as ClientEvent)
  await notificationService.dispatchDue()

  assert.deepEqual(sent.map((entry) => entry.pushToken).sort(), ["ada-device", "bora-device"])
  for (const { notification } of sent) {
    assert.equal(notification.data?.type, "connection.matched")
    assert.doesNotMatch(`${notification.title} ${notification.body}`, /Ada|Bora/)
  }
})

function profile(userId: string, displayName: string): UserProfile {
  return {
    userId,
    displayName,
    avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 0)
  }
}
