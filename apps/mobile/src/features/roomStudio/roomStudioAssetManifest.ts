import {
  ROOM_STUDIO_THEME_IDS,
  ROOM_STUDIO_ZONE_IDS,
  getRoomStudioThemeOptions,
  type RoomStudioThemeId,
  type RoomStudioZoneId
} from "./roomStudioThemeMatrix"

export interface RoomStudioAssetManifestEntry {
  readonly id: string
  readonly theme: RoomStudioThemeId
  readonly zone: RoomStudioZoneId
  readonly assetPath: string
  readonly runtimeFileName: string
  readonly width: number
  readonly height: number
  readonly sha256: string
  readonly alphaVerified: true
  readonly status: "candidate"
}

const HASHES: Readonly<Record<string, string>> = {
  room_studio_sleep_module_v1: "5bc0f691a1ed0fad5e26787b34aa7592cb509915e589d95c7cc0f3c82aa2ea63",
  room_studio_cozy_corner_v1: "e04c9cab722237fd5631dc0c18c7af2be74c2f954a8956e3cfb76b63c7f4d052",
  room_studio_wall_story_v1: "95cc9ef43721322cd3e20b1beb9f24ee88fca7433b8fa40218ebb1ee32f90267",
  room_studio_soft_accents_v1: "b2b059b9e16c47e702e9dd47e55845c4dac9357f7d702735ccbfbb5eac940669",
  room_studio_sleep_sky_v1: "957e0082fad74cbb8cebd02bee147d9525236b44fdaa63031a4d99c5c0a553f7",
  room_studio_cozy_corner_sky_v1: "c9d1d0d2dc4685814ee37ebfde1028aa0f28c4d613d0c9b498d47ed68a6970c4",
  room_studio_wall_story_sky_v1: "646873ad422fef73347a112a606b150d16e8fe0e85ba211bc0bf56333e73d514",
  room_studio_soft_accents_sky_v1: "2c4a71c94e8b6b3d9ff46e9fe0152712daacf850716c613d720d1f9211836918",
  room_studio_sleep_honey_v1: "5daa454c9ed6211b4a9cd245dde50a02a23e064f612bbd749bad556f87231c0f",
  room_studio_cozy_corner_honey_v1: "58fec5c4a73903c1c23323fbd85844d557d20fb494c44f3408e060dee40b4666",
  room_studio_wall_story_honey_v1: "908c7377d87359f9ec472bf462213afbddc35d1278170e5f32c2cc1392d734f2",
  room_studio_soft_accents_honey_v1: "82126583fb74420e361ea469338cad93ad204f39a42b45a97202810cd5e1d871",
  room_studio_sleep_lilac_v1: "14daef90ff600ebe5b2c3ef9382291e069a55e9a097d4890f10ae190099e6413",
  room_studio_cozy_corner_lilac_v1: "d811d92357fd2ab55e554f0bf5d855272ace351f2b1b0c4520309b26719a8cad",
  room_studio_wall_story_lilac_v1: "2a6cc94d25482162696c7a42e7061870224a241c305d8863a819a756bdfeb88c",
  room_studio_soft_accents_lilac_v1: "ffaa7c74db403f322188612e660802240d344c84471fe806d573d22ebc2c635d"
}

const ZONE_DIMENSIONS: Readonly<Record<RoomStudioZoneId, readonly [number, number]>> = {
  sleep: [1672, 941],
  cozyCorner: [1672, 941],
  wallStory: [1499, 1049],
  softAccents: [1672, 941]
}

const entries = ROOM_STUDIO_THEME_IDS.flatMap((theme) =>
  getRoomStudioThemeOptions(theme).map((option) => {
    const [width, height] = ZONE_DIMENSIONS[option.zone]
    const fileName = option.assetPath.split("/").at(-1)
    if (!fileName) throw new Error("room_studio_asset_filename_missing")
    const sha256 = HASHES[option.id]
    if (!sha256) throw new Error("room_studio_asset_hash_missing")
    return [option.id, Object.freeze({
      id: option.id,
      theme: option.theme,
      zone: option.zone,
      assetPath: option.assetPath,
      runtimeFileName: fileName,
      width,
      height,
      sha256,
      alphaVerified: true,
      status: "candidate"
    })] as const
  })
)

export const ROOM_STUDIO_ASSET_MANIFEST: Readonly<Record<string, RoomStudioAssetManifestEntry>> =
  Object.freeze(Object.fromEntries(entries))

export const ROOM_STUDIO_ASSET_IDS = Object.freeze(
  entries.map(([id]) => id)
)

export function getRoomStudioAssetManifestEntry(
  assetId: string
): RoomStudioAssetManifestEntry {
  const entry = ROOM_STUDIO_ASSET_MANIFEST[assetId]
  if (!entry) throw new Error("room_studio_asset_unknown")
  return entry
}

if (ROOM_STUDIO_ASSET_IDS.length !== ROOM_STUDIO_THEME_IDS.length * ROOM_STUDIO_ZONE_IDS.length) {
  throw new Error("room_studio_asset_matrix_incomplete")
}
