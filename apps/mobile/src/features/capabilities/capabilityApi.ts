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
  "discovery_room_showcase"
] as const satisfies readonly CapabilityKey[]

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

export function getSessionScopedCapabilities(
  sessionToken: string | null,
  resolved: SessionScopedCapabilities
): CapabilityMap {
  if (!sessionToken || resolved.sessionToken !== sessionToken) {
    return createFailClosedCapabilityResolution().capabilities
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
    // A stalled request times out and fails closed like any other failure.
    const { response, payload } = await requestJson(
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
    if (!response.ok) return createFailClosedCapabilityResolution()
    return normalizeCapabilityResolution(payload) ??
      createFailClosedCapabilityResolution()
  } catch {
    return createFailClosedCapabilityResolution()
  }
}

function normalizeCapabilityResolution(
  value: unknown
): CapabilityResolution | null {
  if (!isRecord(value) || typeof value.legacy !== "boolean") return null
  const capabilities = value.capabilities
  if (!isRecord(capabilities)) return null
  const keys = Object.keys(capabilities)
  if (
    keys.length !== CAPABILITY_KEYS.length ||
    CAPABILITY_KEYS.some(
      (key) => !Object.hasOwn(capabilities, key) ||
        typeof capabilities[key] !== "boolean"
    )
  ) {
    return null
  }
  const normalized = Object.fromEntries(
    CAPABILITY_KEYS.map((key) => [key, capabilities[key] as boolean])
  ) as Record<CapabilityKey, boolean>
  return Object.freeze({
    legacy: value.legacy,
    capabilities: Object.freeze(normalized) as CapabilityMap
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
