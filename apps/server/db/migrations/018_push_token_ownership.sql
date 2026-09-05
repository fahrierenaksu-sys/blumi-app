WITH ranked_devices AS (
  SELECT ctid,
         ROW_NUMBER() OVER (
           PARTITION BY push_token
           ORDER BY registered_at DESC, user_id DESC
         ) AS ownership_rank
    FROM blumi_push_devices
)
DELETE FROM blumi_push_devices
 WHERE ctid IN (
   SELECT ctid
     FROM ranked_devices
    WHERE ownership_rank > 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS blumi_push_devices_token_uidx
  ON blumi_push_devices(push_token);
