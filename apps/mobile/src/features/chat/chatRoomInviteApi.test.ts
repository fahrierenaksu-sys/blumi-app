import assert from "node:assert/strict"
import test from "node:test"
import {
  cancelThreadRoomInvite,
  createThreadRoomInvite,
  decideThreadRoomInvite,
  fetchThreadRoomInvites,
  isDefinitivelyUnavailableRoomSession,
  joinRoomSession,
  leaveActiveRoom,
  leaveRoomSession,
  RoomInviteApiError,
  RoomSessionJoinError
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
    ) as typeof fetch)
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
          { userId: "user_two", displayName: "Defne", avatar: {}, profileUpdatedAt: "2026-10-01T12:00:00.000Z" }
        ]
      })
    }) as typeof fetch
  )

  assert.equal(ready.miniRoom.miniRoomId, "mini room")
  assert.equal(ready.participants[1]?.displayName, "Defne")
  assert.equal(ready.participants[1]?.profileUpdatedAt, "2026-10-01T12:00:00.000Z")
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
