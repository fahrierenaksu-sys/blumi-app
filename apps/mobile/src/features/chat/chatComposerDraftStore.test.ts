import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread } from "@blumi/contracts"
import { applyChatThreadListed, removeChatThreadsWithPartner, resetChatStore, setActiveThread, subscribeToChatStore } from "./chatStore"
import {
  CHAT_COMPOSER_DRAFT_LIMIT,
  CHAT_COMPOSER_MAX_LENGTH,
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

test("an unmatch (the conversation leaves a complete list) forgets its draft", () => {
  resetChatStore()
  applyChatThreadListed({
    userId: ACCOUNT_A,
    threads: [partnerThread("thread-unmatched", "partner-gone"), partnerThread("thread-kept", "partner-kept")]
  })
  writeChatComposerDraft(ACCOUNT_A, "thread-unmatched", "Synthetic to unmatched")
  writeChatComposerDraft(ACCOUNT_A, "thread-kept", "Synthetic to kept")
  applyChatThreadListed({ userId: ACCOUNT_A, threads: [partnerThread("thread-kept", "partner-kept")], nextCursor: null })
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-unmatched"), "")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-kept"), "Synthetic to kept")
})

test("a first page with more to come keeps drafts of conversations beyond it", () => {
  resetChatStore()
  writeChatComposerDraft(ACCOUNT_A, "thread-page-two", "Synthetic on page two")
  applyChatThreadListed({ userId: ACCOUNT_A, threads: [partnerThread("thread-kept", "partner-kept")], nextCursor: "cursor-test" })
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-page-two"), "Synthetic on page two")
})

test("the open conversation keeps its draft even when a list predates it", () => {
  resetChatStore()
  setActiveThread("thread-just-created")
  writeChatComposerDraft(ACCOUNT_A, "thread-just-created", "Synthetic new")
  writeChatComposerDraft(ACCOUNT_A, "thread-removed", "Synthetic removed")
  applyChatThreadListed({ userId: ACCOUNT_A, threads: [] })
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-just-created"), "Synthetic new")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-removed"), "")
  setActiveThread(null)
})

test("the draft book is bounded: the least recently written draft goes first", () => {
  resetChatComposerDrafts()
  for (let index = 0; index <= CHAT_COMPOSER_DRAFT_LIMIT; index += 1) {
    writeChatComposerDraft(ACCOUNT_A, `thread-${index}`, `Synthetic ${index}`)
    if (index === 1) writeChatComposerDraft(ACCOUNT_A, "thread-0", "Synthetic 0 again")
  }
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-1"), "", "oldest write evicted")
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-0"), "Synthetic 0 again", "a rewrite counts as recent")
  assert.equal(readChatComposerDraft(ACCOUNT_A, `thread-${CHAT_COMPOSER_DRAFT_LIMIT}`), `Synthetic ${CHAT_COMPOSER_DRAFT_LIMIT}`)
})

test("a draft is never longer than the composer accepts", () => {
  resetChatComposerDrafts()
  writeChatComposerDraft(ACCOUNT_A, "thread-one", "x".repeat(CHAT_COMPOSER_MAX_LENGTH + 50))
  assert.equal(readChatComposerDraft(ACCOUNT_A, "thread-one").length, CHAT_COMPOSER_MAX_LENGTH)
})

test("pruning drafts on a list reply never re-renders an open message list", () => {
  resetChatStore()
  setActiveThread("thread-open")
  writeChatComposerDraft(ACCOUNT_A, "thread-open", "Synthetic open")
  let notifications = 0
  const unsubscribe = subscribeToChatStore(() => { notifications += 1 })
  try {
    writeChatComposerDraft(ACCOUNT_A, "thread-open", "Synthetic open more")
    writeChatComposerDraft(ACCOUNT_A, "thread-other", "Synthetic other")
    assert.equal(notifications, 0, "draft writes do not notify the chat store")
  } finally { unsubscribe(); setActiveThread(null) }
})
