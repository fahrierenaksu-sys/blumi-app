-- Keep the existing inventory arrays as the single ownership source while
-- rejecting malformed future writes. Existing rows must pass validation.
CREATE FUNCTION blumi_valid_owned_item_ids(item_ids TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT item_ids IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(item_ids) AS owned(item_id)
        WHERE item_id IS NULL
           OR item_id = ''
           OR item_id <> btrim(item_id)
     )
$$;

REVOKE ALL ON FUNCTION blumi_valid_owned_item_ids(TEXT[])
  FROM PUBLIC, anon, authenticated;

ALTER TABLE blumi_economy_inventories
  ADD CONSTRAINT blumi_economy_inventories_user_fk
    FOREIGN KEY (user_id) REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  ADD CONSTRAINT blumi_economy_inventories_avatar_ids_check
    CHECK (blumi_valid_owned_item_ids(owned_avatar_item_ids)),
  ADD CONSTRAINT blumi_economy_inventories_room_ids_check
    CHECK (blumi_valid_owned_item_ids(owned_room_item_ids));
