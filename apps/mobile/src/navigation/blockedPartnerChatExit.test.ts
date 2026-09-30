import assert from "node:assert/strict"
import test from "node:test"
import {
  applyBlockedPartnerToChat,
  isChatWithBlockedPartner,
  type BlockedPartnerNavigation,
  type FocusedRouteSnapshot
} from "./blockedPartnerChatExit"

function createNavigation(route: FocusedRouteSnapshot | undefined, canGoBack = true) {
  const calls: string[] = []
  const navigation: BlockedPartnerNavigation = {
    getCurrentRoute: () => route,
    canGoBack: () => canGoBack,
    goBack: () => { calls.push("goBack") },
    replaceWithInbox: () => { calls.push("replaceWithInbox") }
  }
  return { navigation, calls }
}

test("an open conversation with the blocked partner is recognised by thread or by pending partner", () => {
  assert.equal(isChatWithBlockedPartner({ name: "ChatThread", params: { threadId: "t1" } }, "bora", ["t1"]), true)
  assert.equal(isChatWithBlockedPartner({ name: "ChatThread", params: { partnerId: "bora" } }, "bora", []), true)
  assert.equal(isChatWithBlockedPartner({ name: "ChatThread", params: { threadId: "t2" } }, "bora", ["t1"]), false)
  assert.equal(isChatWithBlockedPartner({ name: "ProfilePreview", params: { userId: "bora" } }, "bora", ["t1"]), false)
  assert.equal(isChatWithBlockedPartner(undefined, "bora", ["t1"]), false)
})

test("blocking from the chat screen removes the threads and leaves the conversation like back", () => {
  const removedFor: string[] = []
  const { navigation, calls } = createNavigation({ name: "ChatThread", params: { threadId: "t1" } })
  const result = applyBlockedPartnerToChat({
    blockedUserId: "bora",
    removeThreadsWithPartner: (partnerUserId) => { removedFor.push(partnerUserId); return ["t1"] },
    navigation
  })
  assert.deepEqual(removedFor, ["bora"])
  assert.deepEqual(result, { removedThreadIds: ["t1"], leftChat: true })
  assert.deepEqual(calls, ["goBack"])
})

test("a chat opened as the only screen falls back to the inbox", () => {
  const { navigation, calls } = createNavigation({ name: "ChatThread", params: { threadId: "t1" } }, false)
  applyBlockedPartnerToChat({ blockedUserId: "bora", removeThreadsWithPartner: () => ["t1"], navigation })
  assert.deepEqual(calls, ["replaceWithInbox"])
})

test("blocking elsewhere or a repeated realtime confirmation only removes threads", () => {
  const profile = createNavigation({ name: "ProfilePreview", params: { userId: "bora" } })
  assert.deepEqual(
    applyBlockedPartnerToChat({ blockedUserId: "bora", removeThreadsWithPartner: () => ["t1"], navigation: profile.navigation }),
    { removedThreadIds: ["t1"], leftChat: false }
  )
  assert.deepEqual(profile.calls, [])

  // The confirmation arrives after the local block already left the chat.
  const inbox = createNavigation({ name: "Inbox" })
  applyBlockedPartnerToChat({ blockedUserId: "bora", removeThreadsWithPartner: () => [], navigation: inbox.navigation })
  assert.deepEqual(inbox.calls, [])

  // Another person's conversation stays open.
  const other = createNavigation({ name: "ChatThread", params: { threadId: "t9" } })
  applyBlockedPartnerToChat({ blockedUserId: "bora", removeThreadsWithPartner: () => ["t1"], navigation: other.navigation })
  assert.deepEqual(other.calls, [])

  // Navigation not ready: the store is still cleaned.
  let removed = 0
  applyBlockedPartnerToChat({ blockedUserId: "bora", removeThreadsWithPartner: () => { removed += 1; return [] }, navigation: null })
  assert.equal(removed, 1)
})
