import assert from "node:assert/strict"
import test from "node:test"
import {
  cancelThreadRoomInvite,
  createThreadRoomInvite,
  decideThreadRoomInvite,
  fetchThreadRoomInvites,
  fetchThreadRoomInvitePage,
  isDefinitivelyUnavailableRoomSession,
  joinRoomSession,
  leaveActiveRoom,
  leaveRoomSession,
  RoomInviteApiError,
  RoomSessionJoinError,
  RoomSessionLeaveError
} from "./chatRoomInviteApi"

const invite = {
  inviteId: "invite_one",
  senderUserId: "user_one",
  recipientUserId: "user_two",
  sourceThreadId: "thread_one",
  status: "pending",
  createdAt: "2026-07-21T10:00:00.000Z",
  expiresAt: "2026-07-21T10:10:00.000Z"
}

const historyInvite = (index: number) => ({ ...invite, inviteId: `history-${index}`, status: "declined",
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() })

test("recent invite requests are bounded, preserve ancient live context and use the authoritative exclusive cursor", async () => {
  const history = Array.from({ length: 200 }, (_, index) => historyInvite(index))
  const seen: URL[] = []
  const fetcher = (async (url: RequestInfo | URL) => {
    const request = new URL(String(url)); seen.push(request)
    const before = request.searchParams.get("before")
    const end = before ? history.findIndex(row => row.inviteId === before) : history.length
    const page = history.slice(Math.max(0, end - 20), end)
    return createJsonResponse(200, { threadId: "thread_one", invites: page,
      nextCursor: end > 20 ? page[0]!.inviteId : null,
      activeInvites: [{ ...historyInvite(0), status: "accepted", roomSessionId: "live-fixture" }] })
  }) as typeof fetch
  const page = await fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", {}, fetcher)
  assert.equal(seen[0]!.searchParams.get("limit"), "20")
  assert.deepEqual(page.invites.map(row => row.inviteId), history.slice(-20).map(row => row.inviteId))
  assert.equal(page.activeInvites.length, 1)
  assert.equal(page.nextCursor, history[180]!.inviteId)
  const older = await fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", { before: page.nextCursor! }, fetcher)
  assert.equal(older.invites[19]!.inviteId, history[179]!.inviteId)
  assert.equal(older.nextCursor, history[160]!.inviteId)
})

test("legacy server replies support three local pages and an old exact target without constructing all historic rows", async () => {
  const rows = Array.from({ length: 200 }, (_, index) => historyInvite(index))
  const fetcher = (async () => createJsonResponse(200, { threadId: "thread_one", invites: rows })) as typeof fetch
  let before: string | undefined
  for (const end of [200, 180, 160]) {
    const page = await fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", { before }, fetcher)
    assert.equal(page.paged, false)
    assert.deepEqual(page.invites.map(row => row.inviteId), rows.slice(end - 20, end).map(row => row.inviteId))
    assert.equal(page.activeInvites.length, 0)
    before = page.nextCursor!
  }
  const target = await fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", { inviteId: rows[1]!.inviteId }, fetcher)
  assert.deepEqual(target.invites.map(row => row.inviteId), [rows[1]!.inviteId])
  assert.equal(target.nextCursor, null)
  // Historical rows need only their boundary fields during the raw scan;
  // materializing all objects would reject this never-selected old body.
  const partiallyMalformed = [{ ...rows[0], senderUserId: undefined }, ...rows.slice(1)]
  const recent = await fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", {},
    (async () => createJsonResponse(200, { threadId: "thread_one", invites: partiallyMalformed })) as typeof fetch)
  assert.equal(recent.invites.length, 20)
})

test("legacy active supplementation stays bounded and never accepts a foreign thread even outside the selected page", async () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({ ...historyInvite(index), status: "accepted" }))
  rows[0] = { ...rows[0]!, roomSessionId: "live-fixture" } as typeof rows[number]
  const run = (invites: unknown[]) => fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", {},
    (async () => createJsonResponse(200, { threadId: "thread_one", invites })) as typeof fetch)
  const page = await run(rows)
  assert.equal(page.invites.length, 20)
  assert.equal(page.activeInvites.length, 1)
  await assert.rejects(run([{ ...rows[0], sourceThreadId: "foreign-fixture" }, ...rows.slice(1)]), /could not read/)
  await assert.rejects(run(rows.map(row => ({ ...row, roomSessionId: "malformed-live-fixture" }))), /could not read/)
})

test("paged malformed targets, foreign records and non-boundary cursors are rejected; old missing targets settle terminally", async () => {
  const run = (payload: unknown, options: Parameters<typeof fetchThreadRoomInvitePage>[3] = {}) =>
    fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", options,
      (async () => createJsonResponse(200, payload)) as typeof fetch)
  const rows = [historyInvite(0), historyInvite(1)]
  await assert.rejects(run({ threadId: "thread_one", invites: rows, nextCursor: rows[1]!.inviteId, activeInvites: [] }), /could not read/)
  await assert.rejects(run({ threadId: "thread_one", invites: [{ ...rows[0], sourceThreadId: "foreign-fixture" }], nextCursor: null, activeInvites: [] }), /could not read/)
  await assert.rejects(run({ threadId: "thread_one", invites: [rows[0]], nextCursor: null, activeInvites: [] }, { inviteId: rows[1]!.inviteId }), /could not read/)
  for (const status of [403, 404]) {
    const result = await fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", { inviteId: "missing-fixture" },
      (async () => createJsonResponse(status, { error: "Unavailable" })) as typeof fetch)
    assert.deepEqual(result.invites, [])
  }
})

test("bounded invitation requests abort even when the transport does not settle", async () => {
  const controller = new AbortController()
  const pending = fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", {},
    (async () => new Promise<Response>(() => {})) as typeof fetch, controller.signal)
  const outcome = assert.rejects(pending, { name: "AbortError" })
  controller.abort()
  await outcome
})

test("legacy equal-time invitation replies may reorder without repeating or losing an older page", async () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({ ...historyInvite(index),
    inviteId: `tie-${String(index).padStart(2, "0")}`, createdAt: invite.createdAt }))
  let calls = 0
  const fetcher = (async () => createJsonResponse(200, { threadId: "thread_one",
    invites: ++calls === 1 ? rows : [...rows].reverse() })) as typeof fetch
  const first = await fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", {}, fetcher)
  const second = await fetchThreadRoomInvitePage("https://example.test", "session_token", "thread_one", { before: first.nextCursor! }, fetcher)
  assert.deepEqual(first.invites.map(row => row.inviteId), rows.slice(20).map(row => row.inviteId))
  assert.deepEqual(second.invites.map(row => row.inviteId), rows.slice(0, 20).map(row => row.inviteId))
  assert.equal(second.nextCursor, null)
})

test("room invite history cancellation settles even when the transport ignores abort", async () => {
  const controller = new AbortController()
  let transportSignal: AbortSignal | null | undefined
  const pending = fetchThreadRoomInvites(
    "https://example.test",
    "session_token",
    "thread_one",
    (async (_url: RequestInfo | URL, init?: RequestInit) => {
      transportSignal = init?.signal
      return new Promise<Response>(() => {})
    }) as typeof fetch,
    controller.signal
  )
  const rejected = assert.rejects(pending, (error: unknown) =>
    error instanceof Error && error.name === "AbortError")
  controller.abort()
  await rejected
  assert.equal(transportSignal?.aborted, true)
})

test("sending, answering and cancelling a room invite settle even when the transport stalls", async () => {
  // A stalled request must not keep the invite button or the accept button
  // busy forever: these calls share requestJson's deadline and cancellation.
  type InviteCall = (fetcher: typeof fetch, signal: AbortSignal) => Promise<unknown>
  const actions: [string, InviteCall][] = [
    ["create", (fetcher, signal) =>
      createThreadRoomInvite("https://example.test", "session_token", "thread_one", fetcher, signal)],
    ["decide", (fetcher, signal) =>
      decideThreadRoomInvite("https://example.test", "session_token", "invite_one", "accepted", fetcher, signal)],
    ["cancel", (fetcher, signal) =>
      cancelThreadRoomInvite("https://example.test", "session_token", "invite_one", fetcher, signal)]
  ]
  for (const [name, run] of actions) {
    const controller = new AbortController()
    let transportSignal: AbortSignal | null | undefined
    const pending = run((async (_url: RequestInfo | URL, init?: RequestInit) => {
      transportSignal = init?.signal
      return new Promise<Response>(() => {})
    }) as typeof fetch, controller.signal)
    const outcome = pending.then(
      () => "resolved",
      (error: unknown) => error instanceof Error ? error.name : "unknown"
    )
    controller.abort()
    let stalled: ReturnType<typeof setTimeout> | undefined
    const settled = await Promise.race([
      outcome,
      new Promise<string>((resolve) => { stalled = setTimeout(() => resolve("stalled"), 500) })
    ])
    clearTimeout(stalled)
    assert.equal(settled, "AbortError", `${name} must settle as cancelled`)
    assert.equal(transportSignal?.aborted, true, `${name} must abort its transport`)
  }
})

test("room invite API reads and creates durable thread-scoped invites", async () => {
  const invites = await fetchThreadRoomInvites(
    "http://localhost:4000/",
    "session_token",
    "thread one",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/threads/thread%20one/room-invites")
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer session_token")
      return createJsonResponse(200, { threadId: "thread one", invites: [{ ...invite, sourceThreadId: "thread one" }] })
    }) as typeof fetch
  )

  const created = await createThreadRoomInvite(
    "http://localhost:4000",
    "session_token",
    "thread one",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/threads/thread%20one/room-invites")
      assert.equal(init?.method, "POST")
      assert.equal((init?.headers as Record<string, string>)["content-type"], "application/json")
      return createJsonResponse(201, { invite: { ...invite, sourceThreadId: "thread one" }, created: true })
    }) as typeof fetch
  )

  assert.equal(invites[0]?.threadId, "thread one")
  assert.equal(created.status, "pending")
})

test("room invite API preserves a safe busy code for a recoverable own room", async () => {
  await assert.rejects(
    createThreadRoomInvite("https://example.test", "session_token", "thread_one", (async () =>
      createJsonResponse(409, { code: "SELF_IN_ROOM", error: "You are still in a room.", roomSessionId: "room_one" })
    ) as typeof fetch),
    (error: unknown) => error instanceof RoomInviteApiError && error.code === "SELF_IN_ROOM" && error.roomSessionId === "room_one"
  )
})

test("room leave APIs require authenticated server acknowledgement", async () => {
  const left = await leaveRoomSession(
    "https://example.test",
    "session_token",
    "room_one",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "https://example.test/v1/room-sessions/room_one/leave")
      assert.equal(init?.method, "POST")
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer session_token")
      return createJsonResponse(200, { ended: true })
    }) as typeof fetch
  )
  assert.equal(left.ended, true)

  const recovered = await leaveActiveRoom(
    "https://example.test",
    "session_token",
    "room_one",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "https://example.test/v1/users/me/active-room/leave")
      assert.equal(init?.method, "POST")
      assert.equal(init?.body, JSON.stringify({ expectedRoomSessionId: "room_one" }))
      return createJsonResponse(200, { ended: false })
    }) as typeof fetch
  )
  assert.equal(recovered.ended, false)

  await assert.rejects(
    leaveRoomSession("https://example.test", "session_token", "room_one", (async () =>
      createJsonResponse(503, { error: "Rooms are temporarily unavailable." })
    ) as typeof fetch),
    (error: unknown) => error instanceof RoomSessionLeaveError && error.status === 503
  )
  // The leave flow decides from the status: 404 means nothing is left to close.
  await assert.rejects(
    leaveRoomSession("https://example.test", "session_token", "room_one", (async () =>
      createJsonResponse(404, { error: "That room is not available." })
    ) as typeof fetch),
    (error: unknown) => error instanceof RoomSessionLeaveError && error.status === 404
  )
  await assert.rejects(
    leaveRoomSession("https://example.test", "session_token", "room_one", (async () =>
      createJsonResponse(200, {})
    ) as typeof fetch),
    /confirm/i
  )
})

test("room invite API decides and cancels using authenticated actions", async () => {
  const decided = await decideThreadRoomInvite(
    "http://localhost:4000",
    "session_token",
    "invite one",
    "accepted",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/room-invites/invite%20one/decision")
      assert.equal(init?.method, "POST")
      assert.equal(init?.body, JSON.stringify({ status: "accepted" }))
      return createJsonResponse(200, {
        invite: { ...invite, status: "accepted", roomSessionId: "mini_room_one" }
      })
    }) as typeof fetch
  )

  const cancelled = await cancelThreadRoomInvite(
    "http://localhost:4000",
    "session_token",
    "invite one",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/room-invites/invite%20one/cancel")
      assert.equal(init?.method, "POST")
      return createJsonResponse(200, { invite: { ...invite, status: "cancelled" } })
    }) as typeof fetch
  )

  assert.equal(decided.status, "accepted")
  assert.equal(decided.roomSessionId, "mini_room_one")
  assert.equal(decided.readyRoom, undefined, "an answer without a room falls back to joining")
  assert.equal(cancelled.status, "cancelled")
})

test("an acceptance answer carries the ready room so the room opens without a join request", async () => {
  const room = {
    miniRoom: {
      miniRoomId: "mini_room_one",
      lobbyRoomId: "thread_one",
      sourceThreadId: "thread_one",
      participantUserIds: ["user_one", "user_two"],
      livekitRoomName: "blumi-mini-room"
    },
    mediaSession: {
      miniRoomId: "mini_room_one",
      token: ["opaque", "media", "fixture"].join("-"),
      livekitUrl: "wss://livekit.example.test",
      issuedAt: "2026-07-21T10:02:00.000Z"
    },
    participants: [
      { userId: "user_one", displayName: "Mina", avatar: {} },
      { userId: "user_two", displayName: "Defne", avatar: {} }
    ]
  }
  const accepted = { ...invite, status: "accepted", roomSessionId: "mini_room_one" }
  const decided = await decideThreadRoomInvite("http://localhost:4000", "session_token", "invite_one", "accepted",
    (async () => createJsonResponse(200, { invite: accepted, decision: {}, ...room })) as typeof fetch)
  assert.equal(decided.readyRoom?.miniRoom.miniRoomId, "mini_room_one")
  assert.equal(decided.readyRoom?.participants[1]?.displayName, "Defne")
  assert.equal(decided.readyRoom?.mediaSession.livekitUrl, "wss://livekit.example.test")

  // A partial room in the answer is ignored instead of opening a broken room.
  const partial = await decideThreadRoomInvite("http://localhost:4000", "session_token", "invite_one", "accepted",
    (async () => createJsonResponse(200, { invite: accepted, miniRoom: room.miniRoom })) as typeof fetch)
  assert.equal(partial.readyRoom, undefined)
  assert.equal(partial.status, "accepted")
})

test("room invite API joins an accepted session only with a server-issued room payload", async () => {
  const mediaCredential = ["opaque", "media", "fixture"].join("-")
  const ready = await joinRoomSession(
    "http://localhost:4000",
    "session_token",
    "mini room",
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(url), "http://localhost:4000/v1/room-sessions/mini%20room/join")
      assert.equal(init?.method, "POST")
      return createJsonResponse(200, {
        miniRoom: {
          miniRoomId: "mini room",
          lobbyRoomId: "thread_one",
          sourceThreadId: "thread_one",
          participantUserIds: ["user_one", "user_two"],
          livekitRoomName: "blumi-mini-room",
          sharedDecor: { ownerUserId: "user_one", revision: 2, capturedAt: "2026-07-21T10:02:00.000Z", source: "inviter",
            decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] } }
        },
        mediaSession: {
          miniRoomId: "mini room",
          token: mediaCredential,
          livekitUrl: "wss://livekit.example.test",
          issuedAt: "2026-07-21T10:02:00.000Z"
        },
        participants: [
          { userId: "user_one", displayName: "Mina", avatar: {} },
          { userId: "user_two", displayName: "Defne", avatar: {} }
        ]
      })
    }) as typeof fetch
  )

  assert.equal(ready.miniRoom.miniRoomId, "mini room")
  assert.equal(ready.participants[1]?.displayName, "Defne")
  assert.equal(ready.miniRoom.sharedDecor?.revision, 2)
})

test("room rejoin distinguishes a closed session from a temporary transport error", async () => {
  assert.equal(isDefinitivelyUnavailableRoomSession(new RoomSessionJoinError("ended", "INVITE_NOT_AVAILABLE", 409)), true)
  assert.equal(isDefinitivelyUnavailableRoomSession(new RoomSessionJoinError("blocked", null, 403)), true)
  assert.equal(isDefinitivelyUnavailableRoomSession(new RoomSessionJoinError("missing", null, 404)), true)
  assert.equal(isDefinitivelyUnavailableRoomSession(new RoomSessionJoinError("outage", null, 503)), false)
  await assert.rejects(
    joinRoomSession("https://example.test", "token", "room_one", (async () =>
      createJsonResponse(409, { code: "INVITE_NOT_AVAILABLE", error: "That room is not available." })
    ) as typeof fetch),
    (error: unknown) => error instanceof RoomSessionJoinError &&
      error.status === 409 && error.code === "INVITE_NOT_AVAILABLE"
  )
  await assert.rejects(
    joinRoomSession("https://example.test", "token", "room_one", (async () =>
      createJsonResponse(503, { error: "Rooms are temporarily unavailable." })
    ) as typeof fetch),
    (error: unknown) => error instanceof RoomSessionJoinError &&
      error.status === 503 && error.code === null
  )
})

test("room invite API rejects malformed or failed server responses", async () => {
  for (const sharedDecor of [null, { ownerUserId: "user_one", revision: 1, source: "inviter", capturedAt: "2026-07-21T10:02:00.000Z",
    decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [{ instanceId: "one", itemId: "chair", x: "0.5", y: 0.5, rotation: "front" }] } }]) {
    await assert.rejects(() => joinRoomSession("http://localhost:4000", "session_token", "room", (async () => createJsonResponse(200, {
      miniRoom: { miniRoomId: "room", lobbyRoomId: "thread", participantUserIds: ["user_one", "user_two"], livekitRoomName: "live", sharedDecor },
      mediaSession: { miniRoomId: "room", livekitUrl: "wss://livekit.example.test", token: "token", issuedAt: "2026-07-21T10:02:00.000Z" },
      participants: [{ userId: "user_one", displayName: "A", avatar: {} }, { userId: "user_two", displayName: "B", avatar: {} }]
    })) as typeof fetch), /could not open/)
  }
  await assert.rejects(
    () =>
      fetchThreadRoomInvites(
        "http://localhost:4000",
        "session_token",
        "thread_one",
        (async () => createJsonResponse(403, { error: "That conversation is not available." })) as typeof fetch
      ),
    /conversation/
  )

  await assert.rejects(
    () =>
      createThreadRoomInvite(
        "http://localhost:4000",
        "session_token",
        "thread_one",
        (async () => createJsonResponse(200, { invite: { inviteId: 4 } })) as typeof fetch
      ),
    /room invitation/
  )
})

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}
