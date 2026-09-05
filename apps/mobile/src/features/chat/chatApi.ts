import type {
  ChatMessage,
  ChatMessageList,
  ChatThread,
  ChatThreadList
} from "@blumi/contracts"
import {
  chatMessageEnvelopeSchema,
  chatMessageListSchema,
  chatThreadEnvelopeSchema,
  chatThreadListSchema,
  chatThreadReadSchema
} from "./chatSchemas"
import {
  createAuthenticatedHeaders,
  requestJson
} from "../network/apiClient"

export interface FetchThreadMessagesOptions {
  before?: string
  limit?: number
}

export interface CreateThreadInput {
  participantUserIds: string[]
}

export interface SendThreadMessageOptions {
  clientMessageId?: string
}

export interface MarkThreadReadOptions {
  expectedUserId?: string
}

export async function fetchChatThreads(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatThreadList> {
  const threads = new Map<string, ChatThread>()
  const seenCursors = new Set<string>()
  let cursor: string | undefined
  let userId: string | undefined
  do {
    const { response, payload } = await requestJson(
      baseHttpUrl,
      `/v1/threads${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      { headers: createAuthenticatedHeaders(sessionToken), signal },
      fetcher
    )
    if (!response.ok) {
      throw new Error(getApiErrorMessage(payload, "We could not refresh your chats yet."))
    }

    const page = normalizeThreadListPayload(payload)
    if (userId && userId !== page.userId) throw new Error("Chat ownership changed. Refresh your chats.")
    userId = page.userId
    for (const thread of page.threads) threads.set(thread.threadId, thread)
    cursor = page.nextCursor ?? undefined
    if (cursor) {
      if (seenCursors.has(cursor)) throw new Error("Chat pagination did not advance.")
      seenCursors.add(cursor)
    }
  } while (cursor)
  return { userId: userId!, threads: [...threads.values()], nextCursor: null }
}

export async function fetchThreadMessages(
  baseHttpUrl: string,
  sessionToken: string,
  threadId: string,
  optionsOrFetcher: FetchThreadMessagesOptions | typeof fetch = {},
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatMessageList> {
  const options =
    typeof optionsOrFetcher === "function" ? {} : optionsOrFetcher
  const requestFetcher =
    typeof optionsOrFetcher === "function" ? optionsOrFetcher : fetcher
  const query = createMessagesQuery(options)
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/threads/${encodeURIComponent(threadId)}/messages${query}`,
    {
      headers: createAuthenticatedHeaders(sessionToken),
      signal
    },
    requestFetcher
  )

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not open that conversation yet."))
  }

  return normalizeMessageListPayload(payload)
}

export async function createThread(
  baseHttpUrl: string,
  sessionToken: string,
  input: CreateThreadInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatThread> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    "/v1/threads",
    {
      method: "POST",
      headers: createAuthenticatedHeaders(sessionToken, { json: true }),
      body: JSON.stringify(input),
      signal
    },
    fetcher
  )

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not open that chat yet."))
  }

  return normalizeThreadPayload(payload)
}

export async function sendThreadMessage(
  baseHttpUrl: string,
  sessionToken: string,
  threadId: string,
  body: string,
  options: SendThreadMessageOptions = {},
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ChatMessage> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    {
      method: "POST",
      headers: createAuthenticatedHeaders(sessionToken, { json: true }),
      body: JSON.stringify({
        body,
        ...(options.clientMessageId ? { clientMessageId: options.clientMessageId } : {})
      }),
      signal
    },
    fetcher
  )

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "That message could not be sent."))
  }

  return normalizeMessagePayload(payload)
}

export async function markThreadRead(
  baseHttpUrl: string,
  sessionToken: string,
  threadId: string,
  optionsOrFetcher: MarkThreadReadOptions | typeof fetch = {},
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  const options =
    typeof optionsOrFetcher === "function" ? {} : optionsOrFetcher
  const requestFetcher =
    typeof optionsOrFetcher === "function" ? optionsOrFetcher : fetcher
  const { response, payload } = await requestJson(
    baseHttpUrl,
    `/v1/threads/${encodeURIComponent(threadId)}/read`,
    {
      method: "POST",
      headers: createAuthenticatedHeaders(sessionToken),
      signal
    },
    requestFetcher
  )
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not mark that chat read yet."))
  }
  if (response.status === 204 && payload === null) return
  const parsed = chatThreadReadSchema.safeParse(payload)
  if (
    !parsed.success ||
    parsed.data.threadId !== threadId ||
    (options.expectedUserId !== undefined &&
      parsed.data.userId !== options.expectedUserId)
  ) {
    throw new Error("Blumi could not confirm that chat was read.")
  }
}

export function normalizeThreadListPayload(payload: unknown): ChatThreadList {
  const parsed = chatThreadListSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error("Blumi could not read your chats.")
  }
  return {
    userId: parsed.data.userId,
    ...(parsed.data.nextCursor !== undefined ? { nextCursor: parsed.data.nextCursor } : {}),
    ...(parsed.data.append !== undefined ? { append: parsed.data.append } : {}),
    threads: parsed.data.threads.map((thread) =>
      cloneThreadRecord(thread as unknown as ChatThread)
    )
  }
}

export function normalizeMessageListPayload(payload: unknown): ChatMessageList {
  const parsed = chatMessageListSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error("Blumi could not read that conversation.")
  }
  return {
    userId: parsed.data.userId,
    threadId: parsed.data.threadId,
    messages: parsed.data.messages.map((message) =>
      cloneMessageRecord(message as unknown as ChatMessage)
    )
  }
}

function normalizeMessagePayload(payload: unknown): ChatMessage {
  const parsed = chatMessageEnvelopeSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error("Blumi could not read one message.")
  }
  return cloneMessageRecord(parsed.data.message as unknown as ChatMessage)
}

function normalizeThreadPayload(payload: unknown): ChatThread {
  const parsed = chatThreadEnvelopeSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error("Blumi could not read one chat.")
  }
  return cloneThreadRecord(parsed.data.thread as unknown as ChatThread)
}

function cloneMessageRecord(message: ChatMessage): ChatMessage {
  return { ...message }
}

function cloneThreadRecord(thread: ChatThread): ChatThread {
  return (
    {
      ...thread,
      participantUserIds: [...thread.participantUserIds] as [string, string],
      participants: [
        cloneParticipant(thread.participants[0]),
        cloneParticipant(thread.participants[1])
      ],
      lastMessage: thread.lastMessage
        ? cloneMessageRecord(thread.lastMessage)
        : undefined
    }
  )
}

function cloneParticipant(
  participant: ChatThread["participants"][number]
): ChatThread["participants"][number] {
  return {
    ...participant,
    ...(participant.avatar
      ? {
          avatar: {
            ...participant.avatar,
            loadout: {
              ...participant.avatar.loadout,
              accessoryIds: [...participant.avatar.loadout.accessoryIds]
            }
          }
        }
      : {})
  }
}

function createMessagesQuery(options: FetchThreadMessagesOptions): string {
  const params = new URLSearchParams()
  if (options.before) params.set("before", options.before)
  if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(Math.floor(options.limit)))
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).error === "string"
  )
    ? ((payload as Record<string, unknown>).error as string)
    : fallback
}
