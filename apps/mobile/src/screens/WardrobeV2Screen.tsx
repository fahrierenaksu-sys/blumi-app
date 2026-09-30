import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useMemo, useState } from "react"
import { ScrollView, Text, View, useWindowDimensions } from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { goBackOrFallback } from "../navigation/rootNavigationModel"
import { hapticLight } from "../ui/haptics"
import { useReducedMotion } from "../ui/animations"
import { getAppLocale } from "../features/session/authLocale"
import {
  getAvatarStudioCategories,
  getAvatarStudioDefaultCategory,
  shouldUseWardrobeVerticalFallback,
  type AvatarStudioSectionId,
  type WardrobeCategoryId
} from "../features/avatarV2/wardrobeCategoryModel"
import { AVATAR_STUDIO_COPY } from "../features/avatarV2/wardrobe/wardrobeCopy"
import {
  buildWardrobeCards,
  getWardrobeActiveItems,
  resolveWardrobeEquippedLabel,
  sortWardrobeItemsEquippedFirst
} from "../features/avatarV2/wardrobe/wardrobeCatalogModel"
import { getAvatarItemPreviewSource } from "../features/avatarV2/wardrobe/wardrobePreviewSources"
import { useWardrobeTryOn } from "../features/avatarV2/wardrobe/useWardrobeTryOn"
import { useWardrobeCarousel } from "../features/avatarV2/wardrobe/useWardrobeCarousel"
import {
  useWardrobeCatalogFade,
  useWardrobeCategoryTabScroll
} from "../features/avatarV2/wardrobe/useWardrobeCategoryMotion"
import { WardrobeTopBar } from "../features/avatarV2/wardrobe/WardrobeTopBar"
import { WardrobeSectionSwitcher } from "../features/avatarV2/wardrobe/WardrobeSectionSwitcher"
import { WardrobePreviewStage } from "../features/avatarV2/wardrobe/WardrobePreviewStage"
import { WardrobeSaveError } from "../features/avatarV2/wardrobe/WardrobeSaveError"
import { WardrobeCategoryTabs } from "../features/avatarV2/wardrobe/WardrobeCategoryTabs"
import { WardrobeCatalogList } from "../features/avatarV2/wardrobe/WardrobeCatalogList"
import { wardrobeV2Styles as styles } from "../features/avatarV2/wardrobe/wardrobeV2Styles"
import { WardrobeCarouselProgress } from "./components/WardrobeCarouselProgress"

type WardrobeV2ScreenProps = NativeStackScreenProps<RootStackParamList, "WardrobeV2">

export function WardrobeV2Screen(props: WardrobeV2ScreenProps) {
  const { navigation } = props
  const studioCopy = AVATAR_STUDIO_COPY[getAppLocale()]
  const [activeSection, setActiveSection] =
    useState<AvatarStudioSectionId>("closet")
  const [activeCategory, setActiveCategory] = useState<WardrobeCategoryId>(
    getAvatarStudioDefaultCategory("closet")
  )
  const reduceMotion = useReducedMotion()
  const { fontScale, height: viewportHeight } = useWindowDimensions()
  const useCompactVerticalFallback = shouldUseWardrobeVerticalFallback(
    viewportHeight,
    fontScale
  )
  const {
    avatar,
    catalog,
    inventory,
    canEquipItem,
    saveAvatar,
    isSaving,
    saveErrorMessage
  } = useAvatarV2()
  const { pendingTryOn, displayedAvatar, dismissTryOnPreview, handleEquip } =
    useWardrobeTryOn({ navigation, avatar, isSaving, canEquipItem, saveAvatar })
  const {
    carouselOffsetX,
    carouselProgress,
    carouselContentWidth,
    carouselViewportWidth,
    handleAnimatedCarouselScroll,
    handleCarouselSettled,
    handleCarouselContentSizeChange,
    handleCarouselLayout
  } = useWardrobeCarousel(activeCategory)
  const { categoryScrollRef, categoryOffsetsRef } = useWardrobeCategoryTabScroll({
    activeCategory,
    activeSection,
    reduceMotion
  })
  const catalogOpacity = useWardrobeCatalogFade({ activeCategory, reduceMotion })

  const getCategoryLabel = useCallback(
    (categoryId: WardrobeCategoryId): string => studioCopy[categoryId],
    [studioCopy]
  )
  const studioCategories = useMemo(
    () => getAvatarStudioCategories(activeSection, catalog, avatar),
    [activeSection, avatar, catalog]
  )

  const activeItems = useMemo(
    () => getWardrobeActiveItems({
      catalog,
      category: activeCategory,
      bodyId: avatar.bodyId,
      canEquipItem
    }),
    [activeCategory, avatar.bodyId, canEquipItem, catalog]
  )

  const handleSelectSection = useCallback((section: AvatarStudioSectionId): void => {
    hapticLight()
    dismissTryOnPreview()
    setActiveSection(section)
    setActiveCategory(getAvatarStudioDefaultCategory(section))
  }, [dismissTryOnPreview])

  const handleSelectCategory = useCallback((categoryId: WardrobeCategoryId): void => {
    hapticLight()
    dismissTryOnPreview()
    setActiveCategory(categoryId)
  }, [dismissTryOnPreview])

  const equippedLabel = useMemo(
    () => resolveWardrobeEquippedLabel({
      items: activeItems,
      displayedAvatar,
      categoryLabel: getCategoryLabel(activeCategory),
      copy: studioCopy
    }),
    [activeCategory, activeItems, displayedAvatar, getCategoryLabel, studioCopy]
  )
  const visibleActiveItems = useMemo(
    () => sortWardrobeItemsEquippedFirst(activeItems, avatar),
    [activeItems, avatar]
  )

  const visibleWardrobeCards = useMemo(
    () => buildWardrobeCards({
      items: visibleActiveItems,
      avatar,
      displayedAvatar,
      inventory,
      canEquipItem,
      copy: studioCopy,
      getPreviewSource: getAvatarItemPreviewSource
    }),
    [avatar, canEquipItem, displayedAvatar, inventory, studioCopy, visibleActiveItems]
  )

  return (
    <View style={styles.root}>
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "bottom", "left", "right"]}>
        <WardrobeTopBar
          copy={studioCopy}
          onBack={() => goBackOrFallback(navigation, () => navigation.replace("MyRoom"))}
        />

        <WardrobeSectionSwitcher
          activeSection={activeSection}
          copy={studioCopy}
          onSelectSection={handleSelectSection}
        />

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
            <WardrobePreviewStage
              avatar={displayedAvatar}
              catalog={catalog}
              copy={studioCopy}
              showSavingStatus={isSaving || Boolean(pendingTryOn)}
            />

            {saveErrorMessage ? <WardrobeSaveError message={saveErrorMessage} /> : null}

            <View style={styles.catalogShelf}>
              <WardrobeCategoryTabs
                categories={studioCategories}
                activeCategory={activeCategory}
                copy={studioCopy}
                scrollRef={categoryScrollRef}
                offsetsRef={categoryOffsetsRef}
                getCategoryLabel={getCategoryLabel}
                onSelectCategory={handleSelectCategory}
              />

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

              <WardrobeCatalogList
                activeCategory={activeCategory}
                cards={visibleWardrobeCards}
                catalogOpacity={catalogOpacity}
                copy={studioCopy}
                reduceMotion={reduceMotion}
                onEquip={handleEquip}
                onExploreShop={() => navigation.navigate("CosmeticShop", { initialShopMode: "avatar" })}
                onScroll={handleAnimatedCarouselScroll}
                onScrollSettled={handleCarouselSettled}
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
