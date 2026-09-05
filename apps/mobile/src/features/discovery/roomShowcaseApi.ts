import {
  createAuthenticatedHeaders,
  requestJson
} from "../network/apiClient"
import { SUPPORTED_MOBILE_CAPABILITIES } from "../capabilities/capabilityApi"

export interface RoomShowcaseVisibility {
  isPublic: boolean
  headline: string | null
  roomRevision: number
}

export async function updateRoomShowcaseVisibility(
  baseHttpUrl: string,
  sessionToken: string,
  input: { isPublic: boolean; headline?: string | null },
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<RoomShowcaseVisibility> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    "/v1/users/me/room-showcase",
    {
      method: "PUT",
      headers: {
        ...createAuthenticatedHeaders(sessionToken, { json: true }),
        "x-blumi-client-capabilities": SUPPORTED_MOBILE_CAPABILITIES.join(",")
      },
      body: JSON.stringify(input),
      signal
    },
    fetcher
  )
  if (!response.ok) {
    throw new Error(readApiError(payload, "Oda vitrini güncellenemedi."))
  }
  const showcase = isRecord(payload) ? payload.roomShowcase : undefined
  if (!isRecord(showcase)) {
    throw new Error("Blumi oda vitrini durumunu doğrulayamadı.")
  }
  const revision = showcase.roomRevision
  if (
    typeof showcase.isPublic !== "boolean" ||
    (showcase.headline !== null && typeof showcase.headline !== "string") ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    throw new Error("Blumi oda vitrini durumunu doğrulayamadı.")
  }
  return {
    isPublic: showcase.isPublic,
    headline: showcase.headline as string | null,
    roomRevision: revision
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
