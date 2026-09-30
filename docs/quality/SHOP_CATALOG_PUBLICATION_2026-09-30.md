# Shop catalog publication — 2026-09-30

Decision record for the R1 release catalog
(`packages/domain/src/release/blumiR1ReleaseCatalog.json`). Every
`publishedItems` receipt points at this file and its SHA-256, so this file
must never contain the catalog's own hash.

## Owner decision

On 2026-09-30 the owner explicitly approved the paid women's, men's and home
(room furniture) items for production sale, and lifted the
`male-wardrobe-redesign` hold.

- Receipt ID: `owner-approval-2026-09-30`
- Reviewer: owner
- Source commit: `685d3ed3b5e508347b38a3cb95ea9156ef16924a` (the commit that
  already contains every bound runtime asset)

## What a receipt binds

For each published item the receipt lists every runtime file the mobile app
resolves for that item ID, with its SHA-256:

- avatar items: the AvatarV2 catalog layer, the Shop thumbnail and preview
  image, and every Room/MiniRoom avatar layer (idle, walking and sitting
  frames) reached through `DEFAULT_AVATAR_ROOM_PROJECTION_MAP`, including the
  layers of items the purchase grants (dress bottoms);
- room items: the Room V2 furniture catalog sprites and the Shop thumbnail.

`apps/mobile/src/features/shop/shopReleaseCatalog.test.ts` re-resolves these
sets from the live resolvers and fails when a receipt drifts, when a bound
file changes, or when a paid catalog item is neither published, retired nor
held.

## Not published

The ECONOMY_CATALOG holds 115 items that are not owned by default. 89 are
published. The other 26 cannot be sold by the current build, so publishing
them would create a receipt for a product nobody can buy:

- 25 items are in `RETIRED_AVATAR_ITEM_IDS`
  (`packages/domain/src/avatar/retiredAvatarItems.ts`). The server refuses to
  sell them and the mobile catalog hides them from Shop and Wardrobe.
  Selling one again requires re-authored art and removing it from that list.
- 1 item, `avatar_v2_top_cherry_heart_milkmaid_blouse`, has its Room layer
  quarantined in `femaleWardrobePromotionContract.json` and is hidden from
  Shop and Wardrobe. It stays under the `female-wardrobe-promotion-hold` held
  scope until the Room layer is re-authored.

## Published: women's items (51)

- `avatar_v2_hair_honey_halfup_waves`
- `avatar_v2_hair_cherry_ribbon_twin_braids`
- `avatar_v2_hair_rosewood_butterfly_layers`
- `avatar_v2_hair_caramel_braided_crown`
- `avatar_v2_hair_berry_velvet_soft_updo`
- `avatar_v2_hair_chestnut_butterfly_bob`
- `avatar_v2_hair_golden_waves`
- `avatar_v2_hair_ink_pageboy_star`
- `avatar_v2_hair_ink_twin_braids`
- `avatar_v2_hair_pale_golden_bow_bob`
- `avatar_v2_hair_copper_bow_waves`
- `avatar_v2_shoes_cherry_satin_ballets`
- `avatar_v2_shoes_onyx_heart_mary_janes`
- `avatar_v2_shoes_rosewood_platform_loafers`
- `avatar_v2_shoes_pearl_slingback_sandals`
- `avatar_v2_accessory_cherry_bow_headband`
- `avatar_v2_accessory_sage_heart_glasses`
- `avatar_v2_accessory_rose_round_glasses`
- `avatar_v2_accessory_lavender_pearl_cat_eye_glasses`
- `avatar_v2_accessory_mint_star_oval_glasses`
- `avatar_v2_accessory_honey_blossom_square_glasses`
- `avatar_v2_accessory_pearl_drop_earrings`
- `avatar_v2_accessory_golden_heart_locket`
- `avatar_v2_accessory_buttercream_neck_scarf`
- `avatar_v2_accessory_cherry_micro_bag`
- `avatar_v2_accessory_sunny_star_clips`
- `avatar_v2_top_sage_ribbon_knit_jacket`
- `avatar_v2_top_powder_blue_ribbon_corset_top`
- `avatar_v2_bottom_striped_crochet_shorts`
- `avatar_v2_bottom_layered_lace_ruffle_mini_skirt`
- `avatar_v2_bottom_black_palm_embellished_pants`
- `avatar_v2_bottom_coral_embellished_laceup_pants`
- `avatar_v2_bottom_smoky_floral_mesh_pants`
- `avatar_v2_bottom_yellow_bow_lace_ruffle_skirt`
- `avatar_v2_top_boho_patchwork_maxi_dress`
- `avatar_v2_top_embroidered_halter_wrap_dress`
- `avatar_v2_top_ruched_patchwork_mini_dress`
- `avatar_v2_top_white_lace_cami_mini_dress`
- `avatar_v2_top_rosebud_picnic_peplum`
- `avatar_v2_top_coral_wave_polo`
- `avatar_v2_top_azure_garden_halter`
- `avatar_v2_bottom_coral_wave_pants`
- `avatar_v2_bottom_rose_picnic_pleated_shorts`
- `avatar_v2_shoes_rose_satin_bow_heels`
- `avatar_v2_shoes_ivory_pearl_slingback_heels`
- `avatar_v2_shoes_lilac_star_platform_sneakers`
- `avatar_v2_shoes_coral_wave_shoes`
- `avatar_v2_top_rose_ribbon_tea_dress`
- `avatar_v2_top_moonlit_velvet_ballet_dress`
- `avatar_v2_top_buttercup_picnic_pinafore_dress`
- `avatar_v2_top_lavender_garden_ribbon_dress`

## Published: men's items (32)

- `avatar_v2_top_male_tonal_geometric_camp_collar_shirt`
- `avatar_v2_bottom_male_wide_pleated_technical_trousers`
- `avatar_v2_bottom_male_midnight_relaxed_tailoring_trousers`
- `avatar_v2_hair_male_soft_textured_crop`
- `avatar_v2_top_male_asymmetric_utility_overshirt`
- `avatar_v2_top_male_abstract_resort_shirt`
- `avatar_v2_top_male_textured_knit_polo`
- `avatar_v2_top_male_monochrome_street_tailoring_top`
- `avatar_v2_bottom_male_monochrome_street_tailoring_bottom`
- `avatar_v2_top_male_contemporary_resort_street_top`
- `avatar_v2_top_male_creative_utility_top`
- `avatar_v2_bottom_male_creative_utility_bottom`
- `avatar_v2_bottom_male_relaxed_tailored_shorts`
- `avatar_v2_bottom_male_refined_utility_cargo_shorts`
- `avatar_v2_bottom_male_technical_sport_shorts`
- `avatar_v2_hair_male_voluminous_wavy_quiff`
- `avatar_v2_hair_male_short_twists_textured_style`
- `avatar_v2_shoes_male_retro_colorblock_runner`
- `avatar_v2_shoes_male_chunky_skate_sneakers`
- `avatar_v2_shoes_male_suede_penny_mules`
- `avatar_v2_shoes_male_lightweight_trail_sneakers`
- `avatar_v2_accessory_male_soft_patch_beanie`
- `avatar_v2_accessory_male_nylon_crossbody_bag`
- `avatar_v2_accessory_male_beaded_charm_necklace`
- `avatar_v2_hair_male_ash_blond_low_fade_crop`
- `avatar_v2_hair_male_blue_black_short_curls`
- `avatar_v2_accessory_male_tortoiseshell_smoke_sunglasses`
- `avatar_v2_accessory_male_matte_black_panto_sunglasses`
- `avatar_v2_bottom_male_washed_baggy_denim`
- `avatar_v2_bottom_male_soft_parachute_cargo_pants`
- `avatar_v2_bottom_male_colorblock_nylon_track_pants`
- `avatar_v2_top_male_pixel_heart_boxy_tee`

## Published: home items (6)

- `room_v2_chair_blush`
- `room_v2_table_round`
- `room_v2_lamp_heart`
- `room_v2_heart_rug`
- `room_v2_cute_bookshelf`
- `room_v2_side_table`

## Not published: retired (25)

- `avatar_v2_top_male_midnight_relaxed_tailoring_jacket`
- `avatar_v2_top_male_acid_washed_boxy_sweatshirt`
- `avatar_v2_top_male_dusty_blue_weekend_crew_sweatshirt`
- `avatar_v2_top_male_modern_track_luxury_top`
- `avatar_v2_top_male_cocoa_sage_canvas_shacket`
- `avatar_v2_top_male_charcoal_leather_bomber_hybrid`
- `avatar_v2_bottom_male_straight_utility_tailored_trousers`
- `avatar_v2_top_male_warm_sand_deconstructed_jacket`
- `avatar_v2_bottom_male_warm_sand_deconstructed_trousers`
- `avatar_v2_bottom_male_modern_track_luxury_bottom`
- `avatar_v2_bottom_male_contemporary_resort_street_bottom`
- `avatar_v2_hair_male_controlled_modern_mullet`
- `avatar_v2_hair_male_copper_compact_quiff`
- `avatar_v2_top_male_striped_chunky_cardigan`
- `avatar_v2_top_male_colorblock_rugby_polo`
- `avatar_v2_top_male_soft_varsity_knit_jacket`
- `avatar_v2_top_male_soft_panel_overshirt_bomber`
- `avatar_v2_top_blush_lace_cardigan`
- `avatar_v2_top_noir_rose_heart_cardigan`
- `avatar_v2_top_lilac_cloud_wrap_top`
- `avatar_v2_top_ivory_tweed_crop_jacket`
- `avatar_v2_top_cherry_varsity_cardigan`
- `avatar_v2_top_midnight_velvet_bolero`
- `avatar_v2_bottom_midnight_ribbon_wide_leg_pants`
- `avatar_v2_bottom_buttercream_pearl_tailored_pants`

## Not published: promotion hold (1)

- `avatar_v2_top_cherry_heart_milkmaid_blouse`
