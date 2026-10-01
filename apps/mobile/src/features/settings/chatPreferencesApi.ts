import type { ChatPreferences } from "@blumi/contracts"
import { chatPreferencesEnvelopeSchema } from "@blumi/contracts"
import { createAuthenticatedHeaders, requestJson } from "../network/apiClient"

export interface ChatPreferencesState {
  preferences: ChatPreferences
  /** False until read receipts are rolled out to the account (and the schema exists). */
  available: boolean
}

const UNAVAILABLE: ChatPreferencesState = Object.freeze({
  preferences: Object.freeze({ readReceiptsEnabled: false }),
  available: false
})

/**
 * `GET /v1/chat-preferences` (2026-10-01). A server that predates the route
 * answers 404: the setting is simply unavailable, never an error the person
 * must act on.
 */
export async function fetchChatPreferences(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch
): Promise<ChatPreferencesState> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    "/v1/chat-preferences",
    { headers: createAuthenticatedHeaders(sessionToken) },
    fetcher
  )
  if (response.status === 404) return UNAVAILABLE
  if (!response.ok) throw new Error("Chat preferences could not load.")
  const parsed = chatPreferencesEnvelopeSchema.safeParse(payload)
  if (!parsed.success) throw new Error("Chat preferences could not load.")
  const available = (payload as { available?: unknown }).available === true
  return { preferences: { readReceiptsEnabled: parsed.data.preferences.readReceiptsEnabled }, available }
}

export async function saveChatPreferences(
  baseHttpUrl: string,
  sessionToken: string,
  preferences: ChatPreferences,
  fetcher: typeof fetch = fetch
): Promise<ChatPreferences> {
  const { response, payload } = await requestJson(
    baseHttpUrl,
    "/v1/chat-preferences",
    {
      method: "PUT",
      headers: createAuthenticatedHeaders(sessionToken, { json: true }),
      body: JSON.stringify({ readReceiptsEnabled: preferences.readReceiptsEnabled })
    },
    fetcher
  )
  const parsed = chatPreferencesEnvelopeSchema.safeParse(payload)
  if (!response.ok || !parsed.success) throw new Error("Chat preferences were not saved.")
  return { readReceiptsEnabled: parsed.data.preferences.readReceiptsEnabled }
}
