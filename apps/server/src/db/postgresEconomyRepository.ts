import type { QueryResultRow } from "pg"
import type {
  EconomyCoinTransactionInput,
  EconomyInventoryRecord,
  EconomyRepository
} from "../economy/economyRepository"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

export function createPostgresEconomyRepository(
  pool: QueryExecutor
): EconomyRepository {
  return {
    async getInventory(userId) {
      const result = await pool.query(
        `SELECT user_id, coins, coin_debt, owned_avatar_item_ids, owned_room_item_ids, updated_at
           FROM blumi_economy_inventories
          WHERE user_id = $1`,
        [userId]
      )
      return result.rows[0] ? mapInventory(result.rows[0]) : null
    },

    async ensureInventory(input) {
      const result = await pool.query(
        `INSERT INTO blumi_economy_inventories (
            user_id, coins, owned_avatar_item_ids, owned_room_item_ids, updated_at
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id) DO UPDATE SET
            owned_avatar_item_ids =
              blumi_economy_inventories.owned_avatar_item_ids || ARRAY(
                SELECT DISTINCT required_id
                  FROM unnest($3::text[]) AS required(required_id)
                 WHERE NOT (
                   required_id = ANY(
                     blumi_economy_inventories.owned_avatar_item_ids
                   )
                 )
              ),
            owned_room_item_ids =
              blumi_economy_inventories.owned_room_item_ids || ARRAY(
                SELECT DISTINCT required_id
                  FROM unnest($4::text[]) AS required(required_id)
                 WHERE NOT (
                   required_id = ANY(
                     blumi_economy_inventories.owned_room_item_ids
                   )
                 )
              ),
            updated_at = CASE
              WHEN NOT (
                $3::text[] <@ blumi_economy_inventories.owned_avatar_item_ids
              ) OR NOT (
                $4::text[] <@ blumi_economy_inventories.owned_room_item_ids
              ) THEN EXCLUDED.updated_at
              ELSE blumi_economy_inventories.updated_at
            END
          RETURNING user_id, coins, coin_debt, owned_avatar_item_ids,
                    owned_room_item_ids, updated_at`,
        [
          input.userId,
          input.starterCoins,
          input.requiredAvatarItemIds,
          input.requiredRoomItemIds,
          new Date(input.updatedAt)
        ]
      )
      const row = result.rows[0]
      if (!row) throw new Error("Economy inventory is unavailable.")
      return mapInventory(row)
    },

    async purchaseItem(input) {
      const ownershipColumn = input.type === "avatar"
        ? "owned_avatar_item_ids"
        : "owned_room_item_ids"
      const grantedItemIds = uniqueItemIds([
        input.itemId,
        ...input.grantedItemIds
      ])
      const result = await pool.query(
        `UPDATE blumi_economy_inventories
            SET coins = coins - $3,
                ${ownershipColumn} = ${ownershipColumn} || ARRAY(
                  SELECT granted_id
                    FROM unnest($4::text[]) AS granted(granted_id)
                   WHERE NOT (granted_id = ANY(${ownershipColumn}))
                ),
                updated_at = $5
          WHERE user_id = $1
            AND coins >= $3
            AND coin_debt = 0
            AND $3 >= 0
            AND NOT ($2 = ANY(${ownershipColumn}))
          RETURNING user_id, coins, coin_debt, owned_avatar_item_ids,
                    owned_room_item_ids, updated_at`,
        [
          input.userId,
          input.itemId,
          input.priceCoins,
          grantedItemIds,
          new Date(input.updatedAt)
        ]
      )
      return result.rows[0] ? mapInventory(result.rows[0]) : null
    },

    async saveInventory(inventory) {
      await pool.query(
        `INSERT INTO blumi_economy_inventories (
            user_id, coins, coin_debt, owned_avatar_item_ids, owned_room_item_ids, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (user_id) DO UPDATE SET
            coins = EXCLUDED.coins,
            coin_debt = EXCLUDED.coin_debt,
            owned_avatar_item_ids = EXCLUDED.owned_avatar_item_ids,
            owned_room_item_ids = EXCLUDED.owned_room_item_ids,
            updated_at = EXCLUDED.updated_at`,
        [
          inventory.userId,
          inventory.coins,
          inventory.coinDebt,
          inventory.ownedAvatarItemIds,
          inventory.ownedRoomItemIds,
          new Date(inventory.updatedAt)
        ]
      )
    },

    async claimReward(input) {
      const result = await pool.query(
        `WITH inserted_reward AS (
           INSERT INTO blumi_economy_reward_ledger (
             user_id, reward_type, idempotency_key, coins, created_at
           ) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, reward_type, idempotency_key) DO NOTHING
           RETURNING 1
         ), updated_inventory AS (
           UPDATE blumi_economy_inventories
              SET coins = coins + $4, updated_at = $5
            WHERE user_id = $1 AND EXISTS (SELECT 1 FROM inserted_reward)
           RETURNING user_id, coins, coin_debt, owned_avatar_item_ids,
                     owned_room_item_ids, updated_at
         )
         SELECT TRUE AS claimed, * FROM updated_inventory
         UNION ALL
         SELECT FALSE AS claimed, user_id, coins, coin_debt, owned_avatar_item_ids,
                owned_room_item_ids, updated_at
           FROM blumi_economy_inventories
          WHERE user_id = $1 AND NOT EXISTS (SELECT 1 FROM inserted_reward)
         LIMIT 1`,
        [
          input.userId,
          input.rewardType,
          input.idempotencyKey,
          input.coins,
          new Date(input.createdAt)
        ]
      )
      const row = result.rows[0]
      if (!row) throw new Error("Economy inventory is unavailable.")
      return {
        claimed: row.claimed === true,
        inventory: mapInventory(row)
      }
    },

    async applyCoinTransaction(input) {
      return applyCoinTransaction(pool, input)
    }
  }
}

function mapInventory(row: QueryResultRow): EconomyInventoryRecord {
  return {
    userId: String(row.user_id),
    coins: Number(row.coins),
    coinDebt: Number(row.coin_debt ?? 0),
    ownedAvatarItemIds: normalizeTextArray(row.owned_avatar_item_ids),
    ownedRoomItemIds: normalizeTextArray(row.owned_room_item_ids),
    updatedAt: new Date(row.updated_at).toISOString()
  }
}

async function applyCoinTransaction(
  pool: QueryExecutor,
  input: EconomyCoinTransactionInput
) {
  const result = await pool.query(
    `WITH accepted_transaction AS (
       INSERT INTO blumi_store_transactions (
         provider, provider_transaction_id, user_id, product_id, store,
         payload_hash, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (provider, provider_transaction_id) DO UPDATE SET
         updated_at = GREATEST(blumi_store_transactions.updated_at, EXCLUDED.updated_at)
       WHERE blumi_store_transactions.user_id = EXCLUDED.user_id
         AND blumi_store_transactions.product_id = EXCLUDED.product_id
         AND blumi_store_transactions.store = EXCLUDED.store
       RETURNING 1
     ), inserted_event AS (
       INSERT INTO blumi_store_events (
         provider, provider_event_id, provider_transaction_id, event_type,
         payload_hash, occurred_at, received_at
       )
       SELECT $1, $9, $2, $10, $6, $7, $8
        WHERE EXISTS (SELECT 1 FROM accepted_transaction)
       ON CONFLICT (provider, provider_event_id) DO NOTHING
       RETURNING 1
     ), inserted_ledger AS (
       INSERT INTO blumi_economy_iap_ledger (
         provider, provider_transaction_id, entry_type, user_id, product_id,
         coins, provider_event_id, created_at
       )
       SELECT $1, $2, $10, $3, $4, $11, $9, $8
        WHERE EXISTS (SELECT 1 FROM inserted_event)
       ON CONFLICT (provider, provider_transaction_id, entry_type) DO NOTHING
       RETURNING 1
     ), updated_inventory AS (
       UPDATE blumi_economy_inventories
          SET coins = CASE
                WHEN $10 = 'credit' THEN coins + GREATEST($11 - coin_debt, 0)
                ELSE GREATEST(coins - $11, 0)
              END,
              coin_debt = CASE
                WHEN $10 = 'credit' THEN GREATEST(coin_debt - $11, 0)
                ELSE coin_debt + GREATEST($11 - coins, 0)
              END,
              updated_at = $8
        WHERE user_id = $3
          AND $11 > 0
          AND EXISTS (SELECT 1 FROM inserted_ledger)
       RETURNING user_id, coins, coin_debt, owned_avatar_item_ids,
                 owned_room_item_ids, updated_at
     )
     SELECT TRUE AS applied, NULL::text AS conflict, * FROM updated_inventory
     UNION ALL
     SELECT FALSE AS applied,
            CASE
              WHEN EXISTS (
                SELECT 1
                  FROM blumi_store_transactions
                 WHERE provider = $1
                   AND provider_transaction_id = $2
                   AND user_id <> $3
              ) THEN 'account'
              WHEN EXISTS (
                SELECT 1
                  FROM blumi_store_transactions
                 WHERE provider = $1
                   AND provider_transaction_id = $2
                   AND (product_id <> $4 OR store <> $5)
              ) THEN 'transaction'
              ELSE NULL
            END AS conflict,
            user_id, coins, coin_debt, owned_avatar_item_ids,
            owned_room_item_ids, updated_at
       FROM blumi_economy_inventories
      WHERE user_id = $3
        AND NOT EXISTS (SELECT 1 FROM updated_inventory)
     LIMIT 1`,
    [
      input.provider,
      input.transactionId,
      input.userId,
      input.productId,
      input.store,
      input.payloadHash,
      new Date(input.occurredAt),
      new Date(input.updatedAt),
      input.eventId,
      input.kind,
      input.coins
    ]
  )
  const row = result.rows[0]
  if (!row) throw new Error("Economy inventory is unavailable.")
  return {
    applied: row.applied === true,
    conflict:
      row.conflict === "account" || row.conflict === "transaction"
        ? row.conflict
        : null,
    inventory: mapInventory(row)
  }
}

function normalizeTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String)
  }
  return []
}

function uniqueItemIds(itemIds: string[]): string[] {
  return itemIds.reduce<string[]>(
    (uniqueIds, itemId) => uniqueIds.includes(itemId)
      ? uniqueIds
      : [...uniqueIds, itemId],
    []
  )
}
