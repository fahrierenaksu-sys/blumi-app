import type { BlumiInventorySnapshot } from "./inventoryStore"

export type EconomyPurchaseType = "avatar" | "room"

export interface EconomyPurchaseInput {
  itemId: string
  type: EconomyPurchaseType
}

export interface DailyEconomyRewardResult {
  inventory: BlumiInventorySnapshot
  claimed: boolean
  rewardCoins: number
  rewardDate: string
}

interface EconomyInventoryRecord {
  coins: number
  ownedAvatarItemIds: string[]
  ownedRoomItemIds: string[]
  unlockedFeatureIds?: string[]
  updatedAt: string
}

interface EconomyInventoryPayload {
  inventory?: EconomyInventoryRecord
}

function withBaseUrl(baseHttpUrl: string, path: string): string {
  const trimmed = baseHttpUrl.endsWith("/") ? baseHttpUrl.slice(0, -1) : baseHttpUrl
  return `${trimmed}${path}`
}

export async function fetchEconomyInventory(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<BlumiInventorySnapshot> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/economy/balance"), {
    headers: createAuthHeaders(sessionToken),
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not refresh your coins yet."))
  }

  return normalizeEconomyInventoryPayload(payload)
}

export async function claimDailyEconomyReward(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DailyEconomyRewardResult> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, "/v1/economy/rewards/daily"),
    {
      method: "POST",
      headers: createAuthHeaders(sessionToken),
      signal
    }
  )
  const payload: unknown = await response.json()
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not claim today's reward yet."))
  }
  const record = payload as Partial<DailyEconomyRewardResult> | null
  if (
    !record ||
    typeof record.claimed !== "boolean" ||
    typeof record.rewardCoins !== "number" ||
    typeof record.rewardDate !== "string"
  ) {
    throw new Error("Blumi could not read today's reward.")
  }
  return {
    inventory: normalizeEconomyInventoryPayload(payload),
    claimed: record.claimed,
    rewardCoins: Math.max(0, Math.floor(record.rewardCoins)),
    rewardDate: record.rewardDate
  }
}

export async function purchaseEconomyItem(
  baseHttpUrl: string,
  sessionToken: string,
  input: EconomyPurchaseInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<BlumiInventorySnapshot> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/economy/purchase"), {
    method: "POST",
    headers: {
      ...createAuthHeaders(sessionToken),
      "content-type": "application/json"
    },
    body: JSON.stringify(input),
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "That purchase could not be completed."))
  }

  return normalizeEconomyInventoryPayload(payload)
}

export function normalizeEconomyInventoryPayload(
  payload: unknown
): BlumiInventorySnapshot {
  const candidate = (payload as EconomyInventoryPayload | null)?.inventory
  if (!isInventoryRecord(candidate)) {
    throw new Error("Blumi could not read your shop inventory.")
  }

  return {
    coins: Math.max(0, Math.floor(candidate.coins)),
    ownedAvatarItemIds: [...candidate.ownedAvatarItemIds],
    ownedRoomItemIds: [...candidate.ownedRoomItemIds],
    unlockedFeatureIds: [...(candidate.unlockedFeatureIds ?? [])],
    updatedAt: candidate.updatedAt
  }
}

function createAuthHeaders(sessionToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${sessionToken}`
  }
}

function isInventoryRecord(value: unknown): value is EconomyInventoryRecord {
  if (!value || typeof value !== "object") return false
  const record = value as Partial<EconomyInventoryRecord>
  return (
    typeof record.coins === "number" &&
    Array.isArray(record.ownedAvatarItemIds) &&
    record.ownedAvatarItemIds.every((itemId) => typeof itemId === "string") &&
    Array.isArray(record.ownedRoomItemIds) &&
    record.ownedRoomItemIds.every((itemId) => typeof itemId === "string") &&
    (record.unlockedFeatureIds === undefined ||
      (
        Array.isArray(record.unlockedFeatureIds) &&
        record.unlockedFeatureIds.every((featureId) => typeof featureId === "string")
      )) &&
    typeof record.updatedAt === "string"
  )
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
