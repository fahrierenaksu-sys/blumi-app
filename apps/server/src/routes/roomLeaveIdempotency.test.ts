import assert from "node:assert/strict"
import test from "node:test"
import { startSocialLoop, type SimSocket, type SimUser, type SocialLoopHarness } from "../e2e/socialLoopHarness"
import { connectedMatchedPair, enterRoomTogether } from "../e2e/socialLoopScenarios"
import { USER_REQUESTS_PER_MINUTE } from "../operations/sharedRateBudget"
import { FAILED_AUTH_RESPONSES_PER_IP_PER_MINUTE } from "../operations/requestLimits"

/**
 * MiniRoom leave (POST /v1/room-sessions/:id/leave) through the production
 * wiring: real Fastify app, request-validation policy, shared request budget,
 * failed-auth limiter and websockets. The request is exactly what the phone
 * sends (leaveRoomSession: POST, bearer header only, no body, no
 * content-type). These answers are the contract the app's leave flow relies
 * on: 200 means the room is closed (now or already); 404 means there is no
 * room this person can close; anything else changed nothing and is safe to
 * retry.
 */

interface LeaveAnswer { status: number; body: Record<string, unknown> | undefined; retryAfter: string | null }

async function phoneLeave(
  harness: SocialLoopHarness,
  user: SimUser,
  roomId: string,
  options: { token?: string; clientAddress?: string } = {}
): Promise<LeaveAnswer> {
  const response = await fetch(`${harness.baseUrl}/v1/room-sessions/${encodeURIComponent(roomId)}/leave`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.token ?? user.sessionToken}`,
      "x-forwarded-for": options.clientAddress ?? user.clientAddress
    }
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : undefined, retryAfter: response.headers.get("retry-after") }
}

async function openConnectedRoom(harness: SocialLoopHarness, names: [string, string]) {
  const pair = await connectedMatchedPair({ harness, report: () => {} }, names)
  const { miniRoomId } = await harness.openRoom(pair.ada, pair.bora, pair.threadId)
  await enterRoomTogether(pair.sa, pair.sb, miniRoomId)
  return { ...pair, miniRoomId }
}

async function endedEventsFor(socket: SimSocket, miniRoomId: string, since: number) {
  await socket.barrier()
  return socket.received("mini_room.ended", since).filter((entry) => entry.event.payload.miniRoomId === miniRoomId)
}

test("leaving a connected room with the phone's exact request closes it for both, once", async () => {
  const harness = await startSocialLoop()
  try {
    const { ada, sa, sb, miniRoomId } = await openConnectedRoom(harness, ["Ada", "Bora"])
    const [markA, markB] = [sa.mark(), sb.mark()]

    const left = await phoneLeave(harness, ada, miniRoomId)
    assert.equal(left.status, 200, JSON.stringify(left.body))
    assert.deepEqual(left.body, { ended: true })
    assert.equal((await endedEventsFor(sb, miniRoomId, markB)).length, 1, "the partner is told the room ended")
    assert.equal((await endedEventsFor(sa, miniRoomId, markA)).length, 1)
    assert.equal(await harness.services.miniRoomService.findActiveMiniRoomForUser(ada.userId), null)

    // A repeated leave (a retry whose first answer was lost) is a quiet success.
    const again = await phoneLeave(harness, ada, miniRoomId)
    assert.equal(again.status, 200)
    assert.deepEqual(again.body, { ended: false })
    assert.equal((await endedEventsFor(sb, miniRoomId, markB)).length, 1, "no second room-ended event")
    await Promise.all([sa.close(), sb.close()])
  } finally {
    await harness.close()
  }
})

test("leaving a room the partner already ended is a quiet success", async () => {
  const harness = await startSocialLoop()
  try {
    const { ada, bora, sa, sb, miniRoomId } = await openConnectedRoom(harness, ["Cem", "Defne"])
    const partnerLeft = await phoneLeave(harness, bora, miniRoomId)
    assert.deepEqual(partnerLeft.body, { ended: true })
    await sb.waitFor("mini_room.ended", (event) => event.payload.miniRoomId === miniRoomId)
    const markB = sb.mark()
    const left = await phoneLeave(harness, ada, miniRoomId)
    assert.equal(left.status, 200)
    assert.deepEqual(left.body, { ended: false })
    assert.equal((await endedEventsFor(sb, miniRoomId, markB)).length, 0)
    await Promise.all([sa.close(), sb.close()])
  } finally {
    await harness.close()
  }
})

test("a room that no longer exists answers 404 exactly like a stranger's room", async () => {
  const harness = await startSocialLoop()
  try {
    const { ada, sa, sb, miniRoomId } = await openConnectedRoom(harness, ["Ece", "Fikret"])
    const stranger = await harness.signUp("Gül")
    const missing = await phoneLeave(harness, ada, "room_that_does_not_exist")
    const foreign = await phoneLeave(harness, stranger, miniRoomId)
    // The app treats 404 as "nothing left to close"; one answer for both
    // cases keeps the route from confirming which room ids exist.
    assert.equal(missing.status, 404)
    assert.deepEqual(missing.body, foreign.body)
    assert.equal(foreign.status, 404)
    assert.ok(await harness.services.miniRoomService.findActiveMiniRoomForUser(ada.userId), "a stranger closes nothing")
    await Promise.all([sa.close(), sb.close()])
  } finally {
    await harness.close()
  }
})

test("a token replaced by a session refresh is refused and the room stays open for a retry", async () => {
  const harness = await startSocialLoop()
  try {
    const { ada, sa, sb, miniRoomId } = await openConnectedRoom(harness, ["Hale", "Ilgaz"])
    const staleToken = ada.sessionToken
    const refreshed = await ada.http("POST", "/v1/auth/refresh")
    assert.equal(refreshed.status, 200)
    const stale = await phoneLeave(harness, ada, miniRoomId, { token: staleToken })
    assert.equal(stale.status, 401)
    assert.ok(await harness.services.miniRoomService.findActiveMiniRoomForUser(ada.userId))

    const fresh = await phoneLeave(harness, ada, miniRoomId, { token: refreshed.body.session.sessionToken as string })
    assert.equal(fresh.status, 200)
    assert.deepEqual(fresh.body, { ended: true })
    await Promise.all([sa.close(), sb.close()])
  } finally {
    await harness.close()
  }
})

test("request limits answer 429 with Retry-After and change nothing", async () => {
  const harness = await startSocialLoop()
  try {
    const { ada, bora, sa, sb, miniRoomId } = await openConnectedRoom(harness, ["Jale", "Kaan"])

    // A person over the per-minute budget (shared across instances).
    for (let index = 0; index < USER_REQUESTS_PER_MINUTE; index += 1) await ada.http("GET", "/v1/threads")
    const overBudget = await phoneLeave(harness, ada, miniRoomId)
    assert.equal(overBudget.status, 429)
    assert.ok(Number(overBudget.retryAfter) >= 1)
    assert.ok(await harness.services.miniRoomService.findActiveMiniRoomForUser(ada.userId), "the refused leave changed nothing")

    // Another phone on the same network address sent unverifiable tokens:
    // the address is refused before any session lookup, even with a valid one.
    const sharedAddress = bora.clientAddress
    for (let index = 0; index < FAILED_AUTH_RESPONSES_PER_IP_PER_MINUTE; index += 1) {
      const response = await harness.request("GET", "/v1/threads", { sessionToken: "not-a-session", clientAddress: sharedAddress })
      assert.equal(response.status, 401)
    }
    const sameNetwork = await phoneLeave(harness, bora, miniRoomId, { clientAddress: sharedAddress })
    assert.equal(sameNetwork.status, 429)
    assert.ok(await harness.services.miniRoomService.findActiveMiniRoomForUser(bora.userId))
    await Promise.all([sa.close(), sb.close()])
  } finally {
    await harness.close()
  }
})

test("a transient failure while closing changes nothing, and the retried leave closes the room once", async () => {
  const harness = await startSocialLoop()
  try {
    const { ada, sa, sb, miniRoomId } = await openConnectedRoom(harness, ["Lale", "Mert"])
    const service = harness.services.miniRoomService
    const leaveMiniRoom = service.leaveMiniRoom
    service.leaveMiniRoom = async () => {
      // node-postgres' message when the database connection drops mid-query.
      throw new Error("Connection terminated unexpectedly")
    }
    const markB = sb.mark()
    let failed: LeaveAnswer
    try {
      failed = await phoneLeave(harness, ada, miniRoomId)
    } finally {
      service.leaveMiniRoom = leaveMiniRoom
    }
    assert.equal(failed.status, 503)
    assert.equal(failed.retryAfter, "1")
    assert.ok(await service.findActiveMiniRoomForUser(ada.userId))
    assert.equal((await endedEventsFor(sb, miniRoomId, markB)).length, 0)

    const retried = await phoneLeave(harness, ada, miniRoomId)
    assert.equal(retried.status, 200)
    assert.deepEqual(retried.body, { ended: true })
    assert.equal((await endedEventsFor(sb, miniRoomId, markB)).length, 1)
    await Promise.all([sa.close(), sb.close()])
  } finally {
    await harness.close()
  }
})
