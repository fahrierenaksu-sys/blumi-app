import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread } from "@blumi/contracts"
import { applyChatThreadListed, removeChatThreadsWithPartner, resetChatStore, subscribeToChatStore } from "./chatStore"
import {
  clearChatComposerDrafts,
  readChatComposerDraft,
  resetChatComposerDrafts,
  writeChatComposerDraft
} from "./chatComposerDraftStore"

// Obviously fake owners and bodies; no real ids or messages.
const ACCOUNT_A = "account-test-a"
const ACCOUNT_B = "account-test-b"

function partnerThread(threadId: string, partnerUserId: string): ChatThread {
  return {
    threadId,
    miniRoomId: `room_${threadId}`,
    participantUserIds: [ACCOUNT_A, partnerUserId],
    participants: [{ userId: ACCOUNT_A, displayName: "Me" }, { userId: partnerUserId, displayName: "Partner" }],
    createdAt: "2026-09-30T09:00:00.000Z"
  } as ChatThread
}

test("a draft is kept per account and conversation until it is emptied", () => {
  resetChatComposerDrafts()
  writeChatComposerDraft(ACCOUNT_A, "thread-one", "Synthetic one")
  writeChatComposerDraft(ACCOUNT_A, "thread-two", "Synthetic two")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-one"), "Synthetic one")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-two"), "Synthetic two")
  writeChatComposerDraft(ACCOUNT_A, "thread-one", "")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-one"), "")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-two"), "Synthetic two")
})

test("another account drops every draft of the previous one", () => {
  resetChatComposerDrafts()
  writeChatComposerDraft(ACCOUNT_A, "thread-one", "Synthetic private")
  assert.equal(readChatComposerDraft(ACCOUNT_B, "thread-one"), "", "never shown to another account")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-one"), "", "and gone for good once another account was active")
})

test("drafts without an owner are never kept", () => {
  resetChatComposerDrafts()
  writeChatComposerDraft("", "thread-one", "Synthetic")
  writeChatComposerDraft(ACCOUNT_A, "", "Synthetic")
  assert.equal(readChatComposerDraft(ACCOUNT_A, ""), "")
  assert.equal(readChatComposerDraft("", "thread-one"), "")
})

test("clearing conversations forgets only their drafts", () => {
  resetChatComposerDrafts()
  writeChatComposerDraft(ACCOUNT_A, "thread-one", "Synthetic one")
  writeChatComposerDraft(ACCOUNT_A, "thread-two", "Synthetic two")
  clearChatComposerDrafts(["thread-one", "thread-unknown"])
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-one"), "")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-two"), "Synthetic two")
})

test("sign-out (resetChatStore) clears every draft", () => {
  resetChatComposerDrafts()
  writeChatComposerDraft(ACCOUNT_A, "thread-one", "Synthetic before sign-out")
  resetChatStore()
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-one"), "")
})

test("blocking a partner forgets the drafts of their conversations only", () => {
  resetChatStore()
  applyChatThreadListed({
    userId: ACCOUNT_A,
    threads: [partnerThread("thread-blocked", "partner-blocked"), partnerThread("thread-kept", "partner-kept")]
  })
  writeChatComposerDraft(ACCOUNT_A, "thread-blocked", "Synthetic to blocked")
  writeChatComposerDraft(ACCOUNT_A, "thread-kept", "Synthetic to kept")
  removeChatThreadsWithPartner("partner-blocked")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-blocked"), "")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-kept"), "Synthetic to kept")
})

test("typing a draft never notifies chat store subscribers, so the message list stays put", () => {
  resetChatComposerDrafts()
  let notifications = 0
  const unsubscribe = subscribeToChatStore(() => { notifications += 1 })
  try {
    writeChatComposerDraft(ACCOUNT_A, "thread-one", "Synthetic a")
    writeChatComposerDraft(ACCOUNT_A, "thread-one", "Synthetic ab")
    writeChatComposerDraft(ACCOUNT_A, "thread-one", "")
    clearChatComposerDrafts(["thread-one"])
    assert.equal(notifications, 0)
  } finally { unsubscribe() }
})
