import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useMemo, useState } from "react"
import { getWardrobePageCount } from "../features/avatarV2/wardrobe/wardrobeStageLayout"
import { Text, View } from "react-native"
import Animated, { useSharedValue } from "react-native-reanimated"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { goBackOrFallback } from "../navigation/rootNavigationModel"
import { hapticSelection } from "../ui/haptics"
import { useReducedMotion } from "../ui/animations"
import { getBottomPanelEntering } from "../ui/bottomPanelEntrance"
import { getAppLocale } from "../features/session/authLocale"
import {
  findAvatarStudioTab,
  getAvatarStudioDefaultCategory,
  getAvatarStudioTabs,
  resolveAvatarStudioCategory,
  type AvatarStudioSectionId,
  type WardrobeCategoryId
} from "../features/avatarV2/wardrobeCategoryModel"
import { AVATAR_STUDIO_COPY } from "../features/avatarV2/wardrobe/wardrobeCopy"
import {
  buildWardrobeCards,
  getWardrobeActiveItems
} from "../features/avatarV2/wardrobe/wardrobeCatalogModel"
import { getAvatarItemPreviewSource } from "../features/avatarV2/wardrobe/wardrobePreviewSources"
import { useWardrobeTryOn } from "../features/avatarV2/wardrobe/useWardrobeTryOn"
import { useWardrobeDone } from "../features/avatarV2/wardrobe/useWardrobeDone"
import { useWardrobeCatalogTransition } from "../features/avatarV2/wardrobe/useWardrobeCategoryMotion"
import { WardrobeTopBar } from "../features/avatarV2/wardrobe/WardrobeTopBar"
import { WardrobeSectionSwitcher } from "../features/avatarV2/wardrobe/WardrobeSectionSwitcher"
import { WardrobePreviewStage } from "../features/avatarV2/wardrobe/WardrobePreviewStage"
import { WardrobeSaveError } from "../features/avatarV2/wardrobe/WardrobeSaveError"
import { WardrobeCategoryTabs } from "../features/avatarV2/wardrobe/WardrobeCategoryTabs"
import { WardrobeCatalogHeader } from "../features/avatarV2/wardrobe/WardrobeCatalogHeader"
import { WardrobeCatalogList } from "../features/avatarV2/wardrobe/WardrobeCatalogList"
import { WardrobeGlass } from "../features/avatarV2/wardrobe/WardrobeGlass"
import { WardrobeLockedPreviewBar } from "../features/avatarV2/wardrobe/WardrobeLockedPreviewBar"
import { useWardrobeLockedPreview } from "../features/avatarV2/wardrobe/useWardrobeLockedPreview"
import { wardrobeV2Styles as styles } from "../features/avatarV2/wardrobe/wardrobeV2Styles"

type WardrobeV2ScreenProps = NativeStackScreenProps<RootStackParamList, "WardrobeV2">

export function WardrobeV2Screen(props: WardrobeV2ScreenProps) {
  const { navigation } = props
  const studioCopy = AVATAR_STUDIO_COPY[getAppLocale()]
  const [activeSection, setActiveSection] =
    useState<AvatarStudioSectionId>("closet")
  const [selectedCategory, setSelectedCategory] = useState<WardrobeCategoryId>(
    getAvatarStudioDefaultCategory("closet")
  )
  const reduceMotion = useReducedMotion()
  const {
    avatar,
    catalog,
    inventory,
    canEquipItem,
    saveAvatar,
    isSaving,
    saveErrorMessage
  } = useAvatarV2()
  const {
    pendingTryOn,
    displayedAvatar,
    hasFailedSave,
    dismissTryOnPreview,
    handleEquip
  } = useWardrobeTryOn({ navigation, avatar, isSaving, canEquipItem, saveAvatar })

  const {
    lockedItem,
    stageAvatar,
    isAvailableInShop,
    previewLockedItem,
    clearLockedPreview,
    openLockedItemInShop
  } = useWardrobeLockedPreview({ navigation, displayedAvatar, copy: studioCopy })

  const studioTabs = useMemo(
    () => getAvatarStudioTabs(activeSection, catalog, avatar),
    [activeSection, avatar, catalog]
  )
  const activeCategory = resolveAvatarStudioCategory(studioTabs, selectedCategory)
  const activeTab = findAvatarStudioTab(studioTabs, activeCategory)

  const activeItems = useMemo(
    () => getWardrobeActiveItems({
      catalog,
      category: activeCategory,
      bodyId: avatar.bodyId,
      canEquipItem,
      isAvailableInShop
    }),
    [activeCategory, avatar.bodyId, canEquipItem, catalog, isAvailableInShop]
  )
  const visibleWardrobeCards = useMemo(
    () => buildWardrobeCards({
      items: activeItems,
      avatar,
      displayedAvatar,
      inventory,
      canEquipItem,
      copy: studioCopy,
      getPreviewSource: getAvatarItemPreviewSource,
      previewingItemId: lockedItem?.id ?? null
    }),
    [avatar, canEquipItem, displayedAvatar, inventory, studioCopy, activeItems, lockedItem]
  )

  const catalogTransition = useWardrobeCatalogTransition({
    activeCategory,
    cards: visibleWardrobeCards,
    reduceMotion
  })
  const [catalogPage, setCatalogPage] = useState(0)
  const catalogPagePosition = useSharedValue(0)

  const handleSelectSection = useCallback((section: AvatarStudioSectionId): void => {
    hapticSelection()
    dismissTryOnPreview()
    clearLockedPreview()
    setActiveSection(section)
    setSelectedCategory(getAvatarStudioDefaultCategory(section))
  }, [clearLockedPreview, dismissTryOnPreview])

  const handleEquipOwned = useCallback((item: Parameters<typeof handleEquip>[0]): void => {
    clearLockedPreview()
    handleEquip(item)
  }, [clearLockedPreview, handleEquip])

  const handleSelectCategory = useCallback((categoryId: WardrobeCategoryId): void => {
    hapticSelection()
    dismissTryOnPreview()
    clearLockedPreview()
    setSelectedCategory(categoryId)
  }, [clearLockedPreview, dismissTryOnPreview])

  const handleClose = useCallback((): void => {
    goBackOrFallback(navigation, () => navigation.replace("MyRoom"))
  }, [navigation])
  const saveIssue = saveErrorMessage ?? (hasFailedSave ? studioCopy.saveFailed : null)
  const { handleDone, isWaitingToClose } = useWardrobeDone({
    isSaving,
    hasPendingTryOn: Boolean(pendingTryOn),
    saveErrorMessage: saveIssue,
    onClose: handleClose
  })

  return (
    <View style={styles.root}>
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "bottom", "left", "right"]}>
        <WardrobeTopBar
          copy={studioCopy}
          isDoneWaiting={isWaitingToClose}
          onBack={handleClose}
          onDone={handleDone}
        />

        <View style={styles.heroRegion}>
          <WardrobePreviewStage
            avatar={stageAvatar}
            catalog={catalog}
            copy={studioCopy}
            reduceMotion={reduceMotion}
            showSavingStatus={isSaving || Boolean(pendingTryOn)}
          />
          {lockedItem ? (
            <WardrobeLockedPreviewBar
              itemName={lockedItem.name}
              copy={studioCopy}
              reduceMotion={reduceMotion}
              onSeeInShop={openLockedItemInShop}
              onClose={clearLockedPreview}
            />
          ) : null}
          {saveIssue ? (
            <View style={styles.saveErrorSlot}>
              <WardrobeSaveError message={saveIssue} />
            </View>
          ) : null}
        </View>

        {/* The panel rises softly into place, like the room editor's dock. */}
        <Animated.View entering={getBottomPanelEntering(reduceMotion)}>
          <WardrobeGlass tone="panel" radius={30} style={styles.panelShell} contentStyle={styles.panelContent}>
            <WardrobeSectionSwitcher
              activeSection={activeSection}
              copy={studioCopy}
              onSelectSection={handleSelectSection}
            />
            <WardrobeCategoryTabs
              tabs={studioTabs}
              activeCategory={activeCategory}
              copy={studioCopy}
              onSelectCategory={handleSelectCategory}
            />
            {activeTab ? (
              <WardrobeCatalogHeader
                tab={activeTab}
                activeCategory={activeCategory}
                copy={studioCopy}
                optionCount={visibleWardrobeCards.length}
                pageCount={getWardrobePageCount(visibleWardrobeCards.length)}
                activePage={catalogPage}
                pagePosition={catalogPagePosition}
                onSelectCategory={handleSelectCategory}
              />
            ) : null}
            {activeCategory === "body" ? (
              <Text accessibilityRole="text" style={styles.bodySwitchHint}>
                {studioCopy.bodySwitchHint}
              </Text>
            ) : null}
            <WardrobeCatalogList
              activeCategory={catalogTransition.shownCategory}
              cards={catalogTransition.cards}
              catalogStyle={catalogTransition.style}
              switching={catalogTransition.switching}
              copy={studioCopy}
              reduceMotion={reduceMotion}
              onEquip={handleEquipOwned}
              onPreviewLocked={previewLockedItem}
              onPageChange={setCatalogPage}
              pagePosition={catalogPagePosition}
              onExploreShop={() => navigation.navigate("CosmeticShop", { initialShopMode: "avatar" })}
            />
          </WardrobeGlass>
        </Animated.View>
      </SafeAreaView>
    </View>
  )
}
