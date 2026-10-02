import assert from "node:assert/strict"
import test from "node:test"
import { PUSH_CATEGORY_IDS } from "../../../../server/src/notifications/pushMessagePolicy"
import {
  DEFAULT_NOTIFICATION_ACTION_ID,
  ROOM_INVITE_ENTER_ACTION_ID,
  ROOM_INVITE_LATER_ACTION_ID,
  getNotificationCategories,
  resolveNotificationResponseIntent
} from "./notificationActions"
import { resolveNotificationDestination } from "./notificationRouting"
import { resolveRequestedRoomInviteStep } from "../chat/thread/useRequestedRoomInviteAccept"
import type { ChatRoomInviteTimelineItem } from "../chat/chatRoomInviteModel"

test("the app registers exactly the categories the server sends, so the invite buttons appear", () => {
  for (const locale of ["en", "tr"] as const) {
    const categories = getNotificationCategories(locale)
    assert.deepEqual(
      categories.map((category) => category.identifier).sort(),
      Object.values(PUSH_CATEGORY_IDS).sort()
    )
    const invite = categories.find((category) => category.identifier === PUSH_CATEGORY_IDS["chat.room_invite"])
    assert.deepEqual(invite?.actions.map((action) => [action.identifier, action.options.opensAppToForeground]), [
      [ROOM_INVITE_ENTER_ACTION_ID, true],
      [ROOM_INVITE_LATER_ACTION_ID, false]
    ], "Enter room opens the app; Later only closes the notification")
    for (const category of categories) {
      assert.ok(category.options.previewPlaceholder.length > 0)
      for (const action of category.actions) assert.ok(action.buttonTitle.length > 0)
    }
  }
  assert.notDeepEqual(
    getNotificationCategories("tr")[1]?.actions.map((action) => action.buttonTitle),
    getNotificationCategories("en")[1]?.actions.map((action) => action.buttonTitle),
    "button titles follow the app language"
  )
})

test("a notification response becomes a tap, an enter-room request or a plain dismissal", () => {
  assert.deepEqual(resolveNotificationResponseIntent(DEFAULT_NOTIFICATION_ACTION_ID), { kind: "open" })
  assert.deepEqual(resolveNotificationResponseIntent(undefined), { kind: "open" })
  assert.deepEqual(resolveNotificationResponseIntent(ROOM_INVITE_ENTER_ACTION_ID), { kind: "enter_room" })
  assert.deepEqual(resolveNotificationResponseIntent(ROOM_INVITE_LATER_ACTION_ID), { kind: "dismiss" })
  assert.deepEqual(resolveNotificationResponseIntent("com.apple.UNNotificationDismissActionIdentifier"), { kind: "dismiss" })
})

test("Enter room opens the invite's chat with a one-shot accept; a plain tap only opens the chat", () => {
  const invite = { type: "chat.room_invite", threadId: " thread_1 ", inviteId: " invite_1 " }
  assert.deepEqual(resolveNotificationDestination(invite, "enter_room"),
    { route: "ChatThread", params: { threadId: "thread_1", roomInviteAccept: "invite_1" } })
  assert.deepEqual(resolveNotificationDestination(invite), { route: "ChatThread", params: { threadId: "thread_1" } })
  assert.deepEqual(resolveNotificationDestination({ type: "chat.room_invite", threadId: "thread_1" }, "enter_room"),
    { route: "ChatThread", params: { threadId: "thread_1" } }, "no invite id: the chat still opens")
  assert.deepEqual(resolveNotificationDestination({ type: "chat.message", threadId: "thread_1", inviteId: "x" }, "enter_room"),
    { route: "ChatThread", params: { threadId: "thread_1" } }, "only invites accept")
})

test("the requested accept runs the card's own action once the invite is known", () => {
  const invite = (status: ChatRoomInviteTimelineItem["status"], extra: Partial<ChatRoomInviteTimelineItem> = {}): ChatRoomInviteTimelineItem => ({
    kind: "room_invite",
    inviteId: "invite_1",
    threadId: "thread_1",
    senderUserId: "user_ada",
    recipientUserId: "user_bora",
    createdAt: "2026-10-02T10:00:00.000Z",
    status,
    ...extra
  })
  assert.deepEqual(resolveRequestedRoomInviteStep([], "invite_1", "user_bora"), { kind: "wait" })
  assert.deepEqual(resolveRequestedRoomInviteStep([invite("pending")], "invite_1", "user_bora"),
    { kind: "run", action: { type: "accept", inviteId: "invite_1" } })
  assert.deepEqual(resolveRequestedRoomInviteStep([invite("accepted", { roomSessionId: "room_1" })], "invite_1", "user_bora"),
    { kind: "run", action: { type: "open_room", inviteId: "invite_1", roomSessionId: "room_1" } })
  for (const status of ["declined", "expired", "cancelled"] as const) {
    assert.deepEqual(resolveRequestedRoomInviteStep([invite(status)], "invite_1", "user_bora"), { kind: "drop" })
  }
  assert.deepEqual(resolveRequestedRoomInviteStep([invite("pending")], "invite_1", "user_ada"), { kind: "drop" },
    "the sender's own invite is never accepted")
})
