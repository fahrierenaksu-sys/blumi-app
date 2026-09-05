/**
 * The Home Studio production matrix. A theme is a coherent visual family,
 * while a zone is the only part the user changes. Keeping this matrix
 * explicit prevents arbitrary combinations from drifting away from the
 * approved Blumi room language.
 */
export const ROOM_STUDIO_THEME_IDS = [
  "rose",
  "sky",
  "honey",
  "lilac"
] as const

export type RoomStudioThemeId = (typeof ROOM_STUDIO_THEME_IDS)[number]

export const ROOM_STUDIO_ZONE_IDS = [
  "sleep",
  "cozyCorner",
  "wallStory",
  "softAccents"
] as const

export type RoomStudioZoneId = (typeof ROOM_STUDIO_ZONE_IDS)[number]

export interface RoomStudioThemeOption {
  readonly id: string
  readonly theme: RoomStudioThemeId
  readonly zone: RoomStudioZoneId
  readonly label: string
  readonly themeLabel: string
  readonly assetPath: string
}

export interface RoomStudioThemePreset {
  readonly theme: RoomStudioThemeId
  readonly label: string
  readonly description: string
  readonly optionIds: readonly string[]
}

type ThemeOptionTable = Readonly<{
  [Theme in RoomStudioThemeId]: Readonly<{
    [Zone in RoomStudioZoneId]: RoomStudioThemeOption
  }>
}>

const zoneLabels: Readonly<Record<RoomStudioZoneId, string>> = {
  sleep: "Uyku köşesi",
  cozyCorner: "Cozy köşe",
  wallStory: "Duvar hikâyesi",
  softAccents: "Aksesuarlar"
}

const themeDetails: Readonly<Record<RoomStudioThemeId, {
  label: string
  description: string
}>> = {
  rose: { label: "Gül", description: "Sıcak pembe ve krem dokular" },
  sky: { label: "Gökyüzü", description: "Hafif mavi ve açık keten dokular" },
  honey: { label: "Bal", description: "Bal sarısı ve sıcak ahşap dokular" },
  lilac: { label: "Leylak", description: "Yumuşak mor ve pudra dokular" }
}

const option = (
  theme: RoomStudioThemeId,
  zone: RoomStudioZoneId,
  id: string,
  fileName: string
): RoomStudioThemeOption => Object.freeze({
  id,
  theme,
  zone,
  label: zoneLabels[zone],
  themeLabel: themeDetails[theme].label,
  assetPath: `art/room-vnext/home-studio-pilot-v1/modules/v1/${fileName}`
})

const THEME_OPTIONS: ThemeOptionTable = Object.freeze({
  rose: Object.freeze({
    sleep: option("rose", "sleep", "room_studio_sleep_module_v1", "rose-sleep-v1.png"),
    cozyCorner: option("rose", "cozyCorner", "room_studio_cozy_corner_v1", "rose-cozy-corner-v1.png"),
    wallStory: option("rose", "wallStory", "room_studio_wall_story_v1", "rose-wall-story-v1.png"),
    softAccents: option("rose", "softAccents", "room_studio_soft_accents_v1", "rose-soft-accents-v1.png")
  }),
  sky: Object.freeze({
    sleep: option("sky", "sleep", "room_studio_sleep_sky_v1", "sky-sleep-v1.png"),
    cozyCorner: option("sky", "cozyCorner", "room_studio_cozy_corner_sky_v1", "sky-cozy-corner-v1.png"),
    wallStory: option("sky", "wallStory", "room_studio_wall_story_sky_v1", "sky-wall-story-v1.png"),
    softAccents: option("sky", "softAccents", "room_studio_soft_accents_sky_v1", "sky-soft-accents-v1.png")
  }),
  honey: Object.freeze({
    sleep: option("honey", "sleep", "room_studio_sleep_honey_v1", "honey-sleep-v1.png"),
    cozyCorner: option("honey", "cozyCorner", "room_studio_cozy_corner_honey_v1", "honey-cozy-corner-v1.png"),
    wallStory: option("honey", "wallStory", "room_studio_wall_story_honey_v1", "honey-wall-story-v1.png"),
    softAccents: option("honey", "softAccents", "room_studio_soft_accents_honey_v1", "honey-soft-accents-v1.png")
  }),
  lilac: Object.freeze({
    sleep: option("lilac", "sleep", "room_studio_sleep_lilac_v1", "lilac-sleep-v1.png"),
    cozyCorner: option("lilac", "cozyCorner", "room_studio_cozy_corner_lilac_v1", "lilac-cozy-corner-v1.png"),
    wallStory: option("lilac", "wallStory", "room_studio_wall_story_lilac_v1", "lilac-wall-story-v1.png"),
    softAccents: option("lilac", "softAccents", "room_studio_soft_accents_lilac_v1", "lilac-soft-accents-v1.png")
  })
})

export function getRoomStudioThemeOptions(
  theme: RoomStudioThemeId
): RoomStudioThemeOption[] {
  const table = THEME_OPTIONS[theme]
  if (!table) throw new Error("room_studio_theme_unknown")
  return ROOM_STUDIO_ZONE_IDS.map((zone) => ({ ...table[zone] }))
}

export function getRoomStudioThemeOption(
  theme: RoomStudioThemeId,
  zone: RoomStudioZoneId
): RoomStudioThemeOption {
  const table = THEME_OPTIONS[theme]
  if (!table) throw new Error("room_studio_theme_unknown")
  const selected = table[zone]
  if (!selected) throw new Error("room_studio_zone_unknown")
  return { ...selected }
}

/** Returns the four curated alternatives for one touch target/room zone. */
export function getRoomStudioZoneOptions(
  zone: RoomStudioZoneId
): RoomStudioThemeOption[] {
  return ROOM_STUDIO_THEME_IDS.map((theme) => getRoomStudioThemeOption(theme, zone))
}

export function getRoomStudioThemePreset(
  theme: RoomStudioThemeId
): RoomStudioThemePreset {
  const detail = themeDetails[theme]
  if (!detail) throw new Error("room_studio_theme_unknown")
  return {
    theme,
    label: detail.label,
    description: detail.description,
    optionIds: getRoomStudioThemeOptions(theme).map(({ id }) => id)
  }
}
