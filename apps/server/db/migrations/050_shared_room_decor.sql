-- NULL means a pre-upgrade room; never fabricate a historical inviter snapshot.
ALTER TABLE blumi_mini_rooms ADD COLUMN shared_decor JSONB;
