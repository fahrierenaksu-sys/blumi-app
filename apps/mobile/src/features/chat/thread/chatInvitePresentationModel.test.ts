import assert from "node:assert/strict"
import test from "node:test"
import { getCompactRoomInviteIds, getRoomInviteComposerContext } from "./chatInvitePresentationModel"
import { getChatInitialRenderCount, getChatTimelineItemKey, getRoomInviteActions, type ChatRoomInviteTimelineItem } from "../chatRoomInviteModel"
import { planChatTimelineEntrances } from "./chatTimelineEntranceModel"
import { applyLatestRoomInvitePage, getChatRoomInviteHistory, observeRoomInviteActiveContext, resetChatRoomInviteHistory } from "../chatRoomInvitePagingStore"
import { getRoomInviteComposerState } from "./chatThreadModel"
import { CHAT_COPY } from "./chatThreadCopy"

const invite = (index: number): ChatRoomInviteTimelineItem => ({
  kind: "room_invite", inviteId: `history-${String(index).padStart(3, "0")}`, threadId: "thread-fixture",
  senderUserId: "sender-fixture", recipientUserId: "recipient-fixture", status: "declined",
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
})

test("historical invitation scenes compact while newest, pending and server-live contexts remain full", () => {
  const rows = Array.from({ length: 200 }, (_, index) => invite(index))
  rows[0] = { ...rows[0]!, status: "pending" }
  rows[1] = { ...rows[1]!, status: "accepted", roomSessionId: "live-fixture" }
  rows[2] = { ...rows[2]!, status: "accepted", roomSessionId: "historical-fixture" }
  const compact = getCompactRoomInviteIds(rows, [rows[1]!.inviteId])
  assert.equal(compact.size, 197)
  assert.ok(compact.has(rows[2]!.inviteId), "visual compaction does not derive room permission from old cache")
  assert.ok(!compact.has(rows[0]!.inviteId))
  assert.ok(!compact.has(rows[1]!.inviteId))
  assert.ok(!compact.has(rows[199]!.inviteId))
})

test("new invite compacts the previous card without changing its key or replaying arrival motion", () => {
  const previous = [invite(1)]
  const next = [...previous, invite(2)]
  const key = getChatTimelineItemKey(previous[0]!)
  assert.ok(getCompactRoomInviteIds(next, []).has(previous[0]!.inviteId))
  assert.equal(getChatTimelineItemKey(next[0]!), key)
  const plan = planChatTimelineEntrances({ knownKeys: new Set([key]), items: previous, nextItems: next,
    isInitialLoad: false, reduceMotion: false })
  assert.ok(!plan.enteringKeys.has(key))
  assert.ok(plan.enteringKeys.has(getChatTimelineItemKey(next[1]!)))
})

test("compact invite history fills the initial viewport using the ordinary row floor", () => {
  const rows = Array.from({ length: 20 }, (_, index) => invite(index))
  const compact = getCompactRoomInviteIds(rows, [])
  const fullCount = getChatInitialRenderCount(844, rows)
  const compactCount = getChatInitialRenderCount(844, rows, compact)
  assert.ok(compactCount > fullCount)
  assert.ok(compactCount >= 15, "many small status rows cannot use a tall-card initial batch")
})

test("authoritative empty active context removes stale composer busy/ready state while preserving cached card actions", () => {
  resetChatRoomInviteHistory()
  const cached = [{ ...invite(0), status: "pending" as const },
    { ...invite(1), status: "accepted" as const, roomSessionId: "historic-room-fixture" }]
  const setActive = (activeInviteIds: readonly string[], activeContextKnown = true) => applyLatestRoomInvitePage({
    userId: "recipient-fixture", threadId: "thread-fixture", inviteIds: [invite(100).inviteId],
    activeInviteIds, activeContextKnown, nextCursor: invite(100).inviteId
  })
  const context = () => getRoomInviteComposerContext(cached, getChatRoomInviteHistory("thread-fixture", "recipient-fixture"))
  const composer = () => getRoomInviteComposerState({ resolvedThreadId: "thread-fixture", isPendingThread: false,
    hasRoomInviteHandler: true, threadRoomInvites: context(), activeRoomInviteAction: null, chatCopy: CHAT_COPY.en })
  setActive([])
  assert.equal(composer().canCreateRoomInvite, true)
  assert.ok(!context().some(row => row.status === "accepted" && row.roomSessionId))
  assert.equal(getRoomInviteActions(cached[1]!, "recipient-fixture")[0]!.type, "open_room", "a compact old card keeps its server-validated open action")
  setActive(cached.map(row => row.inviteId))
  assert.equal(composer().canCreateRoomInvite, false)
  assert.ok(context().some(row => row.status === "accepted" && row.roomSessionId))
  setActive([])
  observeRoomInviteActiveContext("recipient-fixture", "thread-fixture", cached[0]!.inviteId, true)
  assert.equal(composer().canCreateRoomInvite, false, "fresh realtime active context is available immediately")
  setActive([cached[1]!.inviteId], false)
  assert.deepEqual(context().map(row => row.inviteId), [cached[1]!.inviteId], "legacy replies retain their bounded live-context supplement")
  setActive([], false)
  assert.equal(composer().canCreateRoomInvite, true, "a complete legacy reply also clears obsolete cached pending context")
  resetChatRoomInviteHistory()
  assert.equal(getRoomInviteComposerContext(cached, getChatRoomInviteHistory("thread-fixture", "recipient-fixture")), cached,
    "before the first reply, existing cached composer behaviour remains")
})
