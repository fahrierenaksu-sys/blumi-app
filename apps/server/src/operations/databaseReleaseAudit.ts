import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { AVATAR_LOADOUT_CATALOG, ECONOMY_CATALOG } from "@blumi/domain"

interface Queryable {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

export interface DatabaseReleaseAudit {
  migrationCount: number
  missingMigrations: number
  changedMigrations: number
  unexpectedMigrations: number
  accounts: number
  inventories: number
  testPersonas: number
  chatMessages: number
  miniRooms: number
  storeTransactions: number
  orphanInventories: number
  duplicateAvatarInventoryRows: number
  duplicateRoomInventoryRows: number
  malformedAvatarInventoryRows: number
  malformedRoomInventoryRows: number
  invalidBalanceRows: number
  unknownOwnedAvatarIds: number
  unknownOwnedRoomIds: number
  unknownEquippedAvatarIds: number
  unownedEquippedAvatarIds: number
  accountsWithoutInventory: number
  exposedTables: number
  exposedSequences: number
  exposedFunctions: number
}

export function loadExpectedMigrations(): Map<string, string> {
  const directory = resolve(__dirname, "../../db/migrations")
  return new Map(
    readdirSync(directory).filter(name => name.endsWith(".sql")).sort().map(id => [
      id,
      createHash("sha256").update(readFileSync(join(directory, id))).digest("hex")
    ])
  )
}

/** Aggregate-only inspection. The caller must use a read-only transaction. */
export async function auditDatabaseRelease(
  db: Queryable,
  expectedMigrations = loadExpectedMigrations()
): Promise<DatabaseReleaseAudit> {
  const migrationRows = (await db.query("SELECT id, checksum FROM blumi_migrations")).rows
  const applied = new Map(migrationRows.map(row => [String(row.id), String(row.checksum ?? "").trim()]))
  const avatarIds = [...new Set([
    ...ECONOMY_CATALOG.filter(item => item.type === "avatar").map(item => item.itemId),
    ...AVATAR_LOADOUT_CATALOG.map(item => item.itemId)
  ])]
  const roomIds = ECONOMY_CATALOG.filter(item => item.type === "room").map(item => item.itemId)
  const defaults = ECONOMY_CATALOG
    .filter(item => item.type === "avatar" && item.ownedByDefault)
    .map(item => item.itemId)

  const counts = (await db.query(`
    SELECT
      (SELECT count(*) FROM blumi_accounts) AS accounts,
      (SELECT count(*) FROM blumi_economy_inventories) AS inventories,
      (SELECT count(*) FROM blumi_test_personas) AS test_personas,
      (SELECT count(*) FROM blumi_chat_messages) AS chat_messages,
      (SELECT count(*) FROM blumi_mini_rooms) AS mini_rooms,
      (SELECT count(*) FROM blumi_store_transactions) AS store_transactions,
      (SELECT count(*) FROM blumi_economy_inventories i
         LEFT JOIN blumi_accounts a USING (user_id) WHERE a.user_id IS NULL) AS orphan_inventories,
      (SELECT count(*) FROM blumi_economy_inventories i WHERE
         cardinality(i.owned_avatar_item_ids) <> (
           SELECT count(DISTINCT id) FROM unnest(i.owned_avatar_item_ids) AS id
         )) AS duplicate_avatar_inventory_rows,
      (SELECT count(*) FROM blumi_economy_inventories i WHERE
         cardinality(i.owned_room_item_ids) <> (
           SELECT count(DISTINCT id) FROM unnest(i.owned_room_item_ids) AS id
         )) AS duplicate_room_inventory_rows,
      (SELECT count(*) FROM blumi_economy_inventories i WHERE EXISTS (
         SELECT 1 FROM unnest(i.owned_avatar_item_ids) AS id
          WHERE id IS NULL OR id = '' OR id <> btrim(id)
       )) AS malformed_avatar_inventory_rows,
      (SELECT count(*) FROM blumi_economy_inventories i WHERE EXISTS (
         SELECT 1 FROM unnest(i.owned_room_item_ids) AS id
          WHERE id IS NULL OR id = '' OR id <> btrim(id)
       )) AS malformed_room_inventory_rows,
      (SELECT count(*) FROM blumi_economy_inventories
        WHERE coins < 0 OR coin_debt < 0) AS invalid_balance_rows,
      (SELECT count(*) FROM blumi_accounts a LEFT JOIN blumi_economy_inventories i USING (user_id)
        WHERE i.user_id IS NULL) AS accounts_without_inventory
  `)).rows[0]

  const owned = (await db.query(`
    SELECT
      (SELECT count(*) FROM blumi_economy_inventories i,
         LATERAL unnest(i.owned_avatar_item_ids) AS id
        WHERE id IS NOT NULL AND NOT (id = ANY($1::text[]))) AS unknown_owned_avatar_ids,
      (SELECT count(*) FROM blumi_economy_inventories i,
         LATERAL unnest(i.owned_room_item_ids) AS id
        WHERE id IS NOT NULL AND NOT (id = ANY($2::text[]))) AS unknown_owned_room_ids
  `, [avatarIds, roomIds])).rows[0]

  const equipped = (await db.query(`
    WITH equipped AS (
      SELECT a.user_id, i.owned_avatar_item_ids, item_id
        FROM blumi_accounts a
        LEFT JOIN blumi_economy_inventories i USING (user_id),
        LATERAL jsonb_array_elements_text(
          jsonb_build_array(
            a.avatar_selection->>'bodyId', a.avatar_selection->>'faceId',
            a.avatar_selection->>'eyesId', a.avatar_selection->>'noseId',
            a.avatar_selection->>'mouthId', a.avatar_selection->>'hairId',
            a.avatar_selection->>'topId', a.avatar_selection->>'bottomId',
            a.avatar_selection->>'shoesId', a.avatar_selection->>'outerwearId'
          ) || CASE WHEN jsonb_typeof(a.avatar_selection->'accessoryIds') = 'array'
                   THEN a.avatar_selection->'accessoryIds' ELSE '[]'::jsonb END
        ) AS item_id
       WHERE a.avatar_selection IS NOT NULL
    )
    SELECT
      count(*) FILTER (WHERE item_id <> 'null' AND NOT (item_id = ANY($1::text[])))
        AS unknown_equipped_avatar_ids,
      count(*) FILTER (WHERE item_id <> 'null'
        AND NOT (item_id = ANY(COALESCE(owned_avatar_item_ids, '{}'::text[])))
        AND NOT (item_id = ANY($2::text[]))) AS unowned_equipped_avatar_ids
    FROM equipped
  `, [avatarIds, defaults])).rows[0]

  const grants = (await db.query(`
    SELECT
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname LIKE 'blumi\\_%' ESCAPE '\\'
          AND c.relkind IN ('r', 'p', 'v', 'm')
          AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
            OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
      ) AS exposed_tables,
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname LIKE 'blumi\\_%' ESCAPE '\\'
          AND c.relkind = 'S'
          AND (has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE')
            OR has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE'))
      ) AS exposed_sequences,
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'blumi\\_%' ESCAPE '\\'
          AND (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      ) AS exposed_functions
  `)).rows[0]

  const count = (value: unknown) => Number(value ?? 0)
  return {
    migrationCount: migrationRows.length,
    missingMigrations: [...expectedMigrations.keys()].filter(id => !applied.has(id)).length,
    changedMigrations: [...expectedMigrations].filter(([id, hash]) => applied.has(id) && applied.get(id) !== hash).length,
    unexpectedMigrations: [...applied.keys()].filter(id => !expectedMigrations.has(id)).length,
    accounts: count(counts.accounts),
    inventories: count(counts.inventories),
    testPersonas: count(counts.test_personas),
    chatMessages: count(counts.chat_messages),
    miniRooms: count(counts.mini_rooms),
    storeTransactions: count(counts.store_transactions),
    orphanInventories: count(counts.orphan_inventories),
    duplicateAvatarInventoryRows: count(counts.duplicate_avatar_inventory_rows),
    duplicateRoomInventoryRows: count(counts.duplicate_room_inventory_rows),
    malformedAvatarInventoryRows: count(counts.malformed_avatar_inventory_rows),
    malformedRoomInventoryRows: count(counts.malformed_room_inventory_rows),
    invalidBalanceRows: count(counts.invalid_balance_rows),
    unknownOwnedAvatarIds: count(owned.unknown_owned_avatar_ids),
    unknownOwnedRoomIds: count(owned.unknown_owned_room_ids),
    unknownEquippedAvatarIds: count(equipped.unknown_equipped_avatar_ids),
    unownedEquippedAvatarIds: count(equipped.unowned_equipped_avatar_ids),
    accountsWithoutInventory: count(counts.accounts_without_inventory),
    exposedTables: count(grants.exposed_tables),
    exposedSequences: count(grants.exposed_sequences),
    exposedFunctions: count(grants.exposed_functions)
  }
}
