UPDATE blumi_accounts
   SET avatar_selection = jsonb_build_object(
         'schemaVersion', 1,
         'bodyId', 'avatar_v2_body_male_light',
         'faceId', 'avatar_v2_face_male_warm_friendly',
         'eyesId', 'avatar_v2_eyes_male_warm_brown',
         'noseId', 'avatar_v2_nose_male_gentle_bridge',
         'mouthId', 'avatar_v2_mouth_male_soft_smile',
         'hairId', 'avatar_v2_hair_male_espresso_crop',
         'topId', CASE
           WHEN avatar_selection->>'topId' IN (
             'avatar_v2_top_male_cream_basic_tee',
             'avatar_v2_top_male_powder_blue_crew_tee'
           ) THEN avatar_selection->>'topId'
           ELSE 'avatar_v2_top_male_powder_blue_crew_tee'
         END,
         'bottomId', CASE
           WHEN avatar_selection->>'bottomId' IN (
             'avatar_v2_bottom_male_sage_cuffed_shorts',
             'avatar_v2_bottom_male_navy_straight_pants'
           ) THEN avatar_selection->>'bottomId'
           ELSE 'avatar_v2_bottom_male_navy_straight_pants'
         END,
         'shoesId', 'avatar_v2_shoes_male_milk_tea_court',
         'accessoryIds', '[]'::jsonb
       ),
       avatar_revision = avatar_revision + 1,
       updated_at = NOW()
 WHERE avatar_selection->>'bodyId' = 'avatar_v2_body_male_light'
   AND avatar_selection IS DISTINCT FROM jsonb_build_object(
         'schemaVersion', 1,
         'bodyId', 'avatar_v2_body_male_light',
         'faceId', 'avatar_v2_face_male_warm_friendly',
         'eyesId', 'avatar_v2_eyes_male_warm_brown',
         'noseId', 'avatar_v2_nose_male_gentle_bridge',
         'mouthId', 'avatar_v2_mouth_male_soft_smile',
         'hairId', 'avatar_v2_hair_male_espresso_crop',
         'topId', CASE
           WHEN avatar_selection->>'topId' IN (
             'avatar_v2_top_male_cream_basic_tee',
             'avatar_v2_top_male_powder_blue_crew_tee'
           ) THEN avatar_selection->>'topId'
           ELSE 'avatar_v2_top_male_powder_blue_crew_tee'
         END,
         'bottomId', CASE
           WHEN avatar_selection->>'bottomId' IN (
             'avatar_v2_bottom_male_sage_cuffed_shorts',
             'avatar_v2_bottom_male_navy_straight_pants'
           ) THEN avatar_selection->>'bottomId'
           ELSE 'avatar_v2_bottom_male_navy_straight_pants'
         END,
         'shoesId', 'avatar_v2_shoes_male_milk_tea_court',
         'accessoryIds', '[]'::jsonb
       );

UPDATE blumi_room_presence
   SET avatar_selection = jsonb_build_object(
         'schemaVersion', 1,
         'bodyId', 'avatar_v2_body_male_light',
         'faceId', 'avatar_v2_face_male_warm_friendly',
         'eyesId', 'avatar_v2_eyes_male_warm_brown',
         'noseId', 'avatar_v2_nose_male_gentle_bridge',
         'mouthId', 'avatar_v2_mouth_male_soft_smile',
         'hairId', 'avatar_v2_hair_male_espresso_crop',
         'topId', CASE
           WHEN avatar_selection->>'topId' IN (
             'avatar_v2_top_male_cream_basic_tee',
             'avatar_v2_top_male_powder_blue_crew_tee'
           ) THEN avatar_selection->>'topId'
           ELSE 'avatar_v2_top_male_powder_blue_crew_tee'
         END,
         'bottomId', CASE
           WHEN avatar_selection->>'bottomId' IN (
             'avatar_v2_bottom_male_sage_cuffed_shorts',
             'avatar_v2_bottom_male_navy_straight_pants'
           ) THEN avatar_selection->>'bottomId'
           ELSE 'avatar_v2_bottom_male_navy_straight_pants'
         END,
         'shoesId', 'avatar_v2_shoes_male_milk_tea_court',
         'accessoryIds', '[]'::jsonb
       ),
       avatar_revision = avatar_revision + 1,
       updated_at = NOW()
 WHERE avatar_selection->>'bodyId' = 'avatar_v2_body_male_light'
   AND avatar_selection IS DISTINCT FROM jsonb_build_object(
         'schemaVersion', 1,
         'bodyId', 'avatar_v2_body_male_light',
         'faceId', 'avatar_v2_face_male_warm_friendly',
         'eyesId', 'avatar_v2_eyes_male_warm_brown',
         'noseId', 'avatar_v2_nose_male_gentle_bridge',
         'mouthId', 'avatar_v2_mouth_male_soft_smile',
         'hairId', 'avatar_v2_hair_male_espresso_crop',
         'topId', CASE
           WHEN avatar_selection->>'topId' IN (
             'avatar_v2_top_male_cream_basic_tee',
             'avatar_v2_top_male_powder_blue_crew_tee'
           ) THEN avatar_selection->>'topId'
           ELSE 'avatar_v2_top_male_powder_blue_crew_tee'
         END,
         'bottomId', CASE
           WHEN avatar_selection->>'bottomId' IN (
             'avatar_v2_bottom_male_sage_cuffed_shorts',
             'avatar_v2_bottom_male_navy_straight_pants'
           ) THEN avatar_selection->>'bottomId'
           ELSE 'avatar_v2_bottom_male_navy_straight_pants'
         END,
         'shoesId', 'avatar_v2_shoes_male_milk_tea_court',
         'accessoryIds', '[]'::jsonb
       );
