import type { LayeredFurnitureAssets } from "./layeredFurniture"
import { JAPON_LAYERED_FURNITURE_ASSETS, JAPON_LAYERED_WALL_ASSETS } from "./layeredFurnitureJaponAssets"
import { OYUN_LAYERED_FURNITURE_ASSETS, OYUN_LAYERED_WALL_ASSETS } from "./layeredFurnitureOyunAssets"
import type { LayeredWallAssets } from "./layeredWallFurniture"

/**
 * The layered pieces' runtime art, bundled with the app.
 * - room_v2_chair_blush: Workbench `avatar25-v2/furniture/out/room_v2_chair_blush_final_D/`, world scale D (the
 *   approved final x 0.631), copied verbatim, sprite scale 1.03.
 * - room_v3_sofa_japon_cream: Workbench `avatar25-v2/furniture/pilot_sofa/item/room_v3_sofa_japon_cream/`, world
 *   scale D, sprite scale 2.0; the visible pixels verbatim (fully transparent pixels' colour zeroed, as
 *   `scripts/normalize-transparent-png-rgb.mjs` does, so the PNGs are smaller). Pilot, owner-approved 2026-10-09.
 * - the Japon Sadeliği collection: `layeredFurnitureJaponAssets.ts`; the Oyun Odası collection: `layeredFurnitureOyunAssets.ts`.
 * Asset keys are per item and rotation, so the tap outlines (roomFurnitureTapTargetModel) find each back layer.
 */
const art = (itemId: string, key: string, source: number) => ({ key: `${itemId}_layered_${key}`, source })
const chair = (key: string, source: number) => art("room_v2_chair_blush", key, source)
const sofa = (key: string, source: number) => art("room_v3_sofa_japon_cream", key, source)

export const LAYERED_FURNITURE_ASSETS: LayeredFurnitureAssets = {
  room_v2_chair_blush: {
    0: {
      back: chair("r0_back", require("./room_v2_chair_blush/r0_back.png")),
      front: chair("r0_front", require("./room_v2_chair_blush/r0_front.png")),
      shadow: chair("r0_shadow", require("./room_v2_chair_blush/r0_shadow.png"))
    },
    1: {
      back: chair("r1_back", require("./room_v2_chair_blush/r1_back.png")),
      front: chair("r1_front", require("./room_v2_chair_blush/r1_front.png")),
      shadow: chair("r1_shadow", require("./room_v2_chair_blush/r1_shadow.png"))
    },
    2: {
      back: chair("r2_back", require("./room_v2_chair_blush/r2_back.png")),
      front: chair("r2_front", require("./room_v2_chair_blush/r2_front.png")),
      shadow: chair("r2_shadow", require("./room_v2_chair_blush/r2_shadow.png"))
    },
    3: {
      back: chair("r3_back", require("./room_v2_chair_blush/r3_back.png")),
      front: chair("r3_front", require("./room_v2_chair_blush/r3_front.png")),
      shadow: chair("r3_shadow", require("./room_v2_chair_blush/r3_shadow.png"))
    }
  },
  room_v3_sofa_japon_cream: {
    0: {
      back: sofa("r0_back", require("./room_v3_sofa_japon_cream/r0_back.png")),
      front: sofa("r0_front", require("./room_v3_sofa_japon_cream/r0_front.png")),
      shadow: sofa("r0_shadow", require("./room_v3_sofa_japon_cream/r0_shadow.png"))
    },
    1: {
      back: sofa("r1_back", require("./room_v3_sofa_japon_cream/r1_back.png")),
      front: sofa("r1_front", require("./room_v3_sofa_japon_cream/r1_front.png")),
      shadow: sofa("r1_shadow", require("./room_v3_sofa_japon_cream/r1_shadow.png"))
    },
    2: {
      back: sofa("r2_back", require("./room_v3_sofa_japon_cream/r2_back.png")),
      front: sofa("r2_front", require("./room_v3_sofa_japon_cream/r2_front.png")),
      shadow: sofa("r2_shadow", require("./room_v3_sofa_japon_cream/r2_shadow.png"))
    },
    3: {
      back: sofa("r3_back", require("./room_v3_sofa_japon_cream/r3_back.png")),
      front: sofa("r3_front", require("./room_v3_sofa_japon_cream/r3_front.png")),
      shadow: sofa("r3_shadow", require("./room_v3_sofa_japon_cream/r3_shadow.png"))
    }
  },
  ...JAPON_LAYERED_FURNITURE_ASSETS,
  ...OYUN_LAYERED_FURNITURE_ASSETS
}

/** The layered wall pieces' art: one drawing per back wall. */
export const LAYERED_WALL_ASSETS: LayeredWallAssets = { ...JAPON_LAYERED_WALL_ASSETS, ...OYUN_LAYERED_WALL_ASSETS }
