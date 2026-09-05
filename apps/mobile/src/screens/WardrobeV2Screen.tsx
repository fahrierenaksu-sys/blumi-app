import Ionicons from "@expo/vector-icons/Ionicons"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { isAvatarV2ItemEquipped } from "../features/avatarV2/avatarV2Selectors"
import { AvatarPreview2D } from "../features/avatarV2/components/AvatarPreview2D"
import { roomAvatarLayerAssets } from "../features/avatarV2/room/avatarRoomAssets"
import { MALE_CAPSULE_PREVIEW_SOURCES } from "../features/avatarV2/maleCapsulePreviewSources"
import {
  FEMALE_SWEET_CAPSULE_RIG_PREVIEW_SOURCES,
  FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES
} from "../features/avatarV2/femaleSweetCapsulePreviewSources"
import { getMaleRigLayerThumbnailPresentation } from "../features/avatarV2/maleRigThumbnailPresentation"
import { isAvatarV2ItemCompatibleWithBody } from "../features/avatarV2/avatarBodyCompatibility"
import { PREMIUM_FACE_PREVIEW_SOURCES } from "../features/avatarV2/avatarV2PreviewAssets"
import { DEFAULT_AVATAR_ROOM_PROJECTION_MAP } from "../features/avatarV2/room/avatarRoomProjection"
import { getAvatarAutomationSlug } from "../features/avatarV2/qa/avatarQaInventory"
import type { AvatarCatalogItem, AvatarItemType } from "../features/avatarV2/avatarV2.types"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { buildAvatarShopCatalogItem } from "../features/shop/shopCatalog"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { hapticError, hapticLight, hapticSuccess } from "../ui/haptics"
import { uiTheme } from "../ui/theme"
import { captureProductEvent } from "../analytics/productAnalytics"
import { getAppLocale } from "../features/session/authLocale"
import {
  getWardrobeCarouselProgress,
  getWardrobeCarouselItemLayout,
  getAvatarStudioCategories,
  getAvatarStudioDefaultCategory,
  getWardrobeCategoryItems,
  getWardrobeVisibleSlots,
  shouldUseWardrobeVerticalFallback,
  shouldUseWardrobeSlotCompactLayout,
  AVATAR_STUDIO_SECTIONS,
  type AvatarStudioSectionId,
  type WardrobeCategoryId
} from "../features/avatarV2/wardrobeCategoryModel"
import { getWardrobeThumbnailPresentation } from "../features/avatarV2/wardrobeThumbnailPresentation"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"
import { WardrobeCarouselProgress } from "./components/WardrobeCarouselProgress"
import { WardrobeEquippedSlotsRail } from "./components/WardrobeEquippedSlotsRail"

type WardrobeV2ScreenProps = NativeStackScreenProps<RootStackParamList, "WardrobeV2">

const AVATAR_STUDIO_COPY = {
  en: {
    title: "Blumi",
    subtitle: "Live Closet",
    progress: "2 / 4",
    appearance: "Avatar",
    closet: "My Closet",
    body: "Bases",
    face: "Face",
    eyes: "Eyes",
    nose: "Nose",
    mouth: "Lips",
    hair: "Hair",
    top: "Tops",
    dress: "Dresses",
    bottom: "Bottoms",
    shoes: "Shoes",
    accessory: "Extras",
    sectionA11ySuffix: "section",
    categoryA11ySuffix: "Avatar Studio category",
    bodySwitchHint: "Switching your base refits the complete starter look."
  },
  tr: {
    title: "Blumi",
    subtitle: "Canlı Gardırop",
    progress: "2 / 4",
    appearance: "Avatar",
    closet: "Dolabım",
    body: "Bazlar",
    face: "Yüz",
    eyes: "Gözler",
    nose: "Burun",
    mouth: "Ağız",
    hair: "Saç",
    top: "Üstler",
    dress: "Elbiseler",
    bottom: "Altlar",
    shoes: "Ayakkabılar",
    accessory: "Ekstralar",
    sectionA11ySuffix: "bölümünü aç",
    categoryA11ySuffix: "Avatar Stüdyosu kategorisini aç",
    bodySwitchHint: "Bazı değiştirince başlangıç görünümü birlikte yeniden uyarlanır."
  }
} as const

const CATEGORY_ICONS: Record<AvatarItemType, keyof typeof Ionicons.glyphMap> = {
  body: "body",
  face: "happy",
  eyes: "eye",
  nose: "ellipse",
  mouth: "chatbubble-ellipses",
  hair: "sparkles",
  top: "shirt",
  bottom: "layers",
  shoes: "walk",
  accessory: "glasses"
}

const WARDROBE_CATEGORY_ICONS: Record<
  WardrobeCategoryId,
  keyof typeof Ionicons.glyphMap
> = {
  body: "body",
  face: "happy",
  top: "shirt",
  dress: "sparkles",
  bottom: "layers",
  shoes: "walk",
  eyes: "eye",
  nose: "ellipse",
  mouth: "chatbubble-ellipses",
  hair: "cut",
  accessory: "glasses"
}

const AVATAR_ITEM_PREVIEW_SOURCES: Partial<Record<string, ImageSourcePropType>> = {
  ...MALE_CAPSULE_PREVIEW_SOURCES,
  ...FEMALE_SWEET_CAPSULE_RIG_PREVIEW_SOURCES,
  ...PREMIUM_FACE_PREVIEW_SOURCES,
  avatar_v2_eyes_mocha_doe:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_eyes_mocha_doe.png"),
  avatar_v2_eyes_sage_glass:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_eyes_sage_glass.png"),
  avatar_v2_eyes_twilight_plum:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_eyes_twilight_plum.png"),
  avatar_v2_nose_soft_button:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_nose_soft_button.png"),
  avatar_v2_nose_petal_curve:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_nose_petal_curve.png"),
  avatar_v2_nose_gentle_bridge:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_nose_gentle_bridge.png"),
  avatar_v2_mouth_peach_whisper_smile:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_mouth_peach_whisper_smile.png"),
  avatar_v2_mouth_rose_gloss_smile:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_mouth_rose_gloss_smile.png"),
  avatar_v2_mouth_berry_soft_kiss:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_mouth_berry_soft_kiss.png"),
  avatar_v2_hair_mocha_ribbon_blowout:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_mocha_ribbon_blowout.png"),
  avatar_v2_hair_midnight_french_bob:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_midnight_french_bob.png"),
  avatar_v2_hair_honey_halfup_waves:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_honey_halfup_waves.png"),
  avatar_v2_hair_cherry_ribbon_twin_braids:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_cherry_ribbon_twin_braids.png"),
  avatar_v2_hair_rosewood_butterfly_layers:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_rosewood_butterfly_layers.png"),
  avatar_v2_hair_caramel_braided_crown:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_caramel_braided_crown.png"),
  avatar_v2_hair_berry_velvet_soft_updo:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_berry_velvet_soft_updo.png"),
  avatar_v2_hair_chestnut_butterfly_bob:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_chestnut_butterfly_bob.png"),
  avatar_v2_hair_golden_waves:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_golden_waves.png"),
  avatar_v2_hair_ink_pageboy_star:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_ink_pageboy_star.png"),
  avatar_v2_hair_ink_twin_braids:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_ink_twin_braids.png"),
  avatar_v2_hair_pale_golden_bow_bob:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_pale_golden_bow_bob.png"),
  avatar_v2_hair_copper_bow_waves:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_hair_copper_bow_waves.png"),
  avatar_v2_face_warm_peach_foundation:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_face_warm_peach_foundation.png"),
  avatar_v2_face_rose_heart_foundation:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_face_rose_heart_foundation.png"),
  avatar_v2_top_default: roomAvatarLayerAssets.topFemaleCreamBasicTeeV2.source,
  avatar_v2_top_blush_lace_cardigan:
    roomAvatarLayerAssets.topFemaleBlushLaceCardiganV2.source,
  avatar_v2_top_sage_ribbon_knit_jacket:
    roomAvatarLayerAssets.topFemaleSageRibbonKnitJacketV2.source,
  avatar_v2_top_cherry_heart_milkmaid_blouse:
    roomAvatarLayerAssets.topFemaleCherryHeartMilkmaidBlouseV2.source,
  avatar_v2_top_powder_blue_ribbon_corset_top:
    roomAvatarLayerAssets.topFemalePowderBlueRibbonCorsetTopV2.source,
  avatar_v2_top_noir_rose_heart_cardigan:
    roomAvatarLayerAssets.topFemaleNoirRoseHeartCardiganV2.source,
  avatar_v2_bottom_default: roomAvatarLayerAssets.bottomFemaleDenimSkortShortsV2.source,
  avatar_v2_shoes_milk_tea_court_sneakers: roomAvatarLayerAssets.shoesFemaleMilkTeaCourtSneakersV2.source,
  avatar_v2_shoes_cherry_satin_ballets:
    roomAvatarLayerAssets.shoesFemaleCherrySatinBalletsV2.source,
  avatar_v2_shoes_onyx_heart_mary_janes:
    roomAvatarLayerAssets.shoesFemaleOnyxHeartMaryJanesV2.source,
  avatar_v2_shoes_rosewood_platform_loafers:
    roomAvatarLayerAssets.shoesFemaleRosewoodPlatformLoafersV2.source,
  avatar_v2_shoes_pearl_slingback_sandals:
    roomAvatarLayerAssets.shoesFemalePearlSlingbackSandalsV2.source,
  avatar_v2_top_boho_patchwork_maxi_dress:
    roomAvatarLayerAssets.topFemaleBohoPatchworkMaxiDressV2.source,
  avatar_v2_bottom_boho_patchwork_maxi_dress:
    roomAvatarLayerAssets.bottomFemaleBohoPatchworkMaxiDressV2.source,
  avatar_v2_top_embroidered_halter_wrap_dress:
    roomAvatarLayerAssets.topFemaleEmbroideredHalterWrapDressV2.source,
  avatar_v2_bottom_embroidered_halter_wrap_dress:
    roomAvatarLayerAssets.bottomFemaleEmbroideredHalterWrapDressV2.source,
  avatar_v2_top_ruched_patchwork_mini_dress:
    roomAvatarLayerAssets.topFemaleRuchedPatchworkMiniDressV2.source,
  avatar_v2_bottom_ruched_patchwork_mini_dress:
    roomAvatarLayerAssets.bottomFemaleRuchedPatchworkMiniDressV2.source,
  avatar_v2_top_white_lace_cami_mini_dress:
    roomAvatarLayerAssets.topFemaleWhiteLaceCamiMiniDressV2.source,
  avatar_v2_bottom_white_lace_cami_mini_dress:
    roomAvatarLayerAssets.bottomFemaleWhiteLaceCamiMiniDressV2.source,
  avatar_v2_accessory_ivory_ribbon_beret:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_ivory_ribbon_beret.png"),
  avatar_v2_accessory_cherry_bow_headband:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_cherry_bow_headband.png"),
  avatar_v2_accessory_sage_heart_glasses:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_sage_heart_glasses.png"),
  avatar_v2_accessory_rose_round_glasses:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_rose_round_glasses.png"),
  avatar_v2_accessory_lavender_pearl_cat_eye_glasses:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_lavender_pearl_cat_eye_glasses.png"),
  avatar_v2_accessory_mint_star_oval_glasses:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_mint_star_oval_glasses.png"),
  avatar_v2_accessory_honey_blossom_square_glasses:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_honey_blossom_square_glasses.png"),
  avatar_v2_accessory_pearl_drop_earrings:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_pearl_drop_earrings.png"),
  avatar_v2_accessory_golden_heart_locket:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_golden_heart_locket.png"),
  avatar_v2_accessory_buttercream_neck_scarf:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_buttercream_neck_scarf.png"),
  avatar_v2_accessory_cherry_micro_bag:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_cherry_micro_bag.png"),
  avatar_v2_accessory_sunny_star_clips:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_accessory_sunny_star_clips.png")
}

const WARDROBE_SQUARE_THUMBNAIL_SOURCES: Partial<Record<string, ImageSourcePropType>> = {
  ...FEMALE_SWEET_CAPSULE_SQUARE_THUMBNAIL_SOURCES,
  avatar_v2_top_blush_lace_cardigan:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_top_blush_lace_cardigan.png"),
  avatar_v2_top_sage_ribbon_knit_jacket:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_top_sage_ribbon_knit_jacket.png"),
  avatar_v2_top_cherry_heart_milkmaid_blouse:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_top_cherry_heart_milkmaid_blouse.png"),
  avatar_v2_top_powder_blue_ribbon_corset_top:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_top_powder_blue_ribbon_corset_top.png"),
  avatar_v2_top_noir_rose_heart_cardigan:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_top_noir_rose_heart_cardigan.png"),
  avatar_v2_top_boho_patchwork_maxi_dress:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_top_boho_patchwork_maxi_dress.png"),
  avatar_v2_top_embroidered_halter_wrap_dress:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_top_embroidered_halter_wrap_dress.png"),
  avatar_v2_top_ruched_patchwork_mini_dress:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_top_ruched_patchwork_mini_dress.png"),
  avatar_v2_top_white_lace_cami_mini_dress:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_top_white_lace_cami_mini_dress.png"),
  avatar_v2_bottom_striped_crochet_shorts:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_bottom_striped_crochet_shorts.png"),
  avatar_v2_bottom_layered_lace_ruffle_mini_skirt:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_bottom_layered_lace_ruffle_mini_skirt.png"),
  avatar_v2_bottom_black_palm_embellished_pants:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_bottom_black_palm_embellished_pants.png"),
  avatar_v2_bottom_coral_embellished_laceup_pants:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_bottom_coral_embellished_laceup_pants.png"),
  avatar_v2_bottom_smoky_floral_mesh_pants:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_bottom_smoky_floral_mesh_pants.png"),
  avatar_v2_bottom_yellow_bow_lace_ruffle_skirt:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_bottom_yellow_bow_lace_ruffle_skirt.png"),
  avatar_v2_shoes_milk_tea_court_sneakers:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_shoes_milk_tea_court_sneakers.png"),
  avatar_v2_shoes_cherry_satin_ballets:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_shoes_cherry_satin_ballets.png"),
  avatar_v2_shoes_onyx_heart_mary_janes:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_shoes_onyx_heart_mary_janes.png"),
  avatar_v2_shoes_rosewood_platform_loafers:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_shoes_rosewood_platform_loafers.png"),
  avatar_v2_shoes_pearl_slingback_sandals:
    require("../features/avatarV2/assets/shop-thumbnails/avatar_v2_shoes_pearl_slingback_sandals.png")
}

function WardrobeCarouselGap(): ReactElement {
  return <View style={styles.carouselGap} />
}

export function WardrobeV2Screen(props: WardrobeV2ScreenProps) {
  const { navigation } = props
  const studioCopy = AVATAR_STUDIO_COPY[getAppLocale()]
  const [activeSection, setActiveSection] =
    useState<AvatarStudioSectionId>("closet")
  const [activeCategory, setActiveCategory] = useState<WardrobeCategoryId>(
    getAvatarStudioDefaultCategory("closet")
  )
  const [carouselProgress, setCarouselProgress] = useState(0)
  const [carouselContentWidth, setCarouselContentWidth] = useState(0)
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0)
  const carouselOffsetX = useRef(new Animated.Value(0)).current
  const carouselOffsetXRef = useRef(0)
  const { fontScale, height: viewportHeight } = useWindowDimensions()
  const useCompactVerticalFallback = shouldUseWardrobeVerticalFallback(
    viewportHeight,
    fontScale
  )
  const useCompactSlotLayout = shouldUseWardrobeSlotCompactLayout(fontScale)
  const {
    avatar,
    catalog,
    inventory,
    canEquipItem,
    equipAndSaveItem,
    isSaving,
    saveErrorMessage
  } = useAvatarV2()

  useEffect(() => {
    setCarouselProgress(0)
    carouselOffsetXRef.current = 0
    carouselOffsetX.setValue(0)
  }, [activeCategory, carouselOffsetX])

  const visibleSlots = useMemo(
    () => getWardrobeVisibleSlots(catalog, avatar),
    [avatar, catalog]
  )
  const getCategoryLabel = useCallback(
    (categoryId: WardrobeCategoryId): string => studioCopy[categoryId],
    [studioCopy]
  )
  const studioCategories = useMemo(
    () => getAvatarStudioCategories(activeSection, catalog, avatar),
    [activeSection, avatar, catalog]
  )

  const activeItems = useMemo(
    () => getWardrobeCategoryItems(catalog, activeCategory).filter(
      (item) =>
        isAvatarV2ItemCompatibleWithBody(item, avatar.bodyId) &&
        isAvatarItemRoomPreviewSupported(item) &&
        canEquipItem(item)
    ),
    [activeCategory, avatar.bodyId, canEquipItem, catalog]
  )

  const handleSelectSection = useCallback((section: AvatarStudioSectionId): void => {
    hapticLight()
    setActiveSection(section)
    setActiveCategory(getAvatarStudioDefaultCategory(section))
  }, [])

  const equippedLabel = useMemo(() => {
    const equipped = activeItems.find((item) =>
      isAvatarV2ItemEquipped(avatar, item)
    )
    if (!equipped) return activeCategory === "dress" ? "Choose a dress" : `Choose ${activeCategory}`
    if (!isAvatarItemRoomPreviewSupported(equipped)) {
      return `${equipped.name} room art pending`
    }
    return `${equipped.name} equipped`
  }, [activeCategory, activeItems, avatar])
  const visibleActiveItems = useMemo(
    () =>
      [...activeItems].sort((left, right) => {
        const leftEquipped = isAvatarV2ItemEquipped(avatar, left)
        const rightEquipped = isAvatarV2ItemEquipped(avatar, right)
        if (leftEquipped === rightEquipped) return 0
        return leftEquipped ? -1 : 1
      }),
    [activeItems, avatar]
  )

  const visibleWardrobeCards = useMemo(
    () =>
      visibleActiveItems.map((item) => {
        const catalogItem = buildAvatarShopCatalogItem({
          item,
          avatar,
          inventory
        })
        const canEquip = canEquipItem(item)
        const roomPreviewSupported = isAvatarItemRoomPreviewSupported(item)
        const locked = isSaving || !canEquip || !roomPreviewSupported
        const equipped = isAvatarV2ItemEquipped(avatar, item) && roomPreviewSupported
        const previewSource = getAvatarItemPreviewSource(item)
        const itemStateLabel = !roomPreviewSupported
          ? "Room fit pending"
          : locked
            ? catalogItem.stateLabel
            : item.type === "body"
              ? "Switch base"
              : item.outfitKey
              ? "Full look"
              : "Try on"

        return {
          item,
          equipped,
          itemStateLabel,
          locked,
          previewSource
        }
      }),
    [avatar, canEquipItem, inventory, isSaving, visibleActiveItems]
  )

  const handleEquip = useCallback((item: AvatarCatalogItem): void => {
    hapticLight()
    void equipAndSaveItem(item).then((result) => {
      if (!result.ok) {
        hapticError()
        return
      }
      captureProductEvent("wardrobe_item_equipped", {
        item_type: item.type,
        full_look: Boolean(item.outfitKey)
      })
      hapticSuccess()
    })
  }, [equipAndSaveItem])

  // Drag-only and momentum scroll interactions both finish here, keeping the
  // progressbar's accessibility `now` value in parity with the animated thumb.
  const handleCarouselSettled = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>
  ): void => {
    carouselOffsetXRef.current = event.nativeEvent.contentOffset.x
    setCarouselProgress(getWardrobeCarouselProgress(
      event.nativeEvent.contentOffset.x,
      event.nativeEvent.contentSize.width,
      event.nativeEvent.layoutMeasurement.width
    ))
  }, [])

  const handleCarouselMetrics = useCallback((
    contentWidth: number,
    viewportWidth: number
  ): void => {
    if (contentWidth <= 0 || viewportWidth <= 0) return
    setCarouselProgress(getWardrobeCarouselProgress(
      carouselOffsetXRef.current,
      contentWidth,
      viewportWidth
    ))
  }, [])

  const handleCarouselContentSizeChange = useCallback((width: number): void => {
    setCarouselContentWidth(width)
  }, [])

  const handleAnimatedCarouselScroll = useMemo(
    () => Animated.event(
      [{ nativeEvent: { contentOffset: { x: carouselOffsetX } } }],
      {
        useNativeDriver: false,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          carouselOffsetXRef.current = event.nativeEvent.contentOffset.x
        }
      }
    ),
    [carouselOffsetX]
  )

  const handleCarouselLayout = useCallback((event: {
    nativeEvent: { layout: { width: number } }
  }): void => {
    setCarouselViewportWidth(event.nativeEvent.layout.width)
  }, [])

  useEffect(() => {
    handleCarouselMetrics(carouselContentWidth, carouselViewportWidth)
  }, [carouselContentWidth, carouselViewportWidth, handleCarouselMetrics])

  const renderWardrobeItem = useCallback(({ item }: {
    item: {
      item: AvatarCatalogItem
      equipped: boolean
      itemStateLabel: string
      locked: boolean
      previewSource?: ImageSourcePropType
    }
  }) => (
    <WardrobeCatalogCard
      item={item.item}
      equipped={item.equipped}
      itemStateLabel={item.itemStateLabel}
      locked={item.locked}
      previewSource={item.previewSource}
      onEquip={handleEquip}
    />
  ), [handleEquip])

  return (
    <View style={styles.root}>
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.iconButton,
              pressed ? styles.iconButtonPressed : null
            ]}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{studioCopy.title}</Text>
            <Text style={styles.subtitle}>{studioCopy.subtitle}</Text>
          </View>
          <View style={styles.progressPill} accessibilityLabel={`Step ${studioCopy.progress}`}>
            <Text style={styles.progressPillText}>{studioCopy.progress}</Text>
          </View>
        </View>

        <View style={styles.sectionSwitcher}>
          {AVATAR_STUDIO_SECTIONS.map((section) => {
            const active = section.id === activeSection
            return (
              <Pressable
                key={section.id}
                testID={`avatar-studio-section-${section.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${studioCopy[section.id]} ${studioCopy.sectionA11ySuffix}`}
                accessibilityState={{ selected: active }}
                onPress={() => handleSelectSection(section.id)}
                style={[
                  styles.sectionButton,
                  active ? styles.sectionButtonActive : null
                ]}
              >
                <Ionicons
                  name={section.id === "appearance" ? "happy" : "shirt"}
                  size={16}
                  color={active ? "#FFFFFF" : uiTheme.colors.textSecondary}
                />
                <Text style={[
                  styles.sectionButtonText,
                  active ? styles.sectionButtonTextActive : null
                ]}>
                  {studioCopy[section.id]}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.wardrobeFrame}>
          <ScrollView
            style={styles.screenBody}
            contentContainerStyle={[
              styles.screenBodyContent,
              useCompactVerticalFallback ? styles.screenBodyContentCompact : null
            ]}
            scrollEnabled={useCompactVerticalFallback}
            bounces={useCompactVerticalFallback}
            alwaysBounceVertical={false}
            showsVerticalScrollIndicator={false}
          >
        <View style={styles.previewPanel}>
          <View style={[
            styles.previewAndSlots,
            useCompactSlotLayout ? styles.previewAndSlotsCompact : null
          ]}>
            <View style={styles.avatarPreviewColumn}>
              <AvatarPreview2D
                avatar={avatar}
                catalog={catalog}
                animationState="idle_front"
                selectedType={activeCategory === "dress" ? "top" : activeCategory}
                label={equippedLabel}
                metaTone="light"
                size={190}
                stageHeight={240}
              />
            </View>

            {activeSection === "closet" ? (
              <WardrobeEquippedSlotsRail
                activeCategory={activeCategory}
                slots={visibleSlots}
                compact={useCompactSlotLayout}
                getPreviewSource={getAvatarItemPreviewSource}
                onSelectCategory={setActiveCategory}
              />
            ) : null}
          </View>

        </View>

        {saveErrorMessage ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.saveError}
          >
            <Ionicons
              name="alert-circle"
              size={17}
              color={uiTheme.colors.danger}
            />
            <Text style={styles.saveErrorText}>{saveErrorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.catalogShelf}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {studioCategories.map((category) => {
              const active = category.id === activeCategory
              return (
                <Pressable
                  key={category.id}
                  testID={`wardrobe-category-${category.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${studioCopy[category.id]} ${studioCopy.categoryA11ySuffix}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    hapticLight()
                    setActiveCategory(category.id)
                  }}
                  style={[
                    styles.categoryTab,
                    active ? styles.categoryTabActive : null
                  ]}
                >
                  <Ionicons
                    name={WARDROBE_CATEGORY_ICONS[category.id]}
                    size={15}
                    color={active ? "#FFFFFF" : uiTheme.colors.textSecondary}
                  />
                  <Text
                    maxFontSizeMultiplier={1.4}
                    style={[
                      styles.categoryTabText,
                      active ? styles.categoryTabTextActive : null
                    ]}
                  >
                    {getCategoryLabel(category.id)}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          {activeCategory === "body" ? (
            <Text accessibilityRole="text" style={styles.bodySwitchHint}>
              {studioCopy.bodySwitchHint}
            </Text>
          ) : null}

          <WardrobeCarouselProgress
            category={activeCategory}
            contentWidth={carouselContentWidth}
            label={equippedLabel}
            offsetX={carouselOffsetX}
            positionFraction={carouselProgress}
            viewportWidth={carouselViewportWidth}
          />

          <Animated.FlatList
            key={activeCategory}
            horizontal
            data={visibleWardrobeCards}
            keyExtractor={(entry) => entry.item.id}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
            ItemSeparatorComponent={WardrobeCarouselGap}
            renderItem={renderWardrobeItem}
            getItemLayout={getWardrobeCarouselItemLayout}
            scrollEventThrottle={16}
            onScroll={handleAnimatedCarouselScroll}
            onScrollEndDrag={handleCarouselSettled}
            onMomentumScrollEnd={handleCarouselSettled}
            onContentSizeChange={handleCarouselContentSizeChange}
            onLayout={handleCarouselLayout}
          />
        </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  )
}

const WardrobeCatalogCard = memo(function WardrobeCatalogCard(props: {
  item: AvatarCatalogItem
  equipped: boolean
  itemStateLabel: string
  locked: boolean
  onEquip: (item: AvatarCatalogItem) => void
  previewSource?: ImageSourcePropType
}) {
  const { item, equipped, itemStateLabel, locked, onEquip, previewSource } = props
  const rigLayerPresentation = item.id in MALE_CAPSULE_PREVIEW_SOURCES
    ? getMaleRigLayerThumbnailPresentation(item.type, "wardrobe")
    : undefined
  const thumbnailPresentation = getWardrobeThumbnailPresentation({
    type: item.type,
    isRigLayer: Boolean(rigLayerPresentation),
    isSquareAsset: item.id in WARDROBE_SQUARE_THUMBNAIL_SOURCES
  })

  return (
    <Pressable
      testID={`wardrobe-item-${getAvatarAutomationSlug(item.id)}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${equipped ? "Wearing" : itemStateLabel}`}
      accessibilityState={{
        disabled: locked,
        selected: equipped
      }}
      disabled={locked}
      onPress={() => onEquip(item)}
      style={({ pressed }) => [
        styles.itemCard,
        equipped ? styles.itemCardEquipped : null,
        locked ? styles.itemCardLocked : null,
        pressed ? styles.itemCardPressed : null
      ]}
    >
      <View style={styles.itemPreviewStage}>
        <View style={styles.itemPreviewHalo} />
        {previewSource ? (
          <Image
            source={previewSource}
            resizeMode="contain"
            style={[
              thumbnailPresentation.frame === "rig"
                ? styles.itemPreviewRigLayer
                : thumbnailPresentation.frame === "square"
                  ? styles.itemPreviewSquare
                  : styles.itemPreviewImage,
              rigLayerPresentation
                ? {
                    top: rigLayerPresentation.top,
                    transform: [{ scale: rigLayerPresentation.scale }]
                  }
                : thumbnailPresentation.frame === "legacy"
                  ? getAvatarItemPreviewImageStyle(item)
                  : null
            ]}
          />
        ) : (
          <View
            style={[
              styles.itemIconShell,
              equipped ? styles.itemIconShellEquipped : null
            ]}
          >
            <Ionicons
              name={locked ? "lock-closed" : CATEGORY_ICONS[item.type]}
              size={20}
              color={equipped ? "#FFFFFF" : uiTheme.colors.primary}
            />
          </View>
        )}
        {equipped ? (
          <View style={styles.itemCheckBadge}>
            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={styles.itemName} numberOfLines={2}>
        {item.name}
      </Text>
      <View
        style={[
          styles.itemMetaPill,
          equipped ? styles.itemMetaPillEquipped : null,
          locked ? styles.itemMetaLocked : null
        ]}
      >
        <Text style={styles.itemMeta} numberOfLines={1}>
          {equipped ? "Wearing" : itemStateLabel}
        </Text>
      </View>
    </Pressable>
  )
}, (previous, next) =>
  previous.item.id === next.item.id &&
  previous.equipped === next.equipped &&
  previous.itemStateLabel === next.itemStateLabel &&
  previous.locked === next.locked &&
  previous.onEquip === next.onEquip &&
  previous.previewSource === next.previewSource
)

function getAvatarItemPreviewSource(
  item: AvatarCatalogItem
): ImageSourcePropType | undefined {
  return WARDROBE_SQUARE_THUMBNAIL_SOURCES[item.id]
    ?? AVATAR_ITEM_PREVIEW_SOURCES[item.id]
}

function isAvatarItemRoomPreviewSupported(item: AvatarCatalogItem): boolean {
  return item.id in DEFAULT_AVATAR_ROOM_PROJECTION_MAP
}

function getAvatarItemPreviewImageStyle(item: AvatarCatalogItem): {
  width: number
  height: number
  transform: { translateY: number }[]
} {
  if (item.type === "top") {
    if (
      item.id === "avatar_v2_top_default" ||
      item.id === "avatar_v2_top_cream_basic_tee"
    ) {
      return { width: 170, height: 255, transform: [{ translateY: -24 }] }
    }
    return { width: 178, height: 267, transform: [{ translateY: -60 }] }
  }
  if (item.type === "bottom") {
    return { width: 196, height: 294, transform: [{ translateY: -116 }] }
  }
  if (item.type === "shoes") {
    return { width: 196, height: 294, transform: [{ translateY: -130 }] }
  }
  if (item.type === "hair") {
    return { width: 100, height: 100, transform: [{ translateY: 0 }] }
  }
  if (item.type === "eyes" || item.type === "nose" || item.type === "mouth") {
    return { width: 172, height: 172, transform: [{ translateY: -8 }] }
  }
  return { width: 142, height: 213, transform: [{ translateY: -32 }] }
}
