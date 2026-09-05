ALTER TABLE blumi_accounts
  ADD COLUMN IF NOT EXISTS avatar_selection JSONB,
  ADD COLUMN IF NOT EXISTS avatar_revision INTEGER;

UPDATE blumi_accounts
   SET avatar_selection = jsonb_build_object(
         'schemaVersion', 1,
         'bodyId', CASE
           WHEN avatar_preset_id = 'avatar_v2_body_male_light'
             THEN 'avatar_v2_body_male_light'
           ELSE 'avatar_v2_body_default'
         END,
         'faceId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_face_male_warm_friendly' ELSE 'avatar_v2_face_default' END,
         'eyesId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_eyes_male_warm_brown' ELSE 'avatar_v2_eyes_mocha_doe' END,
         'noseId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_nose_male_gentle_bridge' ELSE 'avatar_v2_nose_soft_button' END,
         'mouthId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_mouth_male_soft_smile' ELSE 'avatar_v2_mouth_peach_whisper_smile' END,
         'hairId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_hair_male_espresso_crop' ELSE 'avatar_v2_hair_mocha_ribbon_blowout' END,
         'topId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_top_male_powder_blue_crew_tee' ELSE 'avatar_v2_top_default' END,
         'bottomId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_bottom_male_navy_straight_pants' ELSE 'avatar_v2_bottom_default' END,
         'shoesId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_shoes_male_milk_tea_court' ELSE 'avatar_v2_shoes_milk_tea_court_sneakers' END,
         'accessoryIds', '[]'::jsonb
       )
 WHERE avatar_selection IS NULL;

UPDATE blumi_accounts
   SET avatar_preset_id = avatar_selection->>'bodyId'
 WHERE avatar_preset_id IS DISTINCT FROM avatar_selection->>'bodyId';

UPDATE blumi_accounts
   SET avatar_revision = 0
 WHERE avatar_revision IS NULL;

ALTER TABLE blumi_accounts
  ALTER COLUMN avatar_selection SET DEFAULT '{
    "schemaVersion": 1,
    "bodyId": "avatar_v2_body_default",
    "faceId": "avatar_v2_face_default",
    "eyesId": "avatar_v2_eyes_mocha_doe",
    "noseId": "avatar_v2_nose_soft_button",
    "mouthId": "avatar_v2_mouth_peach_whisper_smile",
    "hairId": "avatar_v2_hair_mocha_ribbon_blowout",
    "topId": "avatar_v2_top_default",
    "bottomId": "avatar_v2_bottom_default",
    "shoesId": "avatar_v2_shoes_milk_tea_court_sneakers",
    "accessoryIds": []
  }'::jsonb,
  ALTER COLUMN avatar_selection SET NOT NULL,
  ALTER COLUMN avatar_revision SET DEFAULT 0,
  ALTER COLUMN avatar_revision SET NOT NULL;

ALTER TABLE blumi_accounts
  DROP CONSTRAINT IF EXISTS blumi_accounts_avatar_selection_shape_check,
  ADD CONSTRAINT blumi_accounts_avatar_selection_shape_check CHECK (
    jsonb_typeof(avatar_selection) = 'object'
    AND avatar_selection ?& ARRAY[
      'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
      'hairId', 'topId', 'bottomId', 'shoesId', 'accessoryIds'
    ]
    AND jsonb_typeof(avatar_selection->'accessoryIds') = 'array'
    AND avatar_revision >= 0
  );

ALTER TABLE blumi_room_presence
  ADD COLUMN IF NOT EXISTS avatar_selection JSONB,
  ADD COLUMN IF NOT EXISTS avatar_revision INTEGER;

UPDATE blumi_room_presence
   SET avatar_selection = jsonb_build_object(
         'schemaVersion', 1,
         'bodyId', CASE
           WHEN avatar_preset_id = 'avatar_v2_body_male_light'
             THEN 'avatar_v2_body_male_light'
           ELSE 'avatar_v2_body_default'
         END,
         'faceId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_face_male_warm_friendly' ELSE 'avatar_v2_face_default' END,
         'eyesId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_eyes_male_warm_brown' ELSE 'avatar_v2_eyes_mocha_doe' END,
         'noseId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_nose_male_gentle_bridge' ELSE 'avatar_v2_nose_soft_button' END,
         'mouthId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_mouth_male_soft_smile' ELSE 'avatar_v2_mouth_peach_whisper_smile' END,
         'hairId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_hair_male_espresso_crop' ELSE 'avatar_v2_hair_mocha_ribbon_blowout' END,
         'topId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_top_male_powder_blue_crew_tee' ELSE 'avatar_v2_top_default' END,
         'bottomId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_bottom_male_navy_straight_pants' ELSE 'avatar_v2_bottom_default' END,
         'shoesId', CASE WHEN avatar_preset_id = 'avatar_v2_body_male_light' THEN 'avatar_v2_shoes_male_milk_tea_court' ELSE 'avatar_v2_shoes_milk_tea_court_sneakers' END,
         'accessoryIds', '[]'::jsonb
       )
 WHERE avatar_selection IS NULL;

UPDATE blumi_room_presence
   SET avatar_preset_id = avatar_selection->>'bodyId'
 WHERE avatar_preset_id IS DISTINCT FROM avatar_selection->>'bodyId';

UPDATE blumi_room_presence
   SET avatar_revision = 0
 WHERE avatar_revision IS NULL;

ALTER TABLE blumi_room_presence
  ALTER COLUMN avatar_selection SET DEFAULT '{
    "schemaVersion": 1,
    "bodyId": "avatar_v2_body_default",
    "faceId": "avatar_v2_face_default",
    "eyesId": "avatar_v2_eyes_mocha_doe",
    "noseId": "avatar_v2_nose_soft_button",
    "mouthId": "avatar_v2_mouth_peach_whisper_smile",
    "hairId": "avatar_v2_hair_mocha_ribbon_blowout",
    "topId": "avatar_v2_top_default",
    "bottomId": "avatar_v2_bottom_default",
    "shoesId": "avatar_v2_shoes_milk_tea_court_sneakers",
    "accessoryIds": []
  }'::jsonb,
  ALTER COLUMN avatar_selection SET NOT NULL,
  ALTER COLUMN avatar_revision SET DEFAULT 0,
  ALTER COLUMN avatar_revision SET NOT NULL;

ALTER TABLE blumi_room_presence
  DROP CONSTRAINT IF EXISTS blumi_room_presence_avatar_selection_shape_check,
  ADD CONSTRAINT blumi_room_presence_avatar_selection_shape_check CHECK (
    jsonb_typeof(avatar_selection) = 'object'
    AND avatar_selection ?& ARRAY[
      'schemaVersion', 'bodyId', 'faceId', 'eyesId', 'noseId', 'mouthId',
      'hairId', 'topId', 'bottomId', 'shoesId', 'accessoryIds'
    ]
    AND jsonb_typeof(avatar_selection->'accessoryIds') = 'array'
    AND avatar_revision >= 0
  );
