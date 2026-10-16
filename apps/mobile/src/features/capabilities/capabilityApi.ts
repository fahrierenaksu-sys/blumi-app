import {
  CAPABILITY_KEYS,
  type CapabilityKey,
  type CapabilityMap,
  type CapabilityResolution
} from "@blumi/contracts"
import { requestJson } from "../network/apiClient"

export const SUPPORTED_MOBILE_CAPABILITIES = [
  "avatar_loadout_v2_read",
  "avatar_loadout_v2_write",
  "shop_multi_item_apply",
  "discovery_public_profile",
  "discovery_badges",
  "discovery_room_showcase",
  // Delivery ticks, "görüldü" and the read receipts setting (2026-10-01).
  "chat_read_receipts",
  // "yazıyor…" in chat and over the partner in the room (2026-10-01).
  "chat_typing",
  // This build draws the 2.5D avatar; the server counts builds that do not declare it (2026-10-10).
  "avatar_world_25d",
  // Sokağım, the Chats tab street (2026-10-17); off until the server stages it.
  "chat_street"
] as const satisfies readonly CapabilityKey[]

/**
 * Keys added after the server that may still be live: an older server refuses to parse a declaration that names
 * them (400) and leaves them out of its map. The build retries once without them and reads a missing one as off,
 * so it keeps every other capability on an older server. Every other key stays required (fail closed).
 */
export const LATE_DECLARED_CAPABILITIES: readonly CapabilityKey[] = Object.freeze(["avatar_world_25d", "chat_street"])

const HTTP_BAD_REQUEST = 400

export interface SessionScopedCapabilities {
  sessionToken: string | null
  capabilities: CapabilityMap
}

export function createFailClosedCapabilityResolution(): CapabilityResolution {
  const capabilities = Object.fromEntries(
    CAPABILITY_KEYS.map((key) => [key, false])
  ) as Record<CapabilityKey, boolean>
  return Object.freeze({
    legacy: true,
    capabilities: Object.freeze(capabilities) as CapabilityMap
  })
}

// One frozen fail-closed map: every render without resolved capabilities sees
// the same object, so memoised consumers (main-tab pages) do not re-render.
const FAIL_CLOSED_CAPABILITIES = createFailClosedCapabilityResolution().capabilities

export function getSessionScopedCapabilities(
  sessionToken: string | null,
  resolved: SessionScopedCapabilities
): CapabilityMap {
  if (!sessionToken || resolved.sessionToken !== sessionToken) {
    return FAIL_CLOSED_CAPABILITIES
  }
  return resolved.capabilities
}

/** Share only overlapping reads for the same session; a later read rechecks the server. */
export function createCapabilityResolutionSingleFlight(
  resolve: (sessionToken: string) => Promise<CapabilityResolution>
): (sessionToken: string) => Promise<CapabilityResolution> {
  const active = new Map<string, Promise<CapabilityResolution>>()
  return (sessionToken) => {
    const existing = active.get(sessionToken)
    if (existing) return existing
    const promise = Promise.resolve().then(() => resolve(sessionToken))
    active.set(sessionToken, promise)
    const clear = () => {
      if (active.get(sessionToken) === promise) active.delete(sessionToken)
    }
    void promise.then(clear, clear)
    return promise
  }
}

export async function resolveProductionCapabilities(
  baseHttpUrl: string,
  sessionToken: string,
  declaredCapabilities: readonly CapabilityKey[],
  fetcher: typeof fetch = fetch
): Promise<CapabilityResolution> {
  try {
    const first = await requestCapabilities(baseHttpUrl, sessionToken, declaredCapabilities, fetcher)
    const earlyDeclared = declaredCapabilities.filter((key) => !LATE_DECLARED_CAPABILITIES.includes(key))
    const result = first.response.status === HTTP_BAD_REQUEST && earlyDeclared.length < declaredCapabilities.length
      ? await requestCapabilities(baseHttpUrl, sessionToken, earlyDeclared, fetcher)
      : first
    if (!result.response.ok) return createFailClosedCapabilityResolution()
    return normalizeCapabilityResolution(result.payload) ??
      createFailClosedCapabilityResolution()
  } catch {
    return createFailClosedCapabilityResolution()
  }
}

function requestCapabilities(
  baseHttpUrl: string,
  sessionToken: string,
  declaredCapabilities: readonly CapabilityKey[],
  fetcher: typeof fetch
) {
  // A stalled request times out and fails closed like any other failure.
  return requestJson(
    baseHttpUrl,
    "/v1/capabilities/resolve",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        declaredCapabilities: [...declaredCapabilities]
      })
    },
    fetcher
  )
}

function normalizeCapabilityResolution(
  value: unknown
): CapabilityResolution | null {
  if (!isRecord(value) || typeof value.legacy !== "boolean") return null
  const capabilities = value.capabilities
  if (!isRecord(capabilities)) return null
  const isKnownKey = (key: string) => (CAPABILITY_KEYS as readonly string[]).includes(key)
  if (
    Object.keys(capabilities).some((key) => !isKnownKey(key)) ||
    CAPABILITY_KEYS.some((key) => {
      if (!Object.hasOwn(capabilities, key)) return !LATE_DECLARED_CAPABILITIES.includes(key)
      return typeof capabilities[key] !== "boolean"
    })
  ) {
    return null
  }
  const normalized = Object.fromEntries(
    CAPABILITY_KEYS.map((key) => [key, capabilities[key] === true])
  ) as Record<CapabilityKey, boolean>
  return Object.freeze({
    legacy: value.legacy,
    capabilities: Object.freeze(normalized) as CapabilityMap
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
