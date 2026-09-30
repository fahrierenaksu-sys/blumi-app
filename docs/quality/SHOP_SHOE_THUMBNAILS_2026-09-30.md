# Shop shoe thumbnails — 2026-09-30

Status: **Implemented, Tested** for four women's shoes (code-only change).
**Open** for the other 14 shoe cards: the repository has no sharper source for
them, so they need a Workbench export on the owner's Mac. **Native verification
is open**: nobody has checked Shop or Wardrobe on a device or Simulator yet.

## Problem

The owner reported blurry shoe thumbnails in the Shop 2x2 card grid on a real
iPhone. Other categories look acceptable.

## Root cause

`ShopProductCard` scales the source canvas so the visible alpha bounds
(`shopThumbnailBounds.json` or `garmentThumbnailOverrides.ts`) fill the image
well less a 6pt inset (`getShopThumbnailLayout`). A pair of shoes is wide and
short, so it fills the well's width (99–126pt). Every shoe source is tiny:

| Items | Card source | Visible shoe pixels | Upscale on a 3x iPhone |
|---|---|---|---|
| 8 men's shoes | `room/avatar_room_shoes_male_<slug>_v1.png` (256x384 rig layer) | 47–52 x 24–25 | 5.7–6.3x (iPhone 16), 7.0–7.3x (170pt card) |
| 5 women's R1 shoes (`milk_tea_court_sneakers`, `cherry_satin_ballets`, `onyx_heart_mary_janes`, `rosewood_platform_loafers`, `pearl_slingback_sandals`) | `shop-thumbnails/avatar_v2_shoes_<slug>.png` (224x224, crop of the room layer) | 56–58 x 26–30 | 5.1–5.3x, 5.8–6.7x |
| 4 women's capsule shoes (`rose_satin_bow_heels`, `ivory_pearl_slingback_heels`, `lilac_star_platform_sneakers`, `mint_ribbon_court_sneakers`) | `room/avatar_room_shoes_female_<slug>_v2.png` (256x384) | 58 x 29 | 5.1x, 6.0x |
| `coral_wave_shoes` | `shop-thumbnails/avatar_v2_shoes_coral_wave_shoes.png` (220x220) | 196 x 101 | 1.5x, 1.7x |

For comparison, the median upscale per category on an iPhone 16 (393pt, image
well 110.6 x 66.5pt) is: shoes 5.28x, bottoms 2.73x, accessories 2.73x,
tops 1.95x, hair 1.24x, and face features 0.8x (they are downscaled). Nothing
in rendering adds blur. `expo-image` uses `contentFit="contain"`, applies no
scale transform on top of the measured layout, and does not downscale an image
that is smaller than its view.

## Change

The four capsule shoes also ship a 512x768 profile layer
(`layers/avatar_shoes_<slug>.png`). It is the same artwork at twice the
resolution: downscaled to 256x384, it differs from the room layer by about 1
level out of 255. Their Shop and Wardrobe override now uses that layer with its
measured bounds `[512, 768, 197, 637, 118, 60]`. On a 170pt card the upscale
drops from 6.0x to 2.9x. No pixels are edited, and no file is added or changed.
For the three published capsule shoes, the layer was already bound in the
item's release receipt as its AvatarV2 layer. The resolved asset set and bytes
are therefore unchanged, and so are the `blumiR1ReleaseCatalog.json` receipts
and `SHOP_CATALOG_PUBLICATION_2026-09-30.md`. `mint_ribbon_court_sneakers` is
not published.

The five women's R1 shoes also have profile layers, but those show a
**different, older design** (a flat shoe with no foot), so they cannot be used.

## Workbench export required (owner, on the Mac)

Export one Shop thumbnail per item from the highest-resolution approved master
of the **same artwork the app ships now**. For each item, that artwork is the
room layer named below. Use only a crop and a high-quality downscale: no
redraw, no generation, no recolour, and no upscaling of the runtime layer. If
no master is at least 432px wide, record `MANUAL_MASTER_REQUIRED` for that
item instead of exporting.

- **Format:** RGBA PNG, sRGB, straight alpha. The canvas is 480 x 240 with the
  shoe pair centred on it. The visible pair is 432px wide, or at most 192px
  tall for a narrow pair, with at least 24px of transparent margin. Downscale
  with Lanczos, then losslessly optimise the file (for example, oxipng). This
  gives at least 3 device pixels per point for a visible shoe up to 144pt wide.
- **Target path:** `apps/mobile/src/features/avatarV2/assets/shop-thumbnails/avatar_v2_shoes_<slug>_v2.png`.
  The filename is versioned so that the promotion stays reversible.
- **Required (14):**
  - men's shoes, matching `room/avatar_room_shoes_male_<slug>_v1.png`, for the
    slugs `male_milk_tea_court`, `male_cloud_white_trainers`,
    `male_cocoa_penny_loafers`, `male_dusty_blue_canvas_sneakers`,
    `male_retro_colorblock_runner`, `male_chunky_skate_sneakers`,
    `male_suede_penny_mules` and `male_lightweight_trail_sneakers`;
  - women's R1 shoes, matching `room/avatar_room_shoes_female_<slug>_v2.png`
    (not the older `layers/avatar_shoes_<slug>.png`), for the slugs
    `milk_tea_court_sneakers`, `cherry_satin_ballets`,
    `onyx_heart_mary_janes`, `rosewood_platform_loafers` and
    `pearl_slingback_sandals`.

  The resulting item IDs are `avatar_v2_shoes_<slug>`.
- **Recommended (5):** the four capsule shoes, which still upscale 2.9x after
  this change, and `coral_wave_shoes` (1.7x).

To wire in an approved export:

1. Point `SHOP_THUMBNAIL_SOURCES` in `shop/shopAssets.ts` at the new files.
   For the capsule shoes, point `garmentThumbnailOverrides.ts` at them instead.
2. Put the measured bounds in `shopThumbnailBounds.json`. The
   `shopAssets.test.ts` bounds test prints any mismatch.
3. Men's Wardrobe cards render the rig layer through
   `MALE_CAPSULE_PREVIEW_SOURCES`. They only improve if the Wardrobe resolver
   is pointed at the new files too.
4. Every published item whose resolved files change needs a re-issued,
   owner-approved receipt. `shopReleaseCatalog.test.ts` prints the expected
   asset list and hashes. The receipt must cite a new or amended publication
   record, because the current record's SHA-256 is bound in every receipt.
5. Run `npm --workspace @blumi/mobile run test:shop-preview-assets` and
   `test:bundle-size`. Then verify the Shop and Wardrobe cards in the
   Simulator and on the iPhone.
