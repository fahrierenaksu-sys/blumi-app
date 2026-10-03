import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as Hook from "./useRequestedRoomInvite"
import type * as AcceptHook from "./useRequestedRoomInviteAccept"
import type { ChatRoomInviteTimelineItem } from "../chatRoomInviteModel"
import { createChatCoordinator, type ChatCoordinatorDependencies } from "../chatCoordinator"
import type { SessionActor } from "../../session/sessionModel"

// "Invite to room" on a match's profile returns to the chat with a one-shot
// route param; the chat runs its own invite action once and clears the param.
function mount() {
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<typeof Hook>("features/chat/thread/useRequestedRoomInvite.ts", runtime)
  const events: string[] = []
  let input = {
    request: undefined as string | undefined,
    isFocused: true,
    onInvite: () => { events.push("invite") },
    clearRequest: () => { events.push("clear") }
  }
  const render = (patch: Partial<typeof input> = {}) => {
    input = { ...input, ...patch }
    runtime.render(() => hook.useRequestedRoomInvite(input))
  }
  render()
  return { render, events }
}

test("a chat without a request never sends an invite", () => {
  const f = mount()
  f.render()
  assert.deepEqual(f.events, [])
})

test("a request runs the chat's invite action exactly once and clears the param", () => {
  const f = mount()
  f.render({ request: "r1" })
  assert.deepEqual(f.events, ["clear", "invite"])
  f.render({ request: "r1" })
  f.render()
  assert.deepEqual(f.events, ["clear", "invite"])
  f.render({ request: "r2" })
  assert.deepEqual(f.events, ["clear", "invite", "clear", "invite"])
})

test("a request waits until the chat is focused (after the profile pops away)", () => {
  const f = mount()
  f.render({ request: "r1", isFocused: false })
  assert.deepEqual(f.events, [])
  f.render({ isFocused: true })
  assert.deepEqual(f.events, ["clear", "invite"])
})

function mountAcceptance() {
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<typeof AcceptHook>("features/chat/thread/useRequestedRoomInviteAccept.ts", runtime,
    { real: ["../chatRoomInviteModel"] })
  const events: string[] = []
  const requests: { thread: string; target: string }[] = []
  let finish: (found: boolean) => void = () => undefined
  let fail: (error: Error) => void = () => undefined
  const input: Parameters<typeof hook.useRequestedRoomInviteAccept>[0] = {
    currentUserId: "recipient-fixture", threadId: "thread-fixture", inviteId: "old-target-fixture", isFocused: true,
    invites: [], onAction: action => events.push(action.type), clearRequest: () => events.push("clear"),
    ensureRoomInvite: (thread, target) => {
      requests.push({ thread, target })
      return new Promise<boolean>((resolve, reject) => { finish = resolve; fail = reject })
    }
  }
  runtime.render(() => hook.useRequestedRoomInviteAccept(input))
  return { runtime, input, events, requests, finish: (found: boolean) => finish(found), getFinish: () => finish, fail: () => fail(new Error("offline")) }
}

const requestedInvite: ChatRoomInviteTimelineItem = { kind: "room_invite", threadId: "thread-fixture", inviteId: "old-target-fixture",
  senderUserId: "sender-fixture", recipientUserId: "recipient-fixture", status: "pending", createdAt: "2026-10-03T00:00:00Z" }

test("an old notification resolves only its exact target, tolerates unrelated invite refreshes and performs the cached action once", async () => {
  const s = mountAcceptance()
  assert.equal(s.requests.length, 1)
  s.input.invites = [{ ...requestedInvite, inviteId: "unrelated-fixture" }]
  s.runtime.rerender()
  assert.equal(s.requests.length, 1, "unrelated array updates must not restart a target request")
  s.input.invites = [requestedInvite]
  s.runtime.rerender()
  s.finish(true)
  await Promise.resolve()
  assert.deepEqual(s.events, ["clear", "accept"])
  s.runtime.rerender()
  assert.deepEqual(s.events, ["clear", "accept"])
  assert.deepEqual(s.requests[0], { thread: "thread-fixture", target: "old-target-fixture" })
  s.runtime.unmount()
})

test("a terminal missing target clears the request instead of waiting forever or walking history", async () => {
  const s = mountAcceptance()
  s.finish(false)
  await Promise.resolve()
  assert.deepEqual(s.events, ["clear"])
  s.runtime.rerender()
  assert.equal(s.requests.length, 1)
  s.runtime.unmount()
})

test("account, thread, blur and unmount invalidate an in-flight target callback", async () => {
  for (const change of ["account", "thread", "blur", "unmount"]) {
    const s = mountAcceptance()
    const finishOld = s.getFinish()
    // Preserve the old resolver rather than the next request's resolver.
    if (change === "unmount") s.runtime.unmount()
    else {
      if (change === "account") s.input.currentUserId = "next-account-fixture"
      if (change === "thread") s.input.threadId = "next-thread-fixture"
      if (change === "blur") s.input.isFocused = false
      s.runtime.rerender()
    }
    finishOld(false)
    await Promise.resolve()
    assert.deepEqual(s.events, [])
    if (change !== "unmount") s.runtime.unmount()
  }
})

test("a transient target lookup retries on foreground focus without clearing or automatically loading history", async () => {
  const s = mountAcceptance()
  s.fail()
  await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(s.events, [])
  assert.equal(s.requests.length, 1)
  s.input.isFocused = false; s.runtime.rerender()
  s.input.isFocused = true; s.runtime.rerender()
  assert.equal(s.requests.length, 2)
  s.finish(false)
  await Promise.resolve()
  assert.deepEqual(s.events, ["clear"])
  s.runtime.unmount()
})

test("an exact old notification completes across message reconnect and honors newer realtime cancellation", async () => {
  for (const cancelled of [false, true]) {
    const runtime = createFakeReactRuntime()
    const hook = loadSourceWithFakeReact<typeof AcceptHook>("features/chat/thread/useRequestedRoomInviteAccept.ts", runtime,
      { real: ["../chatRoomInviteModel"] })
    const events: string[] = []
    let finish: (page: Awaited<ReturnType<NonNullable<ChatCoordinatorDependencies["fetchThreadRoomInvitePage"]>>>) => void = () => undefined
    const actor = { profile: { userId: "recipient-fixture" },
      session: { mode: "production", sessionToken: "synthetic-session", sessionId: "synthetic-session" } } as SessionActor
    const input: Parameters<typeof hook.useRequestedRoomInviteAccept>[0] = {
      currentUserId: actor.profile.userId, threadId: requestedInvite.threadId, inviteId: requestedInvite.inviteId,
      invites: [], isFocused: true, clearRequest: () => events.push("clear"), onAction: action => events.push(action.type)
    }
    const unexpected = (): never => { throw new Error("unexpected non-lookup action") }
    const c = createChatCoordinator({ getSessionActor: () => actor, isCurrentSession: () => true,
      baseHttpUrl: "https://example.invalid", setRoomInvites: update => { input.invites = update(input.invites); runtime.rerender() },
      fetchThreadRoomInvites: async () => [], fetchThreadRoomInvitePage: async (_base, _token, _thread, options) => options?.inviteId
        ? new Promise(resolve => { finish = resolve }) : { invites: [], activeInvites: [], nextCursor: null, paged: true },
      fetchThreadMessages: async () => ({ userId: actor.profile.userId, threadId: requestedInvite.threadId, messages: [] }),
      hasMessageHistory: () => true, applyChatMessageListed: () => undefined, applyChatMessageListLoading: () => undefined,
      applyChatMessageListFailed: () => undefined, confirmOptimisticMessage: unexpected, markOptimisticMessageFailed: unexpected,
      markLocalThreadRead: unexpected, sendThreadMessage: unexpected, markThreadRead: unexpected, createThreadRoomInvite: unexpected,
      decideThreadRoomInvite: unexpected, cancelThreadRoomInvite: unexpected, leaveActiveRoom: unexpected, joinRoomSession: unexpected,
      openReadyMiniRoom: unexpected, sendGlobal: unexpected, captureProductEvent: () => undefined, showWarningToast: () => undefined })
    input.ensureRoomInvite = c.ensureRoomInvite
    runtime.render(() => hook.useRequestedRoomInviteAccept(input))
    await c.resynchronizeMessages(requestedInvite.threadId)
    if (cancelled) c.upsertRoomInvite({ ...requestedInvite, status: "cancelled" })
    finish({ invites: [requestedInvite], activeInvites: [], nextCursor: null, paged: true })
    await Promise.resolve(); await Promise.resolve()
    assert.deepEqual(events, cancelled ? ["clear"] : ["clear", "accept"])
    assert.equal(input.invites.find(row => row.inviteId === requestedInvite.inviteId)!.status, cancelled ? "cancelled" : "pending")
    runtime.unmount()
  }
})
