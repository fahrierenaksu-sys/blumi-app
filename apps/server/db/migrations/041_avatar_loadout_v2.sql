-- Forward-only mixed-version bridge. Existing V1 rows and defaults remain
-- untouched; V2 is admitted only as an exact shape. Old binaries continue to
-- read/write V1 while new binaries can persist V2 after capability resolution.

ALTER TABLE blumi_accounts
  DROP CONSTRAINT IF EXISTS blumi_accounts_avatar_selection_shape_check,
  ADD CONSTRAINT blumi_accounts_avatar_selection_shape_check CHECK (
    jsonb_typeof(avatar_selection) = 'object'
    AND avatar_revision >= 0
    AND jsonb_typeof(avatar_selection->'accessoryIds') = 'array'
    AND (
      (
        avatar_selection->'schemaVersion' = '1'::jsonb
        AND avatar_selection ?& ARRAY[
          'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
          'hairId', 'topId', 'bottomId', 'shoesId', 'accessoryIds'
        ]
        AND avatar_selection - ARRAY[
          'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
          'hairId', 'topId', 'bottomId', 'shoesId', 'accessoryIds'
        ] = '{}'::jsonb
      )
      OR
      (
        avatar_selection->'schemaVersion' = '2'::jsonb
        AND avatar_selection ?& ARRAY[
          'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
          'hairId', 'topId', 'bottomId', 'shoesId', 'dressId', 'outerwearId',
          'accessoryIds'
        ]
        AND avatar_selection - ARRAY[
          'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
          'hairId', 'topId', 'bottomId', 'shoesId', 'dressId', 'outerwearId',
          'accessoryIds'
        ] = '{}'::jsonb
        AND jsonb_typeof(avatar_selection->'dressId') IN ('string', 'null')
        AND jsonb_typeof(avatar_selection->'outerwearId') IN ('string', 'null')
      )
    )
    AND jsonb_typeof(avatar_selection->'bodyId') = 'string'
    AND jsonb_typeof(avatar_selection->'faceId') = 'string'
    AND jsonb_typeof(avatar_selection->'eyesId') = 'string'
    AND jsonb_typeof(avatar_selection->'noseId') = 'string'
    AND jsonb_typeof(avatar_selection->'mouthId') = 'string'
    AND jsonb_typeof(avatar_selection->'hairId') = 'string'
    AND jsonb_typeof(avatar_selection->'topId') = 'string'
    AND jsonb_typeof(avatar_selection->'bottomId') = 'string'
    AND jsonb_typeof(avatar_selection->'shoesId') = 'string'
  );

ALTER TABLE blumi_room_presence
  DROP CONSTRAINT IF EXISTS blumi_room_presence_avatar_selection_shape_check,
  ADD CONSTRAINT blumi_room_presence_avatar_selection_shape_check CHECK (
    jsonb_typeof(avatar_selection) = 'object'
    AND avatar_revision >= 0
    AND jsonb_typeof(avatar_selection->'accessoryIds') = 'array'
    AND (
      (
        avatar_selection->'schemaVersion' = '1'::jsonb
        AND avatar_selection ?& ARRAY[
          'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
          'hairId', 'topId', 'bottomId', 'shoesId', 'accessoryIds'
        ]
        AND avatar_selection - ARRAY[
          'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
          'hairId', 'topId', 'bottomId', 'shoesId', 'accessoryIds'
        ] = '{}'::jsonb
      )
      OR
      (
        avatar_selection->'schemaVersion' = '2'::jsonb
        AND avatar_selection ?& ARRAY[
          'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
          'hairId', 'topId', 'bottomId', 'shoesId', 'dressId', 'outerwearId',
          'accessoryIds'
        ]
        AND avatar_selection - ARRAY[
          'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
          'hairId', 'topId', 'bottomId', 'shoesId', 'dressId', 'outerwearId',
          'accessoryIds'
        ] = '{}'::jsonb
        AND jsonb_typeof(avatar_selection->'dressId') IN ('string', 'null')
        AND jsonb_typeof(avatar_selection->'outerwearId') IN ('string', 'null')
      )
    )
    AND jsonb_typeof(avatar_selection->'bodyId') = 'string'
    AND jsonb_typeof(avatar_selection->'faceId') = 'string'
    AND jsonb_typeof(avatar_selection->'eyesId') = 'string'
    AND jsonb_typeof(avatar_selection->'noseId') = 'string'
    AND jsonb_typeof(avatar_selection->'mouthId') = 'string'
    AND jsonb_typeof(avatar_selection->'hairId') = 'string'
    AND jsonb_typeof(avatar_selection->'topId') = 'string'
    AND jsonb_typeof(avatar_selection->'bottomId') = 'string'
    AND jsonb_typeof(avatar_selection->'shoesId') = 'string'
  );

-- Restore policy: restore the pre-migration database snapshot if rollback is
-- required. Do not narrow this constraint while V2 rows may exist.
