import type { AvatarCatalogItem, UserAvatar } from "./avatarV2.types"
import {
  isAvatarV2ItemCompatibleWithBody,
  normalizeAvatarV2ForBody
} from "./avatarBodyCompatibility"

export const FEMALE_STARTER_BODY_ID = "avatar_v2_body_default"
export const MALE_STARTER_BODY_ID = "avatar_v2_body_male_light"

type StarterCategory = "hair" | "top" | "bottom" | "shoes"
type StarterCategoryItems = Readonly<
  Record<StarterCategory, readonly AvatarCatalogItem[]>
>

const STARTER_CATEGORY_LIMITS: Readonly<
  Partial<Record<string, Partial<Record<StarterCategory, number>>>>
> = {
  [FEMALE_STARTER_BODY_ID]: { hair: 2, top: 2, bottom: 2, shoes: 2 },
  [MALE_STARTER_BODY_ID]: { hair: 2, top: 2, bottom: 2, shoes: 2 }
}

const STARTER_ITEM_IDS: Readonly<
  Record<string, Readonly<Record<StarterCategory, readonly string[]>>>
> = {
  [FEMALE_STARTER_BODY_ID]: {
    hair: [
      "avatar_v2_hair_mocha_ribbon_blowout",
      "avatar_v2_hair_midnight_french_bob"
    ],
    top: [
      "avatar_v2_top_default",
      "avatar_v2_top_buttercream_bow_tee"
    ],
    bottom: [
      "avatar_v2_bottom_default",
      "avatar_v2_bottom_lavender_bow_twill_shorts"
    ],
    shoes: [
      "avatar_v2_shoes_milk_tea_court_sneakers",
      "avatar_v2_shoes_mint_ribbon_court_sneakers"
    ]
  },
  [MALE_STARTER_BODY_ID]: {
    hair: [
      "avatar_v2_hair_male_espresso_crop",
      "avatar_v2_hair_male_cocoa_textured_quiff"
    ],
    top: [
      "avatar_v2_top_male_powder_blue_crew_tee",
      "avatar_v2_top_male_cream_basic_tee"
    ],
    bottom: [
      "avatar_v2_bottom_male_navy_straight_pants",
      "avatar_v2_bottom_male_sage_cuffed_shorts"
    ],
    shoes: [
      "avatar_v2_shoes_male_milk_tea_court",
      "avatar_v2_shoes_male_cloud_white_trainers"
    ]
  }
}

export function getAvatarStarterCategoryItems(
  catalog: readonly AvatarCatalogItem[],
  type: StarterCategory,
  bodyId: string,
  canEquipItem: (item: AvatarCatalogItem) => boolean
): AvatarCatalogItem[] {
  const configuredIds = STARTER_ITEM_IDS[bodyId]?.[type]
  if (configuredIds) {
    const itemsById = new Map(catalog.map((item) => [item.id, item]))
    const configuredItems = configuredIds.flatMap((id) => {
      const item = itemsById.get(id)
      return item &&
        item.type === type &&
        item.hiddenFromWardrobe !== true &&
        isAvatarV2ItemCompatibleWithBody(item, bodyId) &&
        canEquipItem(item)
        ? [item]
        : []
    })
    return configuredItems
  }

  const availableItems = catalog
    .filter((item) =>
      item.type === type &&
      item.hiddenFromWardrobe !== true &&
      isAvatarV2ItemCompatibleWithBody(item, bodyId) &&
      canEquipItem(item)
    )
    .sort((left, right) =>
      (left.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
    )
  const limit = STARTER_CATEGORY_LIMITS[bodyId]?.[type]

  return limit === undefined ? availableItems : availableItems.slice(0, limit)
}

/**
 * Gender is a presentation choice inside the studio, not a one-way lock from
 * the profile step. Keep both owned starter bodies available so a user can
 * switch from the profile suggestion and still design the other character.
 */
export function getAvatarStarterBodyItems(
  catalog: readonly AvatarCatalogItem[],
  canEquipItem: (item: AvatarCatalogItem) => boolean
): AvatarCatalogItem[] {
  return catalog
    .filter((item) =>
      item.type === "body" &&
      item.hiddenFromWardrobe !== true &&
      canEquipItem(item)
    )
    .sort((left, right) => left.sortOrder - right.sortOrder)
}

export function normalizeAvatarForStarterSetup(
  avatar: UserAvatar,
  categoryItems: StarterCategoryItems
): UserAvatar {
  const next = { ...avatar, accessoryIds: [] as string[] }
  for (const type of ["hair", "top", "bottom", "shoes"] as const) {
    const key = `${type}Id` as "hairId" | "topId" | "bottomId" | "shoesId"
    const choices = categoryItems[type]
    if (
      choices.length > 0 &&
      !choices.some((item) => item.id === avatar[key])
    ) {
      next[key] = choices[0].id
    }
  }
  return next
}

export function getOnboardingStarterBodyId(
  gender: string | undefined
): string | undefined {
  if (gender === "man") return MALE_STARTER_BODY_ID
  if (gender === "woman" || gender === "non-binary") {
    return FEMALE_STARTER_BODY_ID
  }
  return undefined
}

export function applyOnboardingStarterBody(
  avatar: UserAvatar,
  suggestedBodyId: string | undefined,
  catalog: readonly AvatarCatalogItem[]
): UserAvatar {
  const bodyExists = suggestedBodyId
    ? catalog.some(
        (item) => item.id === suggestedBodyId && item.type === "body"
      )
    : false

  return bodyExists
    ? normalizeAvatarV2ForBody(avatar, suggestedBodyId as string, [...catalog])
    : { ...avatar, accessoryIds: [...avatar.accessoryIds] }
}

export interface InitialProfileStarterAvatarInput {
  avatar: UserAvatar
  canonicalStarterAvatar: UserAvatar
  avatarSetupIncomplete: boolean
  starterBodyId: string | undefined
}

export function buildInitialProfileStarterAvatar(
  input: InitialProfileStarterAvatarInput,
  catalog: AvatarCatalogItem[]
): UserAvatar | null {
  if (
    !input.avatarSetupIncomplete ||
    !input.starterBodyId ||
    !isUntouchedCanonicalStarter(
      input.avatar,
      input.canonicalStarterAvatar,
      input.starterBodyId,
      catalog
    )
  ) {
    return null
  }

  const candidate = applyOnboardingStarterBody(
    input.avatar,
    input.starterBodyId,
    catalog
  )
  return avatarsMatch(candidate, input.avatar) ? null : candidate
}

function isUntouchedCanonicalStarter(
  avatar: UserAvatar,
  canonicalStarterAvatar: UserAvatar,
  nextStarterBodyId: string,
  catalog: AvatarCatalogItem[]
): boolean {
  const candidateBodyIds = new Set([
    canonicalStarterAvatar.bodyId,
    avatar.bodyId,
    nextStarterBodyId
  ])

  return [...candidateBodyIds].some((bodyId) =>
    avatarsMatch(
      applyOnboardingStarterBody(canonicalStarterAvatar, bodyId, catalog),
      avatar
    )
  )
}

function avatarsMatch(left: UserAvatar, right: UserAvatar): boolean {
  return (
    left.bodyId === right.bodyId &&
    left.faceId === right.faceId &&
    left.eyesId === right.eyesId &&
    left.noseId === right.noseId &&
    left.mouthId === right.mouthId &&
    left.hairId === right.hairId &&
    left.topId === right.topId &&
    left.bottomId === right.bottomId &&
    left.shoesId === right.shoesId &&
    left.accessoryIds.length === right.accessoryIds.length &&
    left.accessoryIds.every((id, index) => id === right.accessoryIds[index])
  )
}

export interface AvatarStarterRefreshInput {
  hasLocalCustomization: boolean
  previousStarterBodyId: string | undefined
  nextStarterBodyId: string | undefined
  previousSelectionRevision: number | undefined
  nextSelectionRevision: number | undefined
}

export function shouldRefreshAvatarForStarterChange(
  input: AvatarStarterRefreshInput
): boolean {
  const starterChanged =
    input.previousStarterBodyId !== input.nextStarterBodyId
  const canonicalSelectionChanged =
    input.previousSelectionRevision !== input.nextSelectionRevision

  return !(
    input.hasLocalCustomization &&
    starterChanged &&
    !canonicalSelectionChanged
  )
}
