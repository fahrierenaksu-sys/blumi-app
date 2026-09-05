import type { ChatMessage } from "@blumi/contracts"

export const CHAT_MESSAGE_EDIT_WINDOW_MS = 5 * 60 * 1_000

const MAX_MESSAGE_LENGTH = 500

export interface ChatMessageEditAuditEntry {
  messageId: string
  threadId: string
  revision: number
  editorUserId: string
  bodyBefore: string
  bodyAfter: string
  editedAt: string
}

export type ChatMessageEditFailureReason =
  | "not_owner"
  | "expired"
  | "invalid_server_time"
  | "invalid_body"
  | "unchanged"
  | "invalid_audit_history"

export type ChatMessageEditResult =
  | {
      ok: true
      message: ChatMessage
      auditHistory: readonly ChatMessageEditAuditEntry[]
    }
  | {
      ok: false
      reason: ChatMessageEditFailureReason
    }

export interface ChatMessageEditInput {
  message: ChatMessage
  actorUserId: string
  nextBody: string
  now: Date
  auditHistory: readonly ChatMessageEditAuditEntry[]
}

export function applyChatMessageTextEdit(
  input: ChatMessageEditInput
): ChatMessageEditResult {
  if (input.actorUserId !== input.message.senderUserId) {
    return { ok: false, reason: "not_owner" }
  }

  const nowMs = input.now.getTime()
  const sentAtMs = Date.parse(input.message.sentAt)
  if (!Number.isFinite(nowMs) || !Number.isFinite(sentAtMs) || nowMs < sentAtMs) {
    return { ok: false, reason: "invalid_server_time" }
  }
  if (nowMs - sentAtMs >= CHAT_MESSAGE_EDIT_WINDOW_MS) {
    return { ok: false, reason: "expired" }
  }

  if (!validateChatMessageEditHistory({
    message: input.message,
    auditHistory: input.auditHistory,
    now: input.now
  })) {
    return { ok: false, reason: "invalid_audit_history" }
  }

  const normalizedBody = normalizeMessageBody(input.nextBody)
  if (!normalizedBody) {
    return { ok: false, reason: "invalid_body" }
  }
  if (normalizedBody === input.message.body) {
    return { ok: false, reason: "unchanged" }
  }

  const editedAt = input.now.toISOString()
  const auditEntry: ChatMessageEditAuditEntry = {
    messageId: input.message.messageId,
    threadId: input.message.threadId,
    revision: input.auditHistory.length + 1,
    editorUserId: input.actorUserId,
    bodyBefore: input.message.body,
    bodyAfter: normalizedBody,
    editedAt
  }

  return {
    ok: true,
    message: {
      ...input.message,
      body: normalizedBody,
      editedAt
    },
    auditHistory: [...input.auditHistory, auditEntry]
  }
}

export function validateChatMessageEditHistory(input: {
  message: ChatMessage
  auditHistory: readonly ChatMessageEditAuditEntry[]
  now: Date
}): boolean {
  const nowMs = input.now.getTime()
  const sentAtMs = Date.parse(input.message.sentAt)
  if (!Number.isFinite(nowMs) || !Number.isFinite(sentAtMs)) return false

  if (input.auditHistory.length === 0) {
    return input.message.editedAt === undefined
  }
  if (!input.message.editedAt) return false

  let previousBodyAfter: string | undefined
  let previousEditedAtMs = sentAtMs

  for (const [index, entry] of input.auditHistory.entries()) {
    const editedAtMs = Date.parse(entry.editedAt)
    if (
      entry.messageId !== input.message.messageId ||
      entry.threadId !== input.message.threadId ||
      entry.editorUserId !== input.message.senderUserId ||
      entry.revision !== index + 1 ||
      !entry.bodyBefore ||
      !entry.bodyAfter ||
      (previousBodyAfter !== undefined && entry.bodyBefore !== previousBodyAfter) ||
      !Number.isFinite(editedAtMs) ||
      editedAtMs < previousEditedAtMs ||
      editedAtMs >= sentAtMs + CHAT_MESSAGE_EDIT_WINDOW_MS ||
      editedAtMs > nowMs
    ) {
      return false
    }
    previousBodyAfter = entry.bodyAfter
    previousEditedAtMs = editedAtMs
  }

  const latestEntry = input.auditHistory[input.auditHistory.length - 1]
  return latestEntry?.bodyAfter === input.message.body &&
    latestEntry.editedAt === input.message.editedAt
}

function normalizeMessageBody(body: string): string | null {
  const normalized = body.trim().replace(/\s+/g, " ")
  if (!normalized || normalized.length > MAX_MESSAGE_LENGTH) return null
  return normalized
}
