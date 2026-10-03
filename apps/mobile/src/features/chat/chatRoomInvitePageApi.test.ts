import assert from "node:assert/strict"
import test from "node:test"
import { fetchThreadRoomInvitePage, type FetchRoomInvitePageOptions } from "./chatRoomInviteApi"

const threadId = "synthetic-thread"
const origin = "https://example.test"

function invitation(index: number) {
  return {
    inviteId: `synthetic-invite-${String(index).padStart(4, "0")}`,
    sourceThreadId: threadId,
    senderUserId: "synthetic-sender",
    recipientUserId: "synthetic-recipient",
    status: "expired" as string,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
  }
}

function jsonResponse(status: number, payload: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response
}

function request(payload: unknown, options: FetchRoomInvitePageOptions = {}, status = 200) {
  return fetchThreadRoomInvitePage(origin, "synthetic-session", threadId, options,
    (async () => jsonResponse(status, payload)) as typeof fetch)
}

test("a custom bounded history request preserves exclusive order and separate ancient active context", async () => {
  const rows = [invitation(4), invitation(5), invitation(6)]
  const active = { ...invitation(0), status: "accepted", roomSessionId: "synthetic-live-room" }
  const before = invitation(7).inviteId
  const page = await fetchThreadRoomInvitePage(origin, "synthetic-session", threadId, { before, limit: 3 },
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      const query = new URL(String(url)).searchParams
      assert.equal(query.get("limit"), "3")
      assert.equal(query.get("before"), before)
      assert.equal(query.has("inviteId"), false)
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer synthetic-session")
      return jsonResponse(200, { threadId, invites: rows, nextCursor: rows[0].inviteId, activeInvites: [active] })
    }) as typeof fetch)
  assert.equal(page.paged, true)
  assert.deepEqual(page.invites.map(row => row.inviteId), rows.map(row => row.inviteId))
  assert.deepEqual(page.activeInvites.map(row => row.inviteId), [active.inviteId])
  assert.equal(page.nextCursor, rows[0].inviteId)
  assert.ok(page.invites.every(row => row.inviteId !== before && row.inviteId !== active.inviteId))
})

test("exact lookup has no history query and a denied or missing target settles as an empty terminal result", async () => {
  const target = invitation(0)
  const found = await fetchThreadRoomInvitePage(origin, "synthetic-session", threadId, { inviteId: target.inviteId },
    (async (url: RequestInfo | URL) => {
      const query = new URL(String(url)).searchParams
      assert.equal(query.get("inviteId"), target.inviteId)
      assert.equal(query.has("limit"), false)
      assert.equal(query.has("before"), false)
      return jsonResponse(200, { threadId, invites: [target], nextCursor: null, activeInvites: [] })
    }) as typeof fetch)
  assert.deepEqual(found.invites.map(row => row.inviteId), [target.inviteId])
  for (const status of [403, 404]) {
    assert.deepEqual(await request({ error: "Synthetic unavailable target" }, { inviteId: target.inviteId }, status), {
      invites: [], activeInvites: [], nextCursor: null, paged: true
    })
  }
  await assert.rejects(request({ error: "Synthetic service outage" }, { inviteId: target.inviteId }, 503))
})

test("declared pages reject duplicate invitation identity inside history or active context", async () => {
  const first = invitation(0)
  const second = invitation(1)
  const active = { ...invitation(2), status: "accepted", roomSessionId: "synthetic-live-room" }
  for (const payload of [
    { threadId, invites: [first, first], nextCursor: null, activeInvites: [] },
    { threadId, invites: [first, second], nextCursor: null, activeInvites: [active, active] },
    { threadId, invites: [first, active], nextCursor: null, activeInvites: [active] }
  ]) await assert.rejects(request(payload), "one canonical invitation cannot appear twice in a declared page")
})

test("declared page history cannot include its exclusive before boundary", async () => {
  const first = invitation(0)
  const boundary = invitation(1)
  await assert.rejects(request({ threadId, invites: [first, boundary], nextCursor: null, activeInvites: [] }, {
    before: boundary.inviteId, limit: 2
  }))
})

test("a declared continuation cursor must be a non-empty identity anchored to the oldest page row", async () => {
  const first = invitation(0)
  for (const cursor of ["", false, 12, "synthetic-missing-boundary"]) {
    await assert.rejects(request({ threadId, invites: [first], nextCursor: cursor, activeInvites: [] }))
  }
  await assert.rejects(request({ threadId, invites: [], nextCursor: first.inviteId, activeInvites: [] }))
})

test("declared history pages reject reversed chronological and tie-breaking order", async () => {
  const first = invitation(0)
  const second = invitation(1)
  await assert.rejects(request({ threadId, invites: [second, first], nextCursor: null, activeInvites: [] }))
  const tied = { ...first, inviteId: second.inviteId }
  await assert.rejects(request({ threadId, invites: [tied, first], nextCursor: null, activeInvites: [] }))
})

test("declared active context rejects terminal membership and an accepted invite without a room", async () => {
  const history = [invitation(2)]
  for (const active of [
    invitation(0),
    { ...invitation(0), status: "declined" },
    { ...invitation(0), status: "cancelled" },
    { ...invitation(0), status: "accepted" }
  ]) await assert.rejects(request({ threadId, invites: history, nextCursor: null, activeInvites: [active] }))
})

test("declared pages enforce the requested custom limit and exact lookup exclusivity", async () => {
  const first = invitation(0)
  const second = invitation(1)
  await assert.rejects(request({ threadId, invites: [first, second], nextCursor: null, activeInvites: [] }, { limit: 1 }))
  for (const options of [
    { inviteId: first.inviteId, limit: 1 },
    { inviteId: first.inviteId, before: second.inviteId }
  ]) await assert.rejects(fetchThreadRoomInvitePage(origin, "synthetic-session", threadId, options,
    (async () => { assert.fail("an exact target must not enter the transport with history options") }) as typeof fetch))
  await assert.rejects(request({ threadId, invites: [first], nextCursor: null, activeInvites: [] }, { inviteId: second.inviteId }))
})
