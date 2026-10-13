import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarCatalogItem, UserAvatar } from "./avatarV2.types"
import {
  type AvatarStarterItemIds,
  applyOnboardingStarterBody,
  FEMALE_STARTER_BODY_ID,
  getAvatarStarterBodyItems,
  getAvatarStarterCategoryItems,
  getOnboardingStarterBodyId,
  MALE_STARTER_BODY_ID,
  normalizeAvatarForStarterSetup,
  shouldRefreshAvatarForStarterChange
} from "./avatarStarterModel"

const currentAvatar: UserAvatar = {
  bodyId: "female-body",
  faceId: "face",
  eyesId: "eyes",
  noseId: "nose",
  mouthId: "mouth",
  hairId: "hair",
  topId: "top",
  bottomId: "bottom",
  shoesId: "shoes",
  accessoryIds: ["bow"]
}

const catalog = [
  { id: "female-body", type: "body" },
  { id: "male-body", type: "body" },
  { id: "hair", type: "hair" }
] as AvatarCatalogItem[]

type StarterCategory = "hair" | "top" | "bottom" | "shoes"

function starterItem(
  bodyId: string,
  type: StarterCategory,
  index: number,
  overrides: Partial<AvatarCatalogItem> = {}
): AvatarCatalogItem {
  return {
    id: `${bodyId}-${type}-${index}`,
    type,
    name: `${bodyId} ${type} ${index}`,
    sortOrder: index * 10,
    layerOrder: 10,
    assets: {},
    ownedByDefault: true,
    compatibleBodyIds: [bodyId],
    ...overrides
  }
}

const starterCatalog = [
  ...(["hair", "top", "bottom", "shoes"] as const).flatMap((type) =>
    [1, 2, 3, 4].map((index) =>
      starterItem(FEMALE_STARTER_BODY_ID, type, index)
    )
  ),
  ...(["hair", "top", "bottom", "shoes"] as const).flatMap((type) =>
    [1, 2, 3, 4].map((index) =>
      starterItem(MALE_STARTER_BODY_ID, type, index)
    )
  ),
  starterItem(FEMALE_STARTER_BODY_ID, "top", 5, {
    hiddenFromWardrobe: true
  }),
  starterItem(FEMALE_STARTER_BODY_ID, "top", 6, {
    ownedByDefault: false
  }),
  starterItem(MALE_STARTER_BODY_ID, "shoes", 5, {
    ownedByDefault: false
  }),
  ...([
    [FEMALE_STARTER_BODY_ID, "hair", "fixture_starter_female_hair_a"],
    [FEMALE_STARTER_BODY_ID, "hair", "fixture_starter_female_hair_b"],
    [FEMALE_STARTER_BODY_ID, "top", "fixture_starter_female_top_a"],
    [FEMALE_STARTER_BODY_ID, "top", "fixture_starter_female_top_b"],
    [FEMALE_STARTER_BODY_ID, "bottom", "fixture_starter_female_bottom_a"],
    [FEMALE_STARTER_BODY_ID, "bottom", "fixture_starter_female_bottom_b"],
    [FEMALE_STARTER_BODY_ID, "shoes", "fixture_starter_female_shoes_a"],
    [FEMALE_STARTER_BODY_ID, "shoes", "fixture_starter_female_shoes_b"],
    [MALE_STARTER_BODY_ID, "hair", "fixture_starter_male_hair_a"],
    [MALE_STARTER_BODY_ID, "top", "fixture_starter_male_top_a"],
    [MALE_STARTER_BODY_ID, "top", "fixture_starter_male_top_b"],
    [MALE_STARTER_BODY_ID, "bottom", "fixture_starter_male_bottom_a"],
    [MALE_STARTER_BODY_ID, "bottom", "fixture_starter_male_bottom_b"],
    [MALE_STARTER_BODY_ID, "shoes", "fixture_starter_male_shoes_a"],
    [MALE_STARTER_BODY_ID, "shoes", "fixture_starter_male_shoes_b"]
  ] as const).map(([bodyId, type, id], index) =>
    starterItem(bodyId, type, index + 20, { id })
  )
]

/**
 * Test-only starter configuration. The live starters are the 2.5D looks (X15),
 * so these rule tests inject their own ids instead of reading real ones.
 */
const fixtureStarterItemIds: AvatarStarterItemIds = {
  [FEMALE_STARTER_BODY_ID]: {
    hair: ["fixture_starter_female_hair_a", "fixture_starter_female_hair_b"],
    top: ["fixture_starter_female_top_a", "fixture_starter_female_top_b"],
    bottom: ["fixture_starter_female_bottom_a", "fixture_starter_female_bottom_b"],
    shoes: ["fixture_starter_female_shoes_a", "fixture_starter_female_shoes_b"]
  },
  [MALE_STARTER_BODY_ID]: {
    hair: ["fixture_starter_male_hair_a"],
    top: ["fixture_starter_male_top_a", "fixture_starter_male_top_b"],
    bottom: ["fixture_starter_male_bottom_a", "fixture_starter_male_bottom_b"],
    shoes: ["fixture_starter_male_shoes_a", "fixture_starter_male_shoes_b"]
  }
}

function isFree(item: AvatarCatalogItem): boolean {
  return item.ownedByDefault === true
}

test("applies the gender starter body and clears incompatible accessories without mutation", () => {
  const next = applyOnboardingStarterBody(currentAvatar, "male-body", catalog)

  assert.equal(next.bodyId, "male-body")
  assert.equal(currentAvatar.bodyId, "female-body")
  assert.notEqual(next.accessoryIds, currentAvatar.accessoryIds)
  assert.deepEqual(next.accessoryIds, [])
})

test("keeps the canonical body for absent and invalid suggestions", () => {
  assert.deepEqual(
    applyOnboardingStarterBody(currentAvatar, undefined, catalog),
    currentAvatar
  )
  assert.deepEqual(
    applyOnboardingStarterBody(currentAvatar, "hair", catalog),
    currentAvatar
  )
  assert.deepEqual(
    applyOnboardingStarterBody(currentAvatar, "missing", catalog),
    currentAvatar
  )
})

test("maps profile identity to an explicit starter body without gendering the CTA", () => {
  assert.equal(getOnboardingStarterBodyId("woman"), "avatar_v2_body_default")
  assert.equal(getOnboardingStarterBodyId("man"), "avatar_v2_body_male_light")
  assert.equal(getOnboardingStarterBodyId("non-binary"), "avatar_v2_body_default")
  assert.equal(getOnboardingStarterBodyId(undefined), undefined)
})

test("starter body picker keeps both gender presets available after either selection", () => {
  const bodyItems = getAvatarStarterBodyItems(
    [
      {
        id: FEMALE_STARTER_BODY_ID,
        type: "body",
        name: "Woman",
        sortOrder: 1,
        layerOrder: 0,
        assets: {},
        ownedByDefault: true
      },
      {
        id: MALE_STARTER_BODY_ID,
        type: "body",
        name: "Man",
        sortOrder: 2,
        layerOrder: 0,
        assets: {},
        ownedByDefault: true
      }
    ],
    () => true
  )

  assert.deepEqual(bodyItems.map((item) => item.id), [
    FEMALE_STARTER_BODY_ID,
    MALE_STARTER_BODY_ID
  ])
})

test("starter styling ignores other owned or previously purchased wardrobe items", () => {
  const leakedPremiumItem = starterItem(
    FEMALE_STARTER_BODY_ID,
    "bottom",
    0,
    { id: "premium-bottom-that-must-not-appear", ownedByDefault: true }
  )
  const classicShorts = starterItem(
    FEMALE_STARTER_BODY_ID,
    "bottom",
    1,
    { id: "fixture_starter_female_bottom_a" }
  )
  const lavenderShorts = starterItem(
    FEMALE_STARTER_BODY_ID,
    "bottom",
    2,
    { id: "fixture_starter_female_bottom_b" }
  )

  assert.deepEqual(
    getAvatarStarterCategoryItems(
      [leakedPremiumItem, classicShorts, lavenderShorts],
      "bottom",
      FEMALE_STARTER_BODY_ID,
      () => true,
      fixtureStarterItemIds
    ).map((item) => item.id),
    [
      "fixture_starter_female_bottom_a",
      "fixture_starter_female_bottom_b"
    ]
  )
})

test("starter setup replaces retained locked slots and accessories without mutation", () => {
  const lockedAvatar: UserAvatar = {
    ...currentAvatar,
    hairId: "locked-hair",
    topId: "locked-top",
    accessoryIds: ["locked-accessory"]
  }
  const next = normalizeAvatarForStarterSetup(lockedAvatar, {
    hair: [starterItem("female-body", "hair", 1)],
    top: [starterItem("female-body", "top", 1)],
    bottom: [starterItem("female-body", "bottom", 1)],
    shoes: [starterItem("female-body", "shoes", 1)]
  })

  assert.equal(next.hairId, "female-body-hair-1")
  assert.equal(next.topId, "female-body-top-1")
  assert.equal(next.bottomId, "female-body-bottom-1")
  assert.equal(next.shoesId, "female-body-shoes-1")
  assert.deepEqual(next.accessoryIds, [])
  assert.equal(lockedAvatar.topId, "locked-top")
  assert.deepEqual(lockedAvatar.accessoryIds, ["locked-accessory"])
})

test("legacy female items without an explicit compatibility list never leak into male starters", () => {
  const legacyFemaleTop = starterItem(
    FEMALE_STARTER_BODY_ID,
    "top",
    0,
    { compatibleBodyIds: undefined }
  )
  const maleTops = starterCatalog.filter(
    (item) =>
      item.type === "top" &&
      item.compatibleBodyIds?.includes(MALE_STARTER_BODY_ID) &&
      item.id.startsWith("fixture_starter_male_top_")
  )

  assert.deepEqual(
    getAvatarStarterCategoryItems(
      [legacyFemaleTop, ...maleTops],
      "top",
      MALE_STARTER_BODY_ID,
      isFree,
      fixtureStarterItemIds
    ).map((item) => item.id),
    [
      "fixture_starter_male_top_a",
      "fixture_starter_male_top_b"
    ]
  )
})

test("profile review never resets a locally customized starter avatar", () => {
  assert.equal(
    shouldRefreshAvatarForStarterChange({
      hasLocalCustomization: true,
      previousStarterBodyId: FEMALE_STARTER_BODY_ID,
      nextStarterBodyId: MALE_STARTER_BODY_ID,
      previousSelectionRevision: 0,
      nextSelectionRevision: 0
    }),
    false
  )
  assert.equal(
    shouldRefreshAvatarForStarterChange({
      hasLocalCustomization: false,
      previousStarterBodyId: FEMALE_STARTER_BODY_ID,
      nextStarterBodyId: MALE_STARTER_BODY_ID,
      previousSelectionRevision: 0,
      nextSelectionRevision: 0
    }),
    true
  )
})

test("a newer canonical avatar revision still refreshes local state", () => {
  assert.equal(
    shouldRefreshAvatarForStarterChange({
      hasLocalCustomization: true,
      previousStarterBodyId: MALE_STARTER_BODY_ID,
      nextStarterBodyId: undefined,
      previousSelectionRevision: 0,
      nextSelectionRevision: 1
    }),
    true
  )
})
