import { streetResponseSchema, type StreetResponse } from "@blumi/contracts"
import { SUPPORTED_MOBILE_CAPABILITIES } from "../capabilities/capabilityApi"
import { createAuthenticatedHeaders, requestJson, type ApiFetcher } from "../network/apiClient"

/** 404 means the street is off for this session (flag, build or migration): render nothing. */
export type StreetFetchResult = { kind: "off" } | { kind: "ready"; street: StreetResponse }

const HTTP_NOT_FOUND = 404

function streetHeaders(sessionToken: string, json = false): Record<string, string> {
  return {
    ...createAuthenticatedHeaders(sessionToken, { json }),
    "x-blumi-client-capabilities": SUPPORTED_MOBILE_CAPABILITIES.join(",")
  }
}

export async function fetchStreet(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher?: ApiFetcher,
  signal?: AbortSignal
): Promise<StreetFetchResult> {
  const { response, payload } = await requestJson(baseHttpUrl, "/v1/street", {
    method: "GET",
    headers: streetHeaders(sessionToken),
    signal
  }, fetcher)
  if (response.status === HTTP_NOT_FOUND) return { kind: "off" }
  if (!response.ok) throw new Error("Sokağın şu an açılamadı.")
  const parsed = streetResponseSchema.safeParse(payload)
  if (!parsed.success) throw new Error("Blumi sokağı doğrulayamadı.")
  return { kind: "ready", street: parsed.data }
}

export async function saveStreetWindowClosed(
  baseHttpUrl: string,
  sessionToken: string,
  closed: boolean,
  fetcher?: ApiFetcher
): Promise<boolean> {
  const { response, payload } = await requestJson(baseHttpUrl, "/v1/street/visibility", {
    method: "PUT",
    headers: streetHeaders(sessionToken, true),
    body: JSON.stringify({ closed })
  }, fetcher)
  if (!response.ok) throw new Error("Pencere ayarı kaydedilemedi.")
  const value = (payload as { closed?: unknown } | null)?.closed
  if (typeof value !== "boolean") throw new Error("Blumi pencere ayarını doğrulayamadı.")
  return value
}
