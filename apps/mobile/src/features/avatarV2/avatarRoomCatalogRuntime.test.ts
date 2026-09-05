import assert from "node:assert/strict"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

const {
  DEFAULT_ROOM_AVATAR_FEMALE,
  DEFAULT_ROOM_AVATAR_MALE,
  MALE_BOTTOMS_BEHIND_SHOES_IDS,
  ROOM_AVATAR_CATALOG,
  ROOM_AVATAR_LAYER_ORDER
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./room/avatarRoom.mock") as typeof import("./room/avatarRoom.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { AVATAR_V2_CATALOG } = require("./avatarV2.mock") as typeof import("./avatarV2.mock")
const {
  DEFAULT_AVATAR_ROOM_PROJECTION_MAP,
  projectAvatarV2ToRoomAvatarAppearance
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")
const {
  getRoomAvatarAssetCoverage,
  getRoomAvatarRenderLayers,
  resolveRoomAvatarAppearance
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./room/avatarRoomSelectors") as typeof import("./room/avatarRoomSelectors")
const {
  resolveRoomAvatarSeatInteractionDecision
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./room/avatarRoomSeatInteraction") as typeof import("./room/avatarRoomSeatInteraction")
const {
  FEMALE_PANTS_OVER_SHOE_UPPER_IDS,
  FEMALE_WARDROBE_QUARANTINED_ITEM_IDS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./room/avatarRoomMotionContract") as typeof import("./room/avatarRoomMotionContract")

const currentMotionIds = new Set([
  "room_avatar_base_male_light_v1",
  "room_avatar_face_male_warm_friendly_v1",
  "room_avatar_hair_front_male_espresso_crop_v1",
  "room_avatar_top_male_powder_blue_crew_tee_v1",
  "room_avatar_bottom_male_navy_straight_pants_v1",
  "room_avatar_shoes_male_milk_tea_court_v1",
  "room_avatar_accessory_female_ivory_ribbon_beret_v2",
  "room_avatar_accessory_female_cherry_bow_headband_v2",
  "room_avatar_accessory_female_sage_heart_glasses_v2",
  "room_avatar_accessory_female_pearl_drop_earrings_v2",
  "room_avatar_accessory_female_golden_heart_locket_v2",
  "room_avatar_accessory_female_buttercream_neck_scarf_v2",
  "room_avatar_accessory_female_cherry_micro_bag_v2",
  "room_avatar_accessory_female_sunny_star_clips_v2",
  "room_avatar_shoes_female_rosewood_platform_loafers_v2",
  "room_avatar_shoes_female_pearl_slingback_sandals_v2",
  "room_avatar_top_female_blush_lace_cardigan_v2",
  "room_avatar_top_female_sage_ribbon_knit_jacket_v2",
  "room_avatar_top_female_powder_blue_ribbon_corset_top_v2",
  "room_avatar_top_female_noir_rose_heart_cardigan_v2"
])

const fittedMaleMotionAppearance = {
  bodyPreset: "male" as const,
  baseId: "room_avatar_base_male_light_v1",
  faceId: "room_avatar_face_male_warm_friendly_v1",
  hairFrontId: "room_avatar_hair_front_male_espresso_crop_v1",
  topId: "room_avatar_top_male_powder_blue_crew_tee_v1",
  bottomId: "room_avatar_bottom_male_navy_straight_pants_v1",
  shoesId: "room_avatar_shoes_male_milk_tea_court_v1",
  accessoryIds: []
}

test("new room wardrobe layers resolve dedicated walking and sitting assets at module load", () => {
  const motionItems = ROOM_AVATAR_CATALOG.filter((item) => currentMotionIds.has(item.id))
  assert.equal(motionItems.length, currentMotionIds.size)
  for (const item of motionItems) {
    assert.ok(item.assetsByMotion?.walking?.front, `${item.id} walking front`)
    assert.ok(item.assetsByMotion?.sitting?.front, `${item.id} sitting front`)
  }
})

test("the fitted male starter stack resolves walking and sitting without static fallbacks", () => {
  const expectedLayerIds = [
    fittedMaleMotionAppearance.baseId,
    fittedMaleMotionAppearance.faceId,
    fittedMaleMotionAppearance.shoesId,
    fittedMaleMotionAppearance.bottomId,
    fittedMaleMotionAppearance.topId,
    fittedMaleMotionAppearance.hairFrontId
  ]

  for (const state of ["walking", "sitting"] as const) {
    const layers = getRoomAvatarRenderLayers({
      appearance: fittedMaleMotionAppearance,
      state,
      direction: "front"
    })
    const coverage = getRoomAvatarAssetCoverage({
      appearance: fittedMaleMotionAppearance,
      state,
      direction: "front"
    })

    assert.deepEqual(layers.map((layer) => layer.id), expectedLayerIds)
    assert.ok(layers.every((layer) => layer.requestedState === state))
    assert.ok(layers.every((layer) => layer.resolvedState === state))
    assert.ok(layers.every((layer) => layer.requestedDirection === "front"))
    assert.ok(layers.every((layer) => layer.resolvedDirection === "front"))
    assert.ok(layers.every((layer) => layer.assetResolutionKind === "exact"))
    assert.ok(layers.every((layer) => layer.usingFallbackAsset === false))
    assert.ok(layers.every((layer) => layer.rigId === "blumi_2_5d_layered_v1"))
    assert.ok(
      layers.every((layer) => layer.fitProfileId === "blumi_male_room_avatar_v1")
    )
    assert.equal(coverage.layerCount, 6)
    assert.equal(coverage.dedicatedLayerCount, 6)
    assert.equal(coverage.fallbackLayerCount, 0)
    assert.deepEqual(coverage.fallbackLayerIds, [])
    assert.equal(coverage.supportsRequestedMotionExactly, true)
    assert.deepEqual(coverage.motionAssetIssueIds, [])
    assert.deepEqual(coverage.blockingLayers, [])
    assert.equal(coverage.isProductionReady, true)
    assert.equal(
      coverage.motionTreatment,
      state === "walking" ? "animatedMotionAssets" : "exactMotionAssets"
    )
  }
})

test("seat interactions fail closed instead of moving an idle avatar to an unsupported direction", () => {
  for (const appearance of [DEFAULT_ROOM_AVATAR_FEMALE, DEFAULT_ROOM_AVATAR_MALE]) {
    const frontCoverage = getRoomAvatarAssetCoverage({
      appearance,
      state: "sitting",
      direction: "front"
    })
    assert.deepEqual(
      resolveRoomAvatarSeatInteractionDecision({
        coverage: frontCoverage,
        seatDirection: "front"
      }),
      {
        canSit: true,
        state: "sitting",
        feedback: "Settled in"
      }
    )

    for (const seatDirection of ["left", "right", "back"] as const) {
      const coverage = getRoomAvatarAssetCoverage({
        appearance,
        state: "sitting",
        direction: seatDirection
      })
      assert.equal(coverage.isProductionReady, false)
      assert.deepEqual(
        resolveRoomAvatarSeatInteractionDecision({
          coverage,
          seatDirection
        }),
        {
          canSit: false,
          state: null,
          feedback: "Turn this seat to front to sit"
        }
      )
    }
  }
})

test("the male walking body and clothes use four-frame motion while head layers stay anchored", () => {
  const layers = getRoomAvatarRenderLayers({
    appearance: fittedMaleMotionAppearance,
    state: "walking",
    direction: "front"
  })
  const byId = new Map(layers.map((layer) => [layer.id, layer]))

  for (const animatedId of [
    fittedMaleMotionAppearance.baseId,
    fittedMaleMotionAppearance.topId,
    fittedMaleMotionAppearance.bottomId,
    fittedMaleMotionAppearance.shoesId
  ]) {
    const frames = byId.get(animatedId)?.animation?.frames
    assert.equal(frames?.length, 4, `${animatedId} four-frame walk`)
    assert.deepEqual(
      frames?.map((frame) => frame.key),
      ["01", "02", "03", "04"].map(
        (frame) => `${animatedId}_walking_front_f${frame}`
      )
    )
    assert.equal(new Set(frames?.map((frame) => frame.source)).size, 4)
    frames?.forEach((frame, index) => {
      assert.match(
        String(frame.source),
        new RegExp(`${animatedId}_walking_front_f0${index + 1}\\.png$`)
      )
    })
  }

  for (const anchoredId of [
    fittedMaleMotionAppearance.faceId,
    fittedMaleMotionAppearance.hairFrontId
  ]) {
    const frames = byId.get(anchoredId)?.animation?.frames
    assert.equal(frames?.length, 4, `${anchoredId} anchored four-frame walk`)
    assert.equal(new Set(frames?.map((frame) => frame.key)).size, 4)
    assert.equal(new Set(frames?.map((frame) => frame.source)).size, 1)
  }
})

test("the male sitting face and hair keep the same rigid-head source", () => {
  const sittingLayers = getRoomAvatarRenderLayers({
    appearance: fittedMaleMotionAppearance,
    state: "sitting",
    direction: "front"
  })
  const byId = new Map(sittingLayers.map((layer) => [layer.id, layer]))

  for (const anchoredId of [
    fittedMaleMotionAppearance.faceId,
    fittedMaleMotionAppearance.hairFrontId
  ]) {
    const catalogItem = ROOM_AVATAR_CATALOG.find((item) => item.id === anchoredId)
    const sittingLayer = byId.get(anchoredId)
    assert.ok(catalogItem)
    assert.equal(sittingLayer?.assetResolutionKind, "exact")
    assert.equal(sittingLayer?.asset.source, catalogItem.asset.source)
  }

  for (const fittedId of [
    fittedMaleMotionAppearance.baseId,
    fittedMaleMotionAppearance.topId,
    fittedMaleMotionAppearance.bottomId,
    fittedMaleMotionAppearance.shoesId
  ]) {
    const catalogItem = ROOM_AVATAR_CATALOG.find((item) => item.id === fittedId)
    const sittingLayer = byId.get(fittedId)
    assert.ok(catalogItem)
    assert.equal(sittingLayer?.animation, undefined)
    assert.notEqual(sittingLayer?.asset.source, catalogItem.asset.source)
    assert.match(String(sittingLayer?.asset.source), new RegExp(`${fittedId}_sitting_front_f01\\.png$`))
  }
})

test("premium female hairstyles use their dedicated four-frame walk and sitting art", () => {
  const fittedHairIds = [
    "room_avatar_hair_back_female_cocoa_cloud_ponytail_v2",
    "room_avatar_hair_front_female_cocoa_cloud_ponytail_v2",
    "room_avatar_hair_back_female_espresso_sleek_ribbon_pony_v2",
    "room_avatar_hair_front_female_espresso_sleek_ribbon_pony_v2",
    "room_avatar_hair_back_female_cherry_ribbon_twin_braids_v2",
    "room_avatar_hair_front_female_cherry_ribbon_twin_braids_v2",
    "room_avatar_hair_back_female_rosewood_butterfly_layers_v2",
    "room_avatar_hair_front_female_rosewood_butterfly_layers_v2",
    "room_avatar_hair_back_female_caramel_braided_crown_v2",
    "room_avatar_hair_front_female_caramel_braided_crown_v2",
    "room_avatar_hair_back_female_berry_velvet_soft_updo_v2",
    "room_avatar_hair_front_female_berry_velvet_soft_updo_v2"
  ]

  for (const fittedId of fittedHairIds) {
    const item = ROOM_AVATAR_CATALOG.find((candidate) => candidate.id === fittedId)
    assert.ok(item, fittedId)
    const walkingFront = item.assetsByMotion?.walking?.front
    assert.ok(walkingFront && "frames" in walkingFront, `${fittedId} walking`)
    assert.equal(walkingFront.frames.length, 4)
    assert.equal(new Set(walkingFront.frames.map((frame) => frame.source)).size, 4)
    walkingFront.frames.forEach((frame, index) => {
      assert.match(
        String(frame.source),
        new RegExp(`${fittedId}_walking_front_f0${index + 1}\\.png$`)
      )
    })

    const sittingFront = item.assetsByMotion?.sitting?.front
    assert.ok(sittingFront && !("frames" in sittingFront), `${fittedId} sitting`)
    assert.notEqual(sittingFront.source, item.asset.source)
    assert.match(
      String(sittingFront.source),
      new RegExp(`${fittedId}_sitting_front_f01\\.png$`)
    )
  }
})

test("every visible wardrobe item has a non-empty room projection", () => {
  const wardrobeTypes = new Set([
    "body",
    "eyes",
    "nose",
    "mouth",
    "hair",
    "top",
    "bottom",
    "shoes",
    "accessory"
  ])
  const visibleItems = AVATAR_V2_CATALOG.filter(
    (item) => wardrobeTypes.has(item.type) && item.hiddenFromWardrobe !== true
  )

  for (const item of visibleItems) {
    const projection = DEFAULT_AVATAR_ROOM_PROJECTION_MAP[item.id]
    assert.ok(projection, `${item.id} projection`)
    if (item.type === "body") {
      assert.ok(projection.bodyPreset, `${item.id} body preset`)
    } else if (item.type === "eyes") {
      assert.ok(projection.eyesId, `${item.id} eyes layer`)
    } else if (item.type === "nose") {
      assert.ok(projection.noseId, `${item.id} nose layer`)
    } else if (item.type === "mouth") {
      assert.ok(projection.mouthId, `${item.id} mouth layer`)
    } else if (item.type === "hair") {
      assert.ok(projection.hairFrontId || projection.hairId, `${item.id} hair layer`)
    } else if (item.type === "top") {
      assert.ok(projection.topId, `${item.id} top layer`)
    } else if (item.type === "bottom") {
      assert.ok(projection.bottomId, `${item.id} bottom layer`)
    } else if (item.type === "shoes") {
      assert.ok(projection.shoesId, `${item.id} shoes layer`)
    } else {
      assert.ok(projection.accessoryIds?.length, `${item.id} accessory layer`)
    }
  }
})

test("the default female room avatar is fully dressed", () => {
  assert.equal(
    DEFAULT_ROOM_AVATAR_FEMALE.topId,
    "room_avatar_top_female_cream_basic_tee_v2"
  )
  assert.equal(
    DEFAULT_ROOM_AVATAR_FEMALE.bottomId,
    "room_avatar_bottom_female_denim_skort_shorts_v2"
  )
  assert.equal(
    DEFAULT_ROOM_AVATAR_FEMALE.shoesId,
    "room_avatar_shoes_female_milk_tea_court_sneakers_v2"
  )
})

test("the default male room avatar uses an independent fitted starter stack", () => {
  assert.deepEqual(DEFAULT_ROOM_AVATAR_MALE, {
    bodyPreset: "male",
    baseId: "room_avatar_base_male_light_v1",
    faceId: "room_avatar_face_male_warm_friendly_v1",
    hairBackId: undefined,
    hairFrontId: "room_avatar_hair_front_male_espresso_crop_v1",
    topId: "room_avatar_top_male_powder_blue_crew_tee_v1",
    bottomId: "room_avatar_bottom_male_navy_straight_pants_v1",
    shoesId: "room_avatar_shoes_male_milk_tea_court_v1",
    accessoryIds: []
  })

  const maleItems = ROOM_AVATAR_CATALOG.filter((item) => item.bodyPreset === "male")
  const maleItemIds = new Set(maleItems.map((item) => item.id))
  for (const defaultItemId of [
    DEFAULT_ROOM_AVATAR_MALE.baseId,
    DEFAULT_ROOM_AVATAR_MALE.faceId,
    DEFAULT_ROOM_AVATAR_MALE.hairFrontId,
    DEFAULT_ROOM_AVATAR_MALE.topId,
    DEFAULT_ROOM_AVATAR_MALE.bottomId,
    DEFAULT_ROOM_AVATAR_MALE.shoesId
  ]) {
    assert.ok(maleItemIds.has(defaultItemId!), `${defaultItemId} male starter layer`)
  }
  assert.ok(maleItems.every((item) => item.fitProfileId === "blumi_male_room_avatar_v1"))
})

test("room snapshots fail closed when a female accessory is supplied to a male avatar", () => {
  const appearance = resolveRoomAvatarAppearance({
    ...DEFAULT_ROOM_AVATAR_MALE,
    accessoryIds: ["room_avatar_accessory_female_sage_heart_glasses_v2"]
  })
  assert.deepEqual(appearance.accessoryIds, [])
  assert.equal(
    getRoomAvatarRenderLayers({
      appearance: {
        ...DEFAULT_ROOM_AVATAR_MALE,
        accessoryIds: ["room_avatar_accessory_female_sage_heart_glasses_v2"]
      }
    }).some((layer) => layer.id === "room_avatar_accessory_female_sage_heart_glasses_v2"),
    false
  )
})

test("the free masculine crew tee projects and renders only on the male fitted stack", () => {
  const topId = "avatar_v2_top_male_powder_blue_crew_tee"
  const roomTopId = "room_avatar_top_male_powder_blue_crew_tee_v1"
  const roomTop = ROOM_AVATAR_CATALOG.find((item) => item.id === roomTopId)

  assert.equal(roomTop?.bodyPreset, "male")
  assert.equal(roomTop?.fitProfileId, "blumi_male_room_avatar_v1")
  assert.match(String(roomTop?.asset.source), /avatar_room_top_male_powder_blue_crew_tee_v1\.png$/)

  const { appearance, unmappedItemIds } = projectAvatarV2ToRoomAvatarAppearance({
    avatar: {
      bodyId: "avatar_v2_body_male_light",
      faceId: "avatar_v2_face_male_warm_friendly",
      eyesId: "avatar_v2_eyes_male_warm_brown",
      noseId: "avatar_v2_nose_male_gentle_bridge",
      mouthId: "avatar_v2_mouth_male_soft_smile",
      hairId: "avatar_v2_hair_male_espresso_crop",
      topId,
      bottomId: "avatar_v2_bottom_male_sage_cuffed_shorts",
      shoesId: "avatar_v2_shoes_male_milk_tea_court",
      accessoryIds: []
    }
  })

  assert.deepEqual(unmappedItemIds, [])
  assert.equal(appearance.topId, roomTopId)
  const layers = getRoomAvatarRenderLayers({ appearance })
  assert.ok(layers.some((layer) => layer.id === roomTopId))
  assert.ok(layers.every((layer) => !layer.id.includes("female")))
})

test("the free navy straight pants project above the shoes on the male fitted stack", () => {
  const bottomId = "avatar_v2_bottom_male_navy_straight_pants"
  const roomBottomId = "room_avatar_bottom_male_navy_straight_pants_v1"
  const roomBottom = ROOM_AVATAR_CATALOG.find((item) => item.id === roomBottomId)
  const shoes = ROOM_AVATAR_CATALOG.find(
    (item) => item.id === DEFAULT_ROOM_AVATAR_MALE.shoesId
  )

  assert.equal(roomBottom?.bodyPreset, "male")
  assert.equal(roomBottom?.fitProfileId, "blumi_male_room_avatar_v1")
  assert.equal(roomBottom?.occlusionRole, "bottomOverShoeUpper")
  assert.match(String(roomBottom?.asset.source), /avatar_room_bottom_male_navy_straight_pants_v1\.png$/)
  assert.ok(roomBottom!.layerOrder > shoes!.layerOrder)

  const { appearance, unmappedItemIds } = projectAvatarV2ToRoomAvatarAppearance({
    avatar: {
      bodyId: "avatar_v2_body_male_light",
      faceId: "avatar_v2_face_male_warm_friendly",
      eyesId: "avatar_v2_eyes_male_warm_brown",
      noseId: "avatar_v2_nose_male_gentle_bridge",
      mouthId: "avatar_v2_mouth_male_soft_smile",
      hairId: "avatar_v2_hair_male_espresso_crop",
      topId: "avatar_v2_top_male_powder_blue_crew_tee",
      bottomId,
      shoesId: "avatar_v2_shoes_male_milk_tea_court",
      accessoryIds: []
    }
  })

  assert.deepEqual(unmappedItemIds, [])
  assert.equal(appearance.bottomId, roomBottomId)
  const layers = getRoomAvatarRenderLayers({ appearance })
  const shoesIndex = layers.findIndex((layer) => layer.id === DEFAULT_ROOM_AVATAR_MALE.shoesId)
  const pantsIndex = layers.findIndex((layer) => layer.id === roomBottomId)
  const topIndex = layers.findIndex((layer) => layer.id === appearance.topId)
  assert.ok(shoesIndex >= 0)
  assert.ok(shoesIndex < pantsIndex)
  assert.ok(pantsIndex < topIndex)
})

test("reviewed charcoal chinos preserve fit behind the shoe upper", () => {
  const charcoalId = "room_avatar_bottom_male_charcoal_tapered_chinos_v1"
  const shoes = ROOM_AVATAR_CATALOG.find(
    (item) => item.id === DEFAULT_ROOM_AVATAR_MALE.shoesId
  )
  const charcoal = ROOM_AVATAR_CATALOG.find((item) => item.id === charcoalId)

  assert.ok(shoes)
  assert.ok(charcoal)
  assert.deepEqual([...MALE_BOTTOMS_BEHIND_SHOES_IDS], [charcoalId])
  assert.equal(charcoal.occlusionRole, "bottomBehindShoes")
  assert.ok(charcoal.layerOrder < shoes.layerOrder)
})

test("female trouser hems cover only the shoe upper", () => {
  const layers = getRoomAvatarRenderLayers({
    appearance: {
      ...DEFAULT_ROOM_AVATAR_FEMALE,
      bottomId: "room_avatar_bottom_female_black_palm_embellished_pants_v2"
    }
  })
  const bottomIndex = layers.findIndex(
    (layer) => layer.id === "room_avatar_bottom_female_black_palm_embellished_pants_v2"
  )
  const shoesIndex = layers.findIndex(
    (layer) => layer.id === DEFAULT_ROOM_AVATAR_FEMALE.shoesId
  )

  assert.ok(bottomIndex >= 0)
  assert.ok(shoesIndex >= 0)
  assert.ok(shoesIndex < bottomIndex)
  assert.equal(
    layers[bottomIndex]?.layerOrder,
    ROOM_AVATAR_LAYER_ORDER.shoes + 1
  )
})

test("female shorts keep their hem behind the shoe upper", () => {
  const layers = getRoomAvatarRenderLayers({ appearance: DEFAULT_ROOM_AVATAR_FEMALE })
  const bottomIndex = layers.findIndex(
    (layer) => layer.id === DEFAULT_ROOM_AVATAR_FEMALE.bottomId
  )
  const shoesIndex = layers.findIndex(
    (layer) => layer.id === DEFAULT_ROOM_AVATAR_FEMALE.shoesId
  )

  assert.ok(bottomIndex >= 0)
  assert.ok(shoesIndex >= 0)
  assert.ok(bottomIndex < shoesIndex)
})

test("reviewed split accessories are wired directly into the production catalog", () => {
  const reviewed = [
    ["room_avatar_accessory_female_cherry_micro_bag_v2", ["bag-back", "strap-back", "bag-front"]],
    ["room_avatar_accessory_female_pearl_drop_earrings_v2", ["earring-rear", "pearl-front"]],
    ["room_avatar_accessory_female_sunny_star_clips_v2", ["clips-front"]]
  ] as const

  for (const [id, expectedParts] of reviewed) {
    const item = ROOM_AVATAR_CATALOG.find((entry) => entry.id === id)
    assert.ok(item, id)
    assert.deepEqual(item.accessoryLayerParts?.map((part) => part.id), expectedParts)
    for (const part of item.accessoryLayerParts ?? []) {
      assert.doesNotMatch(part.asset.key, /qa\//)
      const walkingFront = part.assetsByMotion?.walking?.front
      assert.ok(walkingFront && "frames" in walkingFront)
      assert.equal(walkingFront.frames.length, 4)
      assert.ok(part.assetsByMotion?.sitting?.front)
    }
  }
})

test("split accessories resolve rear parts below hair front and front parts above it", () => {
  const microBagId = "room_avatar_accessory_female_cherry_micro_bag_v2"
  const layers = getRoomAvatarRenderLayers({
    appearance: {
      ...DEFAULT_ROOM_AVATAR_FEMALE,
      accessoryIds: [microBagId]
    },
    state: "walking",
    direction: "front"
  })
  const strapIndex = layers.findIndex((layer) => layer.id === `${microBagId}:strap-back`)
  const hairFrontIndex = layers.findIndex(
    (layer) => layer.id === DEFAULT_ROOM_AVATAR_FEMALE.hairFrontId
  )
  const bagIndex = layers.findIndex((layer) => layer.id === `${microBagId}:bag-front`)
  const bagBackIndex = layers.findIndex((layer) => layer.id === `${microBagId}:bag-back`)

  assert.ok(strapIndex >= 0)
  assert.ok(hairFrontIndex >= 0)
  assert.ok(bagIndex >= 0)
  assert.ok(bagBackIndex >= 0)
  assert.ok(bagBackIndex < strapIndex)
  assert.ok(strapIndex < hairFrontIndex)
  assert.ok(hairFrontIndex < bagIndex)
  assert.equal(layers[strapIndex]?.animation?.frames.length, 4)
  assert.equal(layers[bagIndex]?.animation?.frames.length, 4)
  assert.equal(layers[bagBackIndex]?.animation?.frames.length, 4)
  assert.match(layers[strapIndex]?.asset.key ?? "", /strap-back/)
  assert.match(layers[bagIndex]?.asset.key ?? "", /bag-front/)
  assert.match(layers[bagBackIndex]?.asset.key ?? "", /bag-back/)
})

test("male headwear accessories resolve behind the front hair layer", () => {
  const beanieId = "room_avatar_accessory_male_soft_patch_beanie_v1"
  const layers = getRoomAvatarRenderLayers({
    appearance: {
      ...DEFAULT_ROOM_AVATAR_MALE,
      accessoryIds: [beanieId]
    },
    state: "walking",
    direction: "front"
  })
  const beanieIndex = layers.findIndex((layer) => layer.id === `${beanieId}:headwear-back`)
  const hairFrontIndex = layers.findIndex(
    (layer) => layer.id === DEFAULT_ROOM_AVATAR_MALE.hairFrontId
  )

  assert.ok(beanieIndex >= 0)
  assert.ok(hairFrontIndex >= 0)
  assert.ok(beanieIndex < hairFrontIndex)
  assert.equal(layers[beanieIndex]?.animation?.frames.length, 4)
  assert.match(layers[beanieIndex]?.asset.key ?? "", /soft_patch_beanie/)
})

test("earring and hair-clip production splits preserve their reviewed composite order", () => {
  const cases = [
    {
      id: "room_avatar_accessory_female_pearl_drop_earrings_v2",
      behind: "earring-rear",
      front: "pearl-front"
    },
    {
      id: "room_avatar_accessory_female_sunny_star_clips_v2",
      front: "clips-front"
    }
  ] as const

  for (const item of cases) {
    const layers = getRoomAvatarRenderLayers({
      appearance: {
        ...DEFAULT_ROOM_AVATAR_FEMALE,
        accessoryIds: [item.id]
      },
      state: "sitting",
      direction: "front"
    })
    const hairFrontIndex = layers.findIndex(
      (layer) => layer.id === DEFAULT_ROOM_AVATAR_FEMALE.hairFrontId
    )
    const frontIndex = layers.findIndex(
      (layer) => layer.id === `${item.id}:${item.front}`
    )
    assert.ok(hairFrontIndex >= 0)
    assert.ok(frontIndex > hairFrontIndex)
    assert.ok(layers[frontIndex]?.asset.key.includes("_part_"))
    if ("behind" in item) {
      const behindIndex = layers.findIndex(
        (layer) => layer.id === `${item.id}:${item.behind}`
      )
      assert.ok(behindIndex >= 0)
      assert.ok(behindIndex < hairFrontIndex)
      assert.ok(layers[behindIndex]?.asset.key.includes("_part_"))
    }
  }
})

test("quarantined female legacy crops cannot resolve into a room stack", () => {
  for (const id of FEMALE_WARDROBE_QUARANTINED_ITEM_IDS) {
    assert.equal(ROOM_AVATAR_CATALOG.some((item) => item.id === id), false, id)
  }
})

test("a promotion-hold wearable stays out of live wardrobe and shop surfaces", () => {
  const heldRoomId = "room_avatar_top_female_cherry_heart_milkmaid_blouse_v2"
  const heldAvatarId = "avatar_v2_top_cherry_heart_milkmaid_blouse"

  assert.equal(FEMALE_WARDROBE_QUARANTINED_ITEM_IDS.has(heldRoomId), true)
  assert.equal(ROOM_AVATAR_CATALOG.some((item) => item.id === heldRoomId), false)
  const heldAvatar = AVATAR_V2_CATALOG.find((item) => item.id === heldAvatarId)
  assert.ok(heldAvatar)
  assert.equal(heldAvatar.hiddenFromShop, true)
  assert.equal(heldAvatar.hiddenFromWardrobe, true)
})

test("female trouser occlusion is driven by the shared promotion contract", () => {
  const actualOverShoeIds = ROOM_AVATAR_CATALOG
    .filter(
      (item) => item.bodyPreset === "female" &&
        item.type === "bottom" &&
        item.occlusionRole === "bottomOverShoeUpper"
    )
    .map((item) => item.id)
    .sort()

  assert.deepEqual(actualOverShoeIds, [...FEMALE_PANTS_OVER_SHOE_UPPER_IDS].sort())
})

test("promoted female wardrobe layers carry an explicit rig and fit profile", () => {
  const visibleFemaleWearables = ROOM_AVATAR_CATALOG.filter(
    (item) => item.bodyPreset === "female" &&
      ["top", "bottom", "shoes", "accessory"].includes(item.type)
  )

  assert.ok(visibleFemaleWearables.length > 0)
  for (const item of visibleFemaleWearables) {
    assert.equal(item.rigId, "blumi_2_5d_layered_v1", item.id)
    assert.equal(item.fitProfileId, "blumi_female_room_avatar_v1", item.id)
  }
})

test("a persisted cream and sage male loadout keeps its selected layers", () => {
  const { appearance, unmappedItemIds } = projectAvatarV2ToRoomAvatarAppearance({
    avatar: {
      bodyId: "avatar_v2_body_male_light",
      faceId: "avatar_v2_face_male_warm_friendly",
      eyesId: "avatar_v2_eyes_male_warm_brown",
      noseId: "avatar_v2_nose_male_gentle_bridge",
      mouthId: "avatar_v2_mouth_male_soft_smile",
      hairId: "avatar_v2_hair_male_espresso_crop",
      topId: "avatar_v2_top_male_cream_basic_tee",
      bottomId: "avatar_v2_bottom_male_sage_cuffed_shorts",
      shoesId: "avatar_v2_shoes_male_milk_tea_court",
      accessoryIds: []
    }
  })

  assert.equal(appearance.bodyPreset, "male")
  assert.equal(appearance.baseId, DEFAULT_ROOM_AVATAR_MALE.baseId)
  assert.equal(appearance.faceId, DEFAULT_ROOM_AVATAR_MALE.faceId)
  assert.equal(appearance.hairBackId, undefined)
  assert.equal(appearance.hairFrontId, DEFAULT_ROOM_AVATAR_MALE.hairFrontId)
  assert.equal(appearance.eyesId, undefined)
  assert.equal(appearance.noseId, undefined)
  assert.equal(appearance.mouthId, undefined)
  assert.equal(appearance.topId, "room_avatar_top_male_cream_basic_tee_v1")
  assert.equal(appearance.bottomId, "room_avatar_bottom_male_sage_cuffed_shorts_v1")
  assert.equal(appearance.shoesId, DEFAULT_ROOM_AVATAR_MALE.shoesId)
  assert.deepEqual(appearance.accessoryIds, [])
  assert.deepEqual(unmappedItemIds, [])
  const layers = getRoomAvatarRenderLayers({ appearance })
  assert.ok(layers.length >= 6)
  assert.ok(layers.every((layer) => layer.fitProfileId === "blumi_male_room_avatar_v1"))
  assert.ok(layers.every((layer) => !layer.id.includes("female")))
})
