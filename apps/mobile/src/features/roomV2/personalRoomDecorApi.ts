import {
  createAuthenticatedHeaders,
  requestJson
} from "../network/apiClient"
import type { UserRoomDecor } from "./roomV2.types"
import { readStoredRoomV2Decor } from "./roomV2Persistence"

export interface PersonalRoomDecorSnapshot {
  userId: string
  revision: number
  decor: UserRoomDecor
  updatedAt: string
}

export type SavePersonalRoomDecorResult =
  | { kind: "saved"; snapshot: PersonalRoomDecorSnapshot }
  | { kind: "conflict"; current: PersonalRoomDecorSnapshot }

export async function fetchPersonalRoomDecor(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<PersonalRoomDecorSnapshot | null> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    "/v1/users/me/room-decor",
    {
      method: "GET",
      headers: createAuthenticatedHeaders(sessionToken),
      signal
    },
    fetcher
  )
  if (!response.ok) {
    throw new Error(readApiError(payload, "We could not open your saved room."))
  }
  if (!isRecord(payload) || !("roomDecor" in payload)) {
    throw new Error("Blumi could not resolve your room layout safely.")
  }
  if (payload.roomDecor === null) return null
  const snapshot = normalizeSnapshot(payload.roomDecor)
  if (!snapshot) {
    throw new Error("Blumi could not resolve your room layout safely.")
  }
  return snapshot
}

export async function savePersonalRoomDecor(
  baseHttpUrl: string,
  sessionToken: string,
  input: { expectedRevision: number; decor: UserRoomDecor },
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SavePersonalRoomDecorResult> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    "/v1/users/me/room-decor",
    {
      method: "PUT",
      headers: createAuthenticatedHeaders(sessionToken, { json: true }),
      body: JSON.stringify(input),
      signal
    },
    fetcher
  )
  if (response.status === 409) {
    const current = normalizeSnapshot(
      isRecord(payload) ? payload.current : null
    )
    if (!current) {
      throw new Error("Blumi could not resolve your room layout safely.")
    }
    return { kind: "conflict", current }
  }
  if (!response.ok) {
    throw new Error(readApiError(payload, "We could not save your room yet."))
  }
  const snapshot = normalizeSnapshot(
    isRecord(payload) ? payload.roomDecor : null
  )
  if (!snapshot) {
    throw new Error("Blumi could not confirm your saved room.")
  }
  return { kind: "saved", snapshot }
}

export async function savePersonalRoomDecorReplacingCurrent(
  baseHttpUrl: string,
  sessionToken: string,
  decor: UserRoomDecor,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SavePersonalRoomDecorResult> {
  const current = await fetchPersonalRoomDecor(
    baseHttpUrl,
    sessionToken,
    fetcher,
    signal
  )
  const first = await savePersonalRoomDecor(
    baseHttpUrl,
    sessionToken,
    { expectedRevision: current?.revision ?? 0, decor },
    fetcher,
    signal
  )
  if (first.kind === "saved") return first
  return savePersonalRoomDecor(
    baseHttpUrl,
    sessionToken,
    { expectedRevision: first.current.revision, decor },
    fetcher,
    signal
  )
}

function normalizeSnapshot(value: unknown): PersonalRoomDecorSnapshot | null {
  if (!isRecord(value)) return null
  const stored = readStoredRoomV2Decor(
    JSON.stringify(value.decor ?? null)
  )
  if (
    typeof value.userId !== "string" ||
    !value.userId.trim() ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    stored.status !== "ready"
  ) {
    return null
  }
  return {
    userId: value.userId,
    revision: Number(value.revision),
    decor: stored.decor,
    updatedAt: new Date(value.updatedAt).toISOString()
  }
}

function readApiError(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
