import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import type { AvatarCatalogItem, UserAvatar } from "./avatarV2.types"
import {
  applyOnboardingStarterBody,
  buildInitialProfileStarterAvatar,
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

const untouchedAvatar: UserAvatar = {
  ...currentAvatar,
  accessoryIds: []
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
    [FEMALE_STARTER_BODY_ID, "hair", "avatar_v2_hair_mocha_ribbon_blowout"],
    [FEMALE_STARTER_BODY_ID, "hair", "avatar_v2_hair_midnight_french_bob"],
    [FEMALE_STARTER_BODY_ID, "top", "avatar_v2_top_default"],
    [FEMALE_STARTER_BODY_ID, "top", "avatar_v2_top_buttercream_bow_tee"],
    [FEMALE_STARTER_BODY_ID, "bottom", "avatar_v2_bottom_default"],
    [FEMALE_STARTER_BODY_ID, "bottom", "avatar_v2_bottom_lavender_bow_twill_shorts"],
    [FEMALE_STARTER_BODY_ID, "shoes", "avatar_v2_shoes_milk_tea_court_sneakers"],
    [FEMALE_STARTER_BODY_ID, "shoes", "avatar_v2_shoes_mint_ribbon_court_sneakers"],
    [MALE_STARTER_BODY_ID, "hair", "avatar_v2_hair_male_espresso_crop"],
    [MALE_STARTER_BODY_ID, "hair", "avatar_v2_hair_male_cocoa_textured_quiff"],
    [MALE_STARTER_BODY_ID, "top", "avatar_v2_top_male_powder_blue_crew_tee"],
    [MALE_STARTER_BODY_ID, "top", "avatar_v2_top_male_cream_basic_tee"],
    [MALE_STARTER_BODY_ID, "bottom", "avatar_v2_bottom_male_navy_straight_pants"],
    [MALE_STARTER_BODY_ID, "bottom", "avatar_v2_bottom_male_sage_cuffed_shorts"],
    [MALE_STARTER_BODY_ID, "shoes", "avatar_v2_shoes_male_milk_tea_court"],
    [MALE_STARTER_BODY_ID, "shoes", "avatar_v2_shoes_male_cloud_white_trainers"]
  ] as const).map(([bodyId, type, id], index) =>
    starterItem(bodyId, type, index + 20, { id })
  )
]

function isFree(item: AvatarCatalogItem): boolean {
  return item.ownedByDefault === true
}

function starterIds(bodyId: string, type: StarterCategory): string[] {
  return getAvatarStarterCategoryItems(
    starterCatalog,
    type,
    bodyId,
    isFree
  ).map((item) => item.id)
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

test("female starter styling exposes exactly two free choices in every category", () => {
  assert.deepEqual(starterIds(FEMALE_STARTER_BODY_ID, "hair"), [
    "avatar_v2_hair_mocha_ribbon_blowout",
    "avatar_v2_hair_midnight_french_bob"
  ])
  assert.deepEqual(starterIds(FEMALE_STARTER_BODY_ID, "top"), [
    "avatar_v2_top_default",
    "avatar_v2_top_buttercream_bow_tee"
  ])
  assert.deepEqual(starterIds(FEMALE_STARTER_BODY_ID, "bottom"), [
    "avatar_v2_bottom_default",
    "avatar_v2_bottom_lavender_bow_twill_shorts"
  ])
  assert.deepEqual(starterIds(FEMALE_STARTER_BODY_ID, "shoes"), [
    "avatar_v2_shoes_milk_tea_court_sneakers",
    "avatar_v2_shoes_mint_ribbon_court_sneakers"
  ])
})

test("male starter styling exposes exactly two free choices in every category", () => {
  assert.deepEqual(starterIds(MALE_STARTER_BODY_ID, "hair"), [
    "avatar_v2_hair_male_espresso_crop",
    "avatar_v2_hair_male_cocoa_textured_quiff"
  ])
  assert.deepEqual(starterIds(MALE_STARTER_BODY_ID, "top"), [
    "avatar_v2_top_male_powder_blue_crew_tee",
    "avatar_v2_top_male_cream_basic_tee"
  ])
  assert.deepEqual(starterIds(MALE_STARTER_BODY_ID, "bottom"), [
    "avatar_v2_bottom_male_navy_straight_pants",
    "avatar_v2_bottom_male_sage_cuffed_shorts"
  ])
  assert.deepEqual(starterIds(MALE_STARTER_BODY_ID, "shoes"), [
    "avatar_v2_shoes_male_milk_tea_court",
    "avatar_v2_shoes_male_cloud_white_trainers"
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
    { id: "avatar_v2_bottom_default" }
  )
  const lavenderShorts = starterItem(
    FEMALE_STARTER_BODY_ID,
    "bottom",
    2,
    { id: "avatar_v2_bottom_lavender_bow_twill_shorts" }
  )

  assert.deepEqual(
    getAvatarStarterCategoryItems(
      [leakedPremiumItem, classicShorts, lavenderShorts],
      "bottom",
      FEMALE_STARTER_BODY_ID,
      () => true
    ).map((item) => item.id),
    [
      "avatar_v2_bottom_default",
      "avatar_v2_bottom_lavender_bow_twill_shorts"
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
      item.id.startsWith("avatar_v2_top_male_")
  )

  assert.deepEqual(
    getAvatarStarterCategoryItems(
      [legacyFemaleTop, ...maleTops],
      "top",
      MALE_STARTER_BODY_ID,
      isFree
    ).map((item) => item.id),
    [
      "avatar_v2_top_male_powder_blue_crew_tee",
      "avatar_v2_top_male_cream_basic_tee"
    ]
  )
})

test("Orbit Stylist uses the starter catalog selector instead of every owned wardrobe item", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/screens/AvatarSetupScreen.tsx"),
    "utf8"
  )

  assert.match(
    source,
    /getAvatarStarterCategoryItems\(\s*catalog,\s*type,\s*stageAvatar\.bodyId,\s*canEquipItem\s*\)/
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

test("first profile completion turns an untouched revision-zero avatar into the selected starter", () => {
  const next = buildInitialProfileStarterAvatar({
    avatar: untouchedAvatar,
    canonicalStarterAvatar: untouchedAvatar,
    avatarSetupIncomplete: true,
    starterBodyId: "male-body"
  }, catalog)

  assert.equal(next?.bodyId, "male-body")
  assert.deepEqual(next?.accessoryIds, [])
  assert.equal(untouchedAvatar.bodyId, "female-body")
})

test("first profile completion can replace the server-created revision-one starter", () => {
  const next = buildInitialProfileStarterAvatar({
    avatar: untouchedAvatar,
    canonicalStarterAvatar: untouchedAvatar,
    avatarSetupIncomplete: true,
    starterBodyId: "male-body"
  }, catalog)

  assert.equal(next?.bodyId, "male-body")
})

test("profile review refreshes an untouched canonical starter after the gender changes", () => {
  const next = buildInitialProfileStarterAvatar({
    avatar: untouchedAvatar,
    canonicalStarterAvatar: untouchedAvatar,
    avatarSetupIncomplete: true,
    starterBodyId: "male-body"
  }, catalog)

  assert.equal(next?.bodyId, "male-body")
})

test("profile review never replaces a customized avatar even at revision one", () => {
  const customizedAvatar = { ...untouchedAvatar, hairId: "custom-hair" }

  assert.equal(buildInitialProfileStarterAvatar({
    avatar: customizedAvatar,
    canonicalStarterAvatar: untouchedAvatar,
    avatarSetupIncomplete: true,
    starterBodyId: "male-body"
  }, catalog), null)
  assert.equal(buildInitialProfileStarterAvatar({
    avatar: untouchedAvatar,
    canonicalStarterAvatar: untouchedAvatar,
    avatarSetupIncomplete: false,
    starterBodyId: "male-body"
  }, catalog), null)
})

test("does not create a new canonical revision when the untouched starter already matches", () => {
  assert.equal(buildInitialProfileStarterAvatar({
    avatar: untouchedAvatar,
    canonicalStarterAvatar: untouchedAvatar,
    avatarSetupIncomplete: true,
    starterBodyId: "female-body"
  }, catalog), null)
})
