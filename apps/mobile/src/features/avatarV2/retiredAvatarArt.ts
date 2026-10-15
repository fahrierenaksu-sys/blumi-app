import type { ImageSourcePropType } from "react-native"

/**
 * The one picture every retired pre-2.5D avatar layer points at: a 1x1 transparent image.
 *
 * The old avatarV2 art (layers, room layers, motion frames and atlases, shop thumbnails) is no longer drawn by any
 * surface: rooms and the MiniRoom draw the 2.5D rig, and cards, try-on and portraits use the 2.5D stills. Its item
 * IDs, catalog entries and asset keys stay (stable IDs, AGENTS.md); only the bitmaps are gone, so a stored or owned
 * old item can never crash a lookup and at most draws nothing. Full code removal is plan X16.
 */
export const RETIRED_AVATAR_ART: ImageSourcePropType = require("./assets/retired_avatar_art.png")
