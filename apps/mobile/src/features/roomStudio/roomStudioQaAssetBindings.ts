import type { RoomStudioQaAssetBindings } from "./roomStudioQaCatalog"
import { ROOM_STUDIO_MODULE_ITEM_IDS } from "./roomStudioRecipes"
import { ROOM_STUDIO_ASSET_MANIFEST } from "./roomStudioAssetManifest"

/**
 * Real Metro asset bindings for the isolated Home Studio QA entrypoint.
 * Production navigation must never import this module.
 */
export const ROOM_STUDIO_QA_ASSET_BINDINGS: RoomStudioQaAssetBindings = {
  [ROOM_STUDIO_MODULE_ITEM_IDS.sleep]: require("./assets/qa/rose-sleep-front-v1.png"),
  [ROOM_STUDIO_MODULE_ITEM_IDS.cozyCorner]: require("./assets/qa/rose-cozy-corner-front-v1.png"),
  [ROOM_STUDIO_MODULE_ITEM_IDS.wallStory]: require("./assets/qa/rose-wall-story-front-v1.png"),
  [ROOM_STUDIO_MODULE_ITEM_IDS.softAccents]: require("./assets/qa/rose-soft-accents-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_sleep_sky_v1.id]: require("./assets/qa/sky-sleep-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_cozy_corner_sky_v1.id]: require("./assets/qa/sky-cozy-corner-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_wall_story_sky_v1.id]: require("./assets/qa/sky-wall-story-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_soft_accents_sky_v1.id]: require("./assets/qa/sky-soft-accents-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_sleep_honey_v1.id]: require("./assets/qa/honey-sleep-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_cozy_corner_honey_v1.id]: require("./assets/qa/honey-cozy-corner-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_wall_story_honey_v1.id]: require("./assets/qa/honey-wall-story-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_soft_accents_honey_v1.id]: require("./assets/qa/honey-soft-accents-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_sleep_lilac_v1.id]: require("./assets/qa/lilac-sleep-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_cozy_corner_lilac_v1.id]: require("./assets/qa/lilac-cozy-corner-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_wall_story_lilac_v1.id]: require("./assets/qa/lilac-wall-story-front-v1.png"),
  [ROOM_STUDIO_ASSET_MANIFEST.room_studio_soft_accents_lilac_v1.id]: require("./assets/qa/lilac-soft-accents-front-v1.png")
}
