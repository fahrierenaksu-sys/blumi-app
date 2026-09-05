import type { RoomAvatarOcclusionRole } from "./room/avatarRoom.types"

export type FemaleSweetCapsuleLayerKind = "top" | "bottom" | "shoes"

export interface FemaleSweetCapsuleLayerDefinition {
  readonly kind: FemaleSweetCapsuleLayerKind
  readonly slug: string
  readonly name: string
  readonly priceCoins: number
  readonly sortOrder: number
  readonly profileAssetKey: string
  readonly roomAssetKey: string
  readonly roomMotionAssetKey: string
  readonly visible: boolean
  readonly outfitKey?: string
  readonly pairedItemId?: string
  readonly occlusionRole?: RoomAvatarOcclusionRole
}

const femaleLayer = (
  kind: FemaleSweetCapsuleLayerKind,
  slug: string,
  name: string,
  priceCoins: number,
  sortOrder: number,
  profileAssetKey: string,
  roomAssetKey: string,
  visible = true,
  options: Pick<FemaleSweetCapsuleLayerDefinition, "outfitKey" | "pairedItemId" | "occlusionRole"> = {}
): FemaleSweetCapsuleLayerDefinition => ({
  kind,
  slug,
  name,
  priceCoins,
  sortOrder,
  profileAssetKey,
  roomAssetKey,
  roomMotionAssetKey: roomAssetKey,
  visible,
  ...options
})

export const FEMALE_SWEET_CAPSULE_LAYERS: readonly FemaleSweetCapsuleLayerDefinition[] = [
  femaleLayer("top", "rosebud_picnic_peplum", "Rosebud Picnic Peplum", 80, 100, "topRosebudPicnicPeplum", "topFemaleRosebudPicnicPeplumV2"),
  femaleLayer("top", "lilac_cloud_wrap_top", "Lilac Cloud Wrap Top", 75, 110, "topLilacCloudWrapTop", "topFemaleLilacCloudWrapTopV2"),
  femaleLayer("top", "buttercream_bow_tee", "Buttercream Bow Tee", 60, 120, "topButtercreamBowTee", "topFemaleButtercreamBowTeeV2"),
  femaleLayer("top", "azure_garden_halter", "Azure Garden Halter", 85, 130, "topAzureGardenHalter", "topFemaleAzureGardenHalterV2"),
  femaleLayer("top", "ivory_tweed_crop_jacket", "Ivory Tweed Crop Jacket", 130, 140, "topIvoryTweedCropJacket", "topFemaleIvoryTweedCropJacketV2"),
  femaleLayer("top", "cherry_varsity_cardigan", "Cherry Picnic Cardigan", 120, 150, "topCherryVarsityCardigan", "topFemaleCherryVarsityCardiganV2"),
  femaleLayer("top", "midnight_velvet_bolero", "Midnight Velvet Bolero", 140, 160, "topMidnightVelvetBolero", "topFemaleMidnightVelvetBoleroV2"),
  femaleLayer("bottom", "midnight_ribbon_wide_leg_pants", "Midnight Ribbon Wide-Leg Pants", 460, 100, "bottomMidnightRibbonWideLegPants", "bottomFemaleMidnightRibbonWideLegPantsV2", true, { occlusionRole: "bottomOverShoeUpper" }),
  femaleLayer("bottom", "buttercream_pearl_tailored_pants", "Buttercream Pearl Tailored Pants", 440, 110, "bottomButtercreamPearlTailoredPants", "bottomFemaleButtercreamPearlTailoredPantsV2", true, { occlusionRole: "bottomOverShoeUpper" }),
  femaleLayer("bottom", "rose_picnic_pleated_shorts", "Rose Picnic Pleated Shorts", 360, 120, "bottomRosePicnicPleatedShorts", "bottomFemaleRosePicnicPleatedShortsV2", true, { occlusionRole: "bottomBehindShoes" }),
  femaleLayer("bottom", "lavender_bow_twill_shorts", "Lavender Bow Twill Shorts", 340, 130, "bottomLavenderBowTwillShorts", "bottomFemaleLavenderBowTwillShortsV2", true, { occlusionRole: "bottomBehindShoes" }),
  femaleLayer("shoes", "rose_satin_bow_heels", "Rose Satin Bow Heels", 520, 100, "shoesRoseSatinBowHeels", "shoesFemaleRoseSatinBowHeelsV2"),
  femaleLayer("shoes", "ivory_pearl_slingback_heels", "Ivory Pearl Slingback Heels", 500, 110, "shoesIvoryPearlSlingbackHeels", "shoesFemaleIvoryPearlSlingbackHeelsV2"),
  femaleLayer("shoes", "lilac_star_platform_sneakers", "Lilac Star Platform Sneakers", 480, 120, "shoesLilacStarPlatformSneakers", "shoesFemaleLilacStarPlatformSneakersV2"),
  femaleLayer("shoes", "mint_ribbon_court_sneakers", "Mint Ribbon Court Sneakers", 450, 130, "shoesMintRibbonCourtSneakers", "shoesFemaleMintRibbonCourtSneakersV2"),
  femaleLayer("top", "rose_ribbon_tea_dress", "Rose Ribbon Tea Dress", 190, 180, "topRoseRibbonTeaDress", "topFemaleRoseRibbonTeaDressV2", true, { outfitKey: "rose_ribbon_tea_dress", pairedItemId: "avatar_v2_bottom_rose_ribbon_tea_dress" }),
  femaleLayer("bottom", "rose_ribbon_tea_dress", "Rose Ribbon Tea Dress Skirt", 0, 180, "bottomRoseRibbonTeaDress", "bottomFemaleRoseRibbonTeaDressV2", false, { outfitKey: "rose_ribbon_tea_dress", occlusionRole: "bottomBehindShoes" }),
  femaleLayer("top", "moonlit_velvet_ballet_dress", "Moonlit Velvet Ballet Dress", 220, 190, "topMoonlitVelvetBalletDress", "topFemaleMoonlitVelvetBalletDressV2", true, { outfitKey: "moonlit_velvet_ballet_dress", pairedItemId: "avatar_v2_bottom_moonlit_velvet_ballet_dress" }),
  femaleLayer("bottom", "moonlit_velvet_ballet_dress", "Moonlit Velvet Ballet Dress Skirt", 0, 190, "bottomMoonlitVelvetBalletDress", "bottomFemaleMoonlitVelvetBalletDressV2", false, { outfitKey: "moonlit_velvet_ballet_dress", occlusionRole: "bottomBehindShoes" }),
  femaleLayer("top", "buttercup_picnic_pinafore_dress", "Buttercup Picnic Pinafore Dress", 180, 200, "topButtercupPicnicPinaforeDress", "topFemaleButtercupPicnicPinaforeDressV2", true, { outfitKey: "buttercup_picnic_pinafore_dress", pairedItemId: "avatar_v2_bottom_buttercup_picnic_pinafore_dress" }),
  femaleLayer("bottom", "buttercup_picnic_pinafore_dress", "Buttercup Picnic Pinafore Skirt", 0, 200, "bottomButtercupPicnicPinaforeDress", "bottomFemaleButtercupPicnicPinaforeDressV2", false, { outfitKey: "buttercup_picnic_pinafore_dress", occlusionRole: "bottomBehindShoes" }),
  femaleLayer("top", "lavender_garden_ribbon_dress", "Lavender Garden Ribbon Dress", 200, 210, "topLavenderGardenRibbonDress", "topFemaleLavenderGardenRibbonDressV2", true, { outfitKey: "lavender_garden_ribbon_dress", pairedItemId: "avatar_v2_bottom_lavender_garden_ribbon_dress" }),
  femaleLayer("bottom", "lavender_garden_ribbon_dress", "Lavender Garden Ribbon Dress Skirt", 0, 210, "bottomLavenderGardenRibbonDress", "bottomFemaleLavenderGardenRibbonDressV2", false, { outfitKey: "lavender_garden_ribbon_dress", occlusionRole: "bottomBehindShoes" })
]

export const FEMALE_SWEET_CAPSULE_VISIBLE_LAYERS = FEMALE_SWEET_CAPSULE_LAYERS.filter(
  (item) => item.visible
)
