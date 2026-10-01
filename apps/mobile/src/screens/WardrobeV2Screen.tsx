import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useMemo, useState } from "react"
import { getWardrobePageCount } from "../features/avatarV2/wardrobe/wardrobeStageLayout"
import { Text, View } from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { goBackOrFallback } from "../navigation/rootNavigationModel"
import { hapticLight } from "../ui/haptics"
import { useReducedMotion } from "../ui/animations"
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
      canEquipItem
    }),
    [activeCategory, avatar.bodyId, canEquipItem, catalog]
  )
  const visibleWardrobeCards = useMemo(
    () => buildWardrobeCards({
      items: activeItems,
      avatar,
      displayedAvatar,
      inventory,
      canEquipItem,
      copy: studioCopy,
      getPreviewSource: getAvatarItemPreviewSource
    }),
    [avatar, canEquipItem, displayedAvatar, inventory, studioCopy, activeItems]
  )

  const catalogTransition = useWardrobeCatalogTransition({
    activeCategory,
    cards: visibleWardrobeCards,
    reduceMotion
  })
  const [catalogPage, setCatalogPage] = useState(0)

  const handleSelectSection = useCallback((section: AvatarStudioSectionId): void => {
    hapticLight()
    dismissTryOnPreview()
    setActiveSection(section)
    setSelectedCategory(getAvatarStudioDefaultCategory(section))
  }, [dismissTryOnPreview])

  const handleSelectCategory = useCallback((categoryId: WardrobeCategoryId): void => {
    hapticLight()
    dismissTryOnPreview()
    setSelectedCategory(categoryId)
  }, [dismissTryOnPreview])

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
            avatar={displayedAvatar}
            catalog={catalog}
            copy={studioCopy}
            reduceMotion={reduceMotion}
            showSavingStatus={isSaving || Boolean(pendingTryOn)}
          />
          {saveIssue ? (
            <View style={styles.saveErrorSlot}>
              <WardrobeSaveError message={saveIssue} />
            </View>
          ) : null}
        </View>

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
            onEquip={handleEquip}
            onPageChange={setCatalogPage}
            onExploreShop={() => navigation.navigate("CosmeticShop", { initialShopMode: "avatar" })}
          />
        </WardrobeGlass>
      </SafeAreaView>
    </View>
  )
}
