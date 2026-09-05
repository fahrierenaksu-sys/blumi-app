import { PublicRequestError } from "../errors/publicRequestError"

export interface ChatThreadPageOptions { cursor?: string; limit?: number }
export interface ChatThreadCursor { userId: string; createdAt: string; threadId: string }

export function normalizeThreadPage(userId: string, input: ChatThreadPageOptions = {}): { limit: number; cursor?: ChatThreadCursor } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PublicRequestError("Invalid chat page request.")
  const limit = input.limit ?? 50
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new PublicRequestError("Choose a chat page size between 1 and 100.")
  if (input.cursor === undefined) return { limit }
  try {
    if (!/^[A-Za-z0-9_-]{1,1024}$/.test(input.cursor)) throw new Error("Invalid cursor")
    const cursor = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"))
    if (cursor.v !== 1 || cursor.userId !== userId || typeof cursor.threadId !== "string" || !cursor.threadId || cursor.threadId.length > 128 ||
        typeof cursor.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(cursor.createdAt) || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error("Invalid cursor")
    return { limit, cursor: { userId, createdAt: cursor.createdAt, threadId: cursor.threadId } }
  } catch { throw new PublicRequestError("That chat page is invalid. Refresh your chats.") }
}

export function encodeThreadCursor(cursor: ChatThreadCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, ...cursor })).toString("base64url")
}
