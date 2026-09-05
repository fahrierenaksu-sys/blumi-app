import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import {
  applyChatMessageTextEdit,
  CHAT_MESSAGE_EDIT_WINDOW_MS,
  validateChatMessageEditHistory,
  type ChatMessageEditAuditEntry
} from "./chatMessageEditPolicy"

const MESSAGE: ChatMessage = {
  messageId: "message-1",
  threadId: "thread-1",
  senderUserId: "user-1",
  body: "Original text",
  sentAt: "2026-08-13T09:00:00.000Z",
  deliveredAt: "2026-08-13T09:00:01.000Z",
  readAt: "2026-08-13T09:00:02.000Z"
}

test("owner can edit within five minutes and immutable metadata is preserved", () => {
  const now = new Date("2026-08-13T09:04:59.999Z")
  const result = applyChatMessageTextEdit({
    message: MESSAGE,
    actorUserId: "user-1",
    nextBody: "  Updated   text  ",
    now,
    auditHistory: []
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.message, {
    ...MESSAGE,
    body: "Updated text",
    editedAt: now.toISOString()
  })
  assert.deepEqual(result.auditHistory, [{
    messageId: "message-1",
    threadId: "thread-1",
    revision: 1,
    editorUserId: "user-1",
    bodyBefore: "Original text",
    bodyAfter: "Updated text",
    editedAt: now.toISOString()
  }])
  assert.notStrictEqual(result.message, MESSAGE)
  assert.deepEqual(MESSAGE, {
    messageId: "message-1",
    threadId: "thread-1",
    senderUserId: "user-1",
    body: "Original text",
    sentAt: "2026-08-13T09:00:00.000Z",
    deliveredAt: "2026-08-13T09:00:01.000Z",
    readAt: "2026-08-13T09:00:02.000Z"
  })
})

test("edit rejects non-owner, exact-window expiry, invalid server time, and invalid text", () => {
  const cases = [
    {
      actorUserId: "user-2",
      nextBody: "Changed",
      now: new Date("2026-08-13T09:01:00.000Z"),
      reason: "not_owner"
    },
    {
      actorUserId: "user-1",
      nextBody: "Changed",
      now: new Date(MESSAGE.sentAt).getTime() + CHAT_MESSAGE_EDIT_WINDOW_MS,
      reason: "expired"
    },
    {
      actorUserId: "user-1",
      nextBody: "Changed",
      now: new Date("2026-08-13T08:59:59.999Z"),
      reason: "invalid_server_time"
    },
    {
      actorUserId: "user-1",
      nextBody: "   ",
      now: new Date("2026-08-13T09:01:00.000Z"),
      reason: "invalid_body"
    },
    {
      actorUserId: "user-1",
      nextBody: "x".repeat(501),
      now: new Date("2026-08-13T09:01:00.000Z"),
      reason: "invalid_body"
    },
    {
      actorUserId: "user-1",
      nextBody: "Original text",
      now: new Date("2026-08-13T09:01:00.000Z"),
      reason: "unchanged"
    }
  ] as const

  for (const item of cases) {
    const result = applyChatMessageTextEdit({
      message: MESSAGE,
      actorUserId: item.actorUserId,
      nextBody: item.nextBody,
      now: item.now instanceof Date ? item.now : new Date(item.now),
      auditHistory: []
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, item.reason)
  }
})

test("subsequent edits append a contiguous audit history without rewriting old entries", () => {
  const first = applyChatMessageTextEdit({
    message: MESSAGE,
    actorUserId: "user-1",
    nextBody: "Second text",
    now: new Date("2026-08-13T09:01:00.000Z"),
    auditHistory: []
  })
  assert.equal(first.ok, true)
  if (!first.ok) return

  const second = applyChatMessageTextEdit({
    message: first.message,
    actorUserId: "user-1",
    nextBody: "Third text",
    now: new Date("2026-08-13T09:02:00.000Z"),
    auditHistory: first.auditHistory
  })
  assert.equal(second.ok, true)
  if (!second.ok) return
  assert.equal(second.auditHistory.length, 2)
  assert.equal(second.auditHistory[0], first.auditHistory[0])
  assert.deepEqual(second.auditHistory[1], {
    messageId: "message-1",
    threadId: "thread-1",
    revision: 2,
    editorUserId: "user-1",
    bodyBefore: "Second text",
    bodyAfter: "Third text",
    editedAt: "2026-08-13T09:02:00.000Z"
  })
})

test("tampered, discontinuous, mismatched, or future audit histories fail closed", () => {
  const validEntry: ChatMessageEditAuditEntry = {
    messageId: "message-1",
    threadId: "thread-1",
    revision: 1,
    editorUserId: "user-1",
    bodyBefore: "Original text",
    bodyAfter: "Second text",
    editedAt: "2026-08-13T09:01:00.000Z"
  }
  const editedMessage: ChatMessage = {
    ...MESSAGE,
    body: "Second text",
    editedAt: validEntry.editedAt
  }
  const invalidHistories: ChatMessageEditAuditEntry[][] = [
    [{ ...validEntry, messageId: "message-2" }],
    [{ ...validEntry, threadId: "thread-2" }],
    [{ ...validEntry, revision: 2 }],
    [{ ...validEntry, editorUserId: "user-2" }],
    [
      validEntry,
      {
        ...validEntry,
        revision: 2,
        bodyBefore: "Tampered",
        editedAt: "2026-08-13T09:01:30.000Z"
      }
    ],
    [{ ...validEntry, bodyAfter: "Different" }],
    [{ ...validEntry, editedAt: "2026-08-13T09:06:00.000Z" }]
  ]

  for (const auditHistory of invalidHistories) {
    assert.equal(validateChatMessageEditHistory({
      message: editedMessage,
      auditHistory,
      now: new Date("2026-08-13T09:02:00.000Z")
    }), false)
    const result = applyChatMessageTextEdit({
      message: editedMessage,
      actorUserId: "user-1",
      nextBody: "Third text",
      now: new Date("2026-08-13T09:02:00.000Z"),
      auditHistory
    })
    assert.deepEqual(result, { ok: false, reason: "invalid_audit_history" })
  }
})

test("an edited message without audit history and a legacy message with audit history fail closed", () => {
  assert.equal(validateChatMessageEditHistory({
    message: { ...MESSAGE, editedAt: "2026-08-13T09:01:00.000Z" },
    auditHistory: [],
    now: new Date("2026-08-13T09:02:00.000Z")
  }), false)
  assert.equal(validateChatMessageEditHistory({
    message: MESSAGE,
    auditHistory: [{
      messageId: "message-1",
      threadId: "thread-1",
      revision: 1,
      editorUserId: "user-1",
      bodyBefore: "Original text",
      bodyAfter: "Second text",
      editedAt: "2026-08-13T09:01:00.000Z"
    }],
    now: new Date("2026-08-13T09:02:00.000Z")
  }), false)
})
