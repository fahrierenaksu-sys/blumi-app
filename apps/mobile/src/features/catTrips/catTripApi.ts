import { createAuthenticatedHeaders, requestJson } from "../network/apiClient"
import {
  parseCatGuests,
  parseCatPrefs,
  parseCatRevealAck,
  parseCatState,
  type CatGuests,
  type CatPrefs,
  type CatPrefsState,
  type CatState
} from "./catTripModel"

/**
 * The traveling cat's routes. A server that predates them answers 404, read
 * as "off". Any other failure throws so the caller can keep the room quiet.
 */
async function getJson<T>(
  baseHttpUrl: string, sessionToken: string, path: string,
  parse: (payload: unknown) => T | null, fetcher: typeof fetch
): Promise<T | { enabled: false }> {
  const { response, payload } = await requestJson(baseHttpUrl, path, { headers: createAuthenticatedHeaders(sessionToken) }, fetcher)
  if (response.status === 404) return { enabled: false }
  const parsed = response.ok ? parse(payload) : null
  if (!parsed) throw new Error("Cat state could not load.")
  return parsed
}

export function fetchCatState(baseHttpUrl: string, sessionToken: string, fetcher: typeof fetch = fetch): Promise<CatState> {
  return getJson(baseHttpUrl, sessionToken, "/v1/cat/state", parseCatState, fetcher)
}

export function fetchCatGuests(baseHttpUrl: string, sessionToken: string, fetcher: typeof fetch = fetch): Promise<CatGuests> {
  return getJson(baseHttpUrl, sessionToken, "/v1/cat/guests", parseCatGuests, fetcher)
}

export function fetchCatPrefs(baseHttpUrl: string, sessionToken: string, fetcher: typeof fetch = fetch): Promise<CatPrefsState> {
  return getJson(baseHttpUrl, sessionToken, "/v1/cat/prefs", parseCatPrefs, fetcher)
}

/** Null when the server refuses (feature off, table missing): the switch stays as it was. */
export async function saveCatPrefs(
  baseHttpUrl: string, sessionToken: string, patch: Partial<CatPrefs>, fetcher: typeof fetch = fetch
): Promise<CatPrefs | null> {
  const { response, payload } = await requestJson(baseHttpUrl, "/v1/cat/prefs", {
    method: "PUT",
    headers: createAuthenticatedHeaders(sessionToken, { json: true }),
    body: JSON.stringify(patch)
  }, fetcher)
  if (response.status === 409) return null
  const parsed = response.ok ? parseCatPrefs(payload) : null
  if (!parsed?.enabled) throw new Error("Cat setting was not saved.")
  return parsed.prefs
}

/** Opens the mystery. Null when the trip is gone (block, unmatch) or not finished. */
export async function acknowledgeCatReveal(
  baseHttpUrl: string, sessionToken: string, tripId: string, fetcher: typeof fetch = fetch
): Promise<{ counterpartUserId: string } | null> {
  const { response, payload } = await requestJson(baseHttpUrl, `/v1/cat/trips/${encodeURIComponent(tripId)}/reveal-ack`, {
    method: "POST",
    headers: createAuthenticatedHeaders(sessionToken)
  }, fetcher)
  if (response.status === 404 || response.status === 409) return null
  if (!response.ok) throw new Error("Cat reveal failed.")
  return parseCatRevealAck(payload)
}
