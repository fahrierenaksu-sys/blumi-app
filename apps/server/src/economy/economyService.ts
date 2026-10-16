import {
  AVATAR_ITEM_RULES,
  isAvatarItemRetired,
  isAvatarLoadoutItemCompatibleWithBody,
  isLegacyItemId,
  isReleaseCatalogItemHeld,
  type AvatarItemRules
} from "@blumi/domain"
import { isActiveRoomItemIdIn, projectInventoryRoomItems } from "../rooms/roomItemProjection"
import {
  ECONOMY_CATALOG,
  findEconomyCatalogItem,
  getDefaultOwnedItemIds,
  getLegacyAvatarReplacementIds,
  STARTER_COIN_BALANCE,
  type EconomyCatalogItem,
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
import { createLegacyFreeWardrobeGrant, type AccountCreatedAtLookup } from "./legacyFreeWardrobeGrant"

export interface EconomyService {
  repository: EconomyRepository
  /** Room items this server sells or grants and that are not retired: placement and the inventory read use it. */
  isActiveRoomItemId?(itemId: string): boolean
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

/**
 * Server-decided reward amounts (economy v1, Workbench economy_2025/LEAD/ECONOMY_PLAN.md). The shared room is the
 * north-star action, so it pays more than opening the app. The daily login stays 25: it is auto-claimed solo
 * activity, and raising it would only grow balances faster than new pieces ship. A match pays once per pair ever.
 */
export const ECONOMY_REWARD_COINS = Object.freeze({
  daily_login: 25,
  room_complete: 40,
  mutual_match: 50
} as const)

/**
 * New-pair match rewards one account can collect in a rolling week. Deleting an account and signing up again with
 * the same phone gives a new user ID and so a new pair key (2026-10-16 exploit review H1); this cap bounds what one
 * helper phone can pay a main account until a phone-hash tombstone exists. A real player matches about once a week.
 */
export const MUTUAL_MATCH_REWARDS_PER_WEEK = 3
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const DAILY_REWARD_COINS = ECONOMY_REWARD_COINS.daily_login
const EVENT_REWARD_COINS = {
  room_complete: ECONOMY_REWARD_COINS.room_complete,
  mutual_match: ECONOMY_REWARD_COINS.mutual_match
} as const

export interface CreateEconomyServiceOptions {
  repository?: EconomyRepository
  /** Defaults to the catalog of this environment (`economyCatalog.ts`); tests and memory QA pass their own. */
  catalog?: readonly EconomyCatalogItem[]
  /** Avatar item facts (retired items, body fit). Defaults to the live catalog; tests pass the fixture rules. */
  avatarRules?: AvatarItemRules
  /**
   * When an account was created. With it, accounts created before the R1 price launch keep the pieces that used to be
   * free (`legacyFreeWardrobeGrant.ts`); without it nobody gets them free.
   */
  getAccountCreatedAt?: AccountCreatedAtLookup
  /**
   * Local Simulator QA only (`qaClothingGrant.ts`, wired by config.ts when local QA auth is on): extra avatar pieces a
   * user owns by default. Never set on a deployed or database server.
   */
  qaOwnedAvatarItemIdsFor?: (userId: string) => Promise<readonly string[]>
}

export function createEconomyService(
  options: CreateEconomyServiceOptions = {}
): EconomyService {
  const catalog = options.catalog ?? ECONOMY_CATALOG
  const avatarRules = options.avatarRules ?? AVATAR_ITEM_RULES
  const repository = options.repository ?? createInMemoryEconomyRepository()
  const isActiveRoomItemId = isActiveRoomItemIdIn(catalog)
  const project = (inventory: EconomyInventoryRecord) =>
    projectInventoryRoomItems(inventory, isActiveRoomItemId)
  const legacyFreeWardrobeFor = createLegacyFreeWardrobeGrant({
    catalog,
    getAccountCreatedAt: options.getAccountCreatedAt
  })

  return {
    repository,
    isActiveRoomItemId,
    async getInventory(userId, now = new Date()) {
      const existing = await repository.getInventory(userId)
      const ownedAvatarItemIds = existing?.ownedAvatarItemIds ?? []
      const requiredAvatarItemIds = [
        ...getDefaultOwnedItemIds("avatar", catalog),
        ...getLegacyAvatarReplacementIds(ownedAvatarItemIds),
        ...(await legacyFreeWardrobeFor(userId, ownedAvatarItemIds)),
        ...(options.qaOwnedAvatarItemIdsFor ? await options.qaOwnedAvatarItemIdsFor(userId) : [])
      ]
      // a retired default (the old free bed) is no longer granted; rows that hold it are read past
      const requiredRoomItemIds = getDefaultOwnedItemIds("room", catalog).filter(isActiveRoomItemId)
      if (
        existing &&
        requiredAvatarItemIds.every((itemId) => existing.ownedAvatarItemIds.includes(itemId)) &&
        requiredRoomItemIds.every((itemId) => existing.ownedRoomItemIds.includes(itemId))
      ) {
        return project(existing)
      }
      return project(await repository.ensureInventory({
        userId,
        starterCoins: STARTER_COIN_BALANCE,
        requiredAvatarItemIds,
        requiredRoomItemIds,
        updatedAt: now.toISOString()
      }))
    },
    async purchaseItem(userId, input, now = new Date()) {
      const itemId = normalizeItemId(input.itemId)
      // a retired id is never sold again: rows that hold it are read past (room part of the legacy registry)
      if (isLegacyItemId(itemId)) {
        throw new PublicRequestError("That shop item is not available.")
      }
      if (input.type === "avatar" && isAvatarItemRetired(avatarRules, itemId)) {
        throw new PublicRequestError("That shop item is not available.")
      }
      // a held item (pricing pending, promotion hold, QA id) is never sold, in any environment
      if (isReleaseCatalogItemHeld(itemId)) {
        throw new PublicRequestError("That shop item is not available.")
      }
      const item = findEconomyCatalogItem(itemId, input.type, catalog)
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
          input.avatarBodyId,
          avatarRules
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
        inventory: project(cloneInventory(nextInventory)),
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
        inventory: project(cloneInventory(result.inventory)),
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
        createdAt: now.toISOString(),
        ...(rewardType === "mutual_match"
          ? { windowCap: { since: new Date(now.getTime() - WEEK_MS).toISOString(), maxClaims: MUTUAL_MATCH_REWARDS_PER_WEEK } }
          : {})
      })
      return {
        inventory: project(cloneInventory(result.inventory)),
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
