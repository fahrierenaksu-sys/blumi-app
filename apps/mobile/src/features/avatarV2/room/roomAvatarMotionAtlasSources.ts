import type { ImageSourcePropType } from "react-native"
import { RETIRED_AVATAR_ART } from "../retiredAvatarArt"
import manifest from "./roomAvatarMotionAtlas.json"

// Index i is the image of atlases[i] in roomAvatarMotionAtlas.json. The atlases held retired pre-2.5D motion frames,
// which no surface draws any more (see retiredAvatarArt.ts); every index now points at the retired-art picture so the
// frame keys keep resolving.
export const ROOM_AVATAR_MOTION_ATLAS_SOURCES: readonly ImageSourcePropType[] = manifest.atlases.map(
  () => RETIRED_AVATAR_ART
)
