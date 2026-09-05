import { isAvatarLoadoutItemCompatibleWithBody } from "@blumi/domain"
import {
  findEconomyCatalogItem,
  getDefaultOwnedItemIds,
  getLegacyAvatarReplacementIds,
  STARTER_COIN_BALANCE,
  type EconomyItemType
} from "./economyCatalog"
import {
  cloneInventory,
  createInMemoryEconomyRepository,
  type EconomyInventoryRecord,
  type EconomyRewardClaim,
  type EconomyRepository
} from "./economyRepository"
import { PublicRequestError } from "../errors/publicRequestError"

export interface EconomyService {
  repository: EconomyRepository
  getInventory(userId: string, now?: Date): Promise<EconomyInventoryRecord>
  purchaseItem(
    userId: string,
    input: PurchaseItemInput,
    now?: Date
  ): Promise<PurchaseItemResult>
  claimDailyReward(userId: string, now?: Date): Promise<DailyRewardResult>
  grantEventReward(
    userId: string,
    rewardType: Exclude<EconomyRewardClaim["rewardType"], "daily_login">,
    idempotencyKey: string,
    now?: Date
  ): Promise<RewardGrantResult>
}

export type PurchaseItemInput =
  | {
      itemId: string
      type: "avatar"
      avatarBodyId: string
    }
  | {
      itemId: string
      type: "room"
    }

export interface PurchaseItemResult {
  inventory: EconomyInventoryRecord
  purchasedItemId: string
  type: EconomyItemType
  priceCoins: number
}

export interface DailyRewardResult {
  inventory: EconomyInventoryRecord
  claimed: boolean
  rewardCoins: number
  rewardDate: string
}

export interface RewardGrantResult {
  inventory: EconomyInventoryRecord
  claimed: boolean
  rewardCoins: number
}

const DAILY_REWARD_COINS = 25
const EVENT_REWARD_COINS = {
  room_complete: 25,
  mutual_match: 50
} as const

export interface CreateEconomyServiceOptions {
  repository?: EconomyRepository
}

export function createEconomyService(
  options: CreateEconomyServiceOptions = {}
): EconomyService {
  const repository = options.repository ?? createInMemoryEconomyRepository()

  return {
    repository,
    async getInventory(userId, now = new Date()) {
      const existing = await repository.getInventory(userId)
      const requiredAvatarItemIds = [
        ...getDefaultOwnedItemIds("avatar"),
        ...getLegacyAvatarReplacementIds(
          existing?.ownedAvatarItemIds ?? []
        )
      ]
      return repository.ensureInventory({
        userId,
        starterCoins: STARTER_COIN_BALANCE,
        requiredAvatarItemIds,
        requiredRoomItemIds: getDefaultOwnedItemIds("room"),
        updatedAt: now.toISOString()
      })
    },
    async purchaseItem(userId, input, now = new Date()) {
      const itemId = normalizeItemId(input.itemId)
      const item = findEconomyCatalogItem(itemId, input.type)
      if (!item) {
        throw new PublicRequestError("That shop item is not available.")
      }

      if (!Number.isFinite(item.priceCoins) || item.priceCoins < 0) {
        throw new PublicRequestError("That shop item is not available.")
      }
      if (
        input.type === "avatar" &&
        !isAvatarLoadoutItemCompatibleWithBody(
          item.itemId,
          input.avatarBodyId
        )
      ) {
        throw new PublicRequestError("That item does not fit your avatar.")
      }
      await this.getInventory(userId, now)
      const nextInventory = await repository.purchaseItem({
        userId,
        type: input.type,
        itemId: item.itemId,
        grantedItemIds: [...(item.grantedItemIds ?? [])],
        priceCoins: item.priceCoins,
        updatedAt: now.toISOString()
      })
      if (!nextInventory) {
        const currentInventory = await repository.getInventory(userId)
        throwPurchaseFailure(currentInventory, item.itemId, input.type)
      }
      return {
        inventory: cloneInventory(nextInventory),
        purchasedItemId: item.itemId,
        type: input.type,
        priceCoins: item.priceCoins
      }
    },
    async claimDailyReward(userId, now = new Date()) {
      await this.getInventory(userId, now)
      const rewardDate = now.toISOString().slice(0, 10)
      const result = await repository.claimReward({
        userId,
        rewardType: "daily_login",
        idempotencyKey: rewardDate,
        coins: DAILY_REWARD_COINS,
        createdAt: now.toISOString()
      })
      return {
        inventory: cloneInventory(result.inventory),
        claimed: result.claimed,
        rewardCoins: result.claimed ? DAILY_REWARD_COINS : 0,
        rewardDate
      }
    },
    async grantEventReward(userId, rewardType, idempotencyKey, now = new Date()) {
      const normalizedKey = idempotencyKey.trim()
      if (!normalizedKey) throw new Error("Reward event key is required.")
      if (
        rewardType === "room_complete" &&
        !isValidRoomRewardDate(normalizedKey, now)
      ) {
        throw new Error("Room reward date is invalid.")
      }
      await this.getInventory(userId, now)
      const coins = EVENT_REWARD_COINS[rewardType]
      const result = await repository.claimReward({
        userId,
        rewardType,
        idempotencyKey: normalizedKey,
        coins,
        createdAt: now.toISOString()
      })
      return {
        inventory: cloneInventory(result.inventory),
        claimed: result.claimed,
        rewardCoins: result.claimed ? coins : 0
      }
    }
  }
}

function isValidRoomRewardDate(rewardDate: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rewardDate)) return false
  const parsed = new Date(`${rewardDate}T00:00:00.000Z`)
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === rewardDate &&
    rewardDate <= now.toISOString().slice(0, 10)
  )
}

function normalizeItemId(itemId: string): string {
  const trimmed = itemId.trim()
  if (!trimmed) {
    throw new PublicRequestError("Choose a shop item first.")
  }
  return trimmed
}

function throwPurchaseFailure(
  inventory: EconomyInventoryRecord | null,
  itemId: string,
  type: EconomyItemType
): never {
  if (!inventory) throw new Error("Economy inventory is unavailable.")
  if (inventory.coinDebt > 0) {
    throw new PublicRequestError(
      "Your coin balance needs to be settled before purchases are available."
    )
  }
  const ownedItemIds = type === "avatar"
    ? inventory.ownedAvatarItemIds
    : inventory.ownedRoomItemIds
  if (ownedItemIds.includes(itemId)) {
    throw new PublicRequestError("You already own this item.")
  }
  throw new PublicRequestError("Not enough coins.")
}
