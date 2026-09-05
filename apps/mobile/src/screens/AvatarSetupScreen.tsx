import Ionicons from "@expo/vector-icons/Ionicons"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import {
  AvatarSetupStudioStage,
  type AvatarStudioCategoryDescriptor
} from "../features/avatarV2/components/AvatarSetupStudioStage"
import {
  AVATAR_STUDIO_CATEGORY_SEQUENCE,
  getAvatarSetupImmersiveStageHeight,
  getAvatarSetupLayoutMetrics,
  getAvatarSetupTaskCardMinHeight,
  getAvatarStudioNextIndex,
  type AvatarStudioCategory
} from "../features/avatarV2/avatarSetupLayout"
import {
  FEMALE_STARTER_BODY_ID,
  applyOnboardingStarterBody,
  getAvatarStarterBodyItems,
  getOnboardingStarterBodyId,
  getAvatarStarterCategoryItems,
  MALE_STARTER_BODY_ID,
  normalizeAvatarForStarterSetup
} from "../features/avatarV2/avatarStarterModel"
import { isAvatarV2ItemEquipped } from "../features/avatarV2/avatarV2Selectors"
import { useAvatarV2 } from "../features/avatarV2/state/AvatarV2Provider"
import { BlumiSetupShell } from "../features/session/setupFlow/BlumiSetupShell"
import type {
  AvatarCatalogItem,
  UserAvatar
} from "../features/avatarV2/avatarV2.types"
import { hapticLight } from "../ui/haptics"
import { useReducedMotionPreference } from "../ui/animations"
import { blumiEntryTheme as uiTheme } from "../ui/theme"
import {
  useOnboardingHardwareBack,
  useOnboardingSignOut
} from "./components/onboardingScreenActions"

const STARTER_CATEGORIES: {
  type: AvatarStudioCategory
  label: string
  icon: keyof typeof Ionicons.glyphMap
}[] = [
  { type: "hair", label: "Saç", icon: "cut-outline" },
  { type: "top", label: "Üst", icon: "shirt-outline" },
  { type: "bottom", label: "Alt", icon: "layers-outline" },
  { type: "shoes", label: "Ayakkabı", icon: "footsteps-outline" }
]

export interface AvatarSetupScreenProps {
  displayName: string
  age?: number
  initialGender?: string
  isSubmitting: boolean
  errorMessage: string | null
  onComplete: (avatar: UserAvatar) => Promise<void>
  onBackToProfile: () => void
  onEditProfile: () => void
  onSignOut: () => Promise<void>
  motionActive?: boolean
}

export function AvatarSetupScreen({
  initialGender,
  isSubmitting,
  errorMessage,
  onComplete,
  onBackToProfile,
  onSignOut,
  motionActive = true
}: AvatarSetupScreenProps) {
  const { fontScale, height, width } = useWindowDimensions()
  const { avatar, catalog, canEquipItem, equipItem } = useAvatarV2()
  const [selectedType, setSelectedType] = useState<AvatarStudioCategory>("hair")
  const { reduceMotion } = useReducedMotionPreference()
  const { busy } = useOnboardingSignOut(onSignOut, isSubmitting)
  useOnboardingHardwareBack(onBackToProfile, busy)

  const { compact, veryCompact } = getAvatarSetupLayoutMetrics(height, width, fontScale)

  // Profile gender seeds the first wardrobe frame. It must not lock the studio:
  // after that initial reconciliation, the selected body in the avatar store is
  // the source of truth for both the segmented control and the rendered rig.
  const preferredBodyId = getOnboardingStarterBodyId(initialGender)
  const reconciledBodyIdRef = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    if (
      !preferredBodyId ||
      reconciledBodyIdRef.current === preferredBodyId
    ) return
    if (avatar.bodyId === preferredBodyId) {
      reconciledBodyIdRef.current = preferredBodyId
      return
    }
    const bodyItem = catalog.find(
      (item) => item.type === "body" && item.id === preferredBodyId
    )
    if (bodyItem && equipItem(bodyItem)) {
      reconciledBodyIdRef.current = preferredBodyId
    }
  }, [avatar.bodyId, catalog, equipItem, preferredBodyId])

  const stageAvatar = useMemo(
    () => {
      // Seed the first visible frame from the profile choice. The provider
      // reconciliation below still commits this to the store, but deriving
      // the stage synchronously prevents the previous body's rig from
      // flashing while that layout effect runs.
      const firstFrameAvatar = preferredBodyId &&
        reconciledBodyIdRef.current !== preferredBodyId
        ? applyOnboardingStarterBody(avatar, preferredBodyId, catalog)
        : avatar
      return {
        ...firstFrameAvatar,
        accessoryIds: [...firstFrameAvatar.accessoryIds],
        bodyId: firstFrameAvatar.bodyId
      }
    },
    [avatar, catalog, preferredBodyId]
  )
  const categoryItems = useMemo(
    () => Object.fromEntries(
      STARTER_CATEGORIES.map(({ type }) => [
        type,
        getAvatarStarterCategoryItems(
          catalog,
          type,
          stageAvatar.bodyId,
          canEquipItem
        )
      ])
    ) as Record<AvatarStudioCategory, AvatarCatalogItem[]>,
    [canEquipItem, catalog, stageAvatar.bodyId]
  )
  const bodyItems = useMemo(
    () => getAvatarStarterBodyItems(catalog, canEquipItem),
    [canEquipItem, catalog]
  )
  const starterAvatar = useMemo(
    () => normalizeAvatarForStarterSetup(stageAvatar, categoryItems),
    [categoryItems, stageAvatar]
  )
  const selectedItems = categoryItems[selectedType]
  const selectedIndex = Math.max(
    0,
    selectedItems.findIndex((item) => isAvatarV2ItemEquipped(starterAvatar, item))
  )
  const selectedItem = selectedItems[selectedIndex]
  function equipWithMotion(item: AvatarCatalogItem | undefined): void {
    if (!item || !equipItem(item)) return
  }

  function cycleCategory(type: AvatarStudioCategory, direction: -1 | 1): void {
    const items = categoryItems[type]
    const index = Math.max(
      0,
      items.findIndex((item) => isAvatarV2ItemEquipped(starterAvatar, item))
    )
    if (items.length < 2) return
    const nextIndex = getAvatarStudioNextIndex(
      index,
      items.length,
      direction
    )
    equipWithMotion(items[nextIndex])
    hapticLight()
  }

  function equipBody(bodyId: string): void {
    equipWithMotion(bodyItems.find((item) => item.id === bodyId))
    hapticLight()
  }

  function selectCategory(type: AvatarStudioCategory): void {
    if (type === selectedType) return
    setSelectedType(type)
    hapticLight()
  }

  const isMale = starterAvatar.bodyId === MALE_STARTER_BODY_ID
  const studioCategories: AvatarStudioCategoryDescriptor[] =
    AVATAR_STUDIO_CATEGORY_SEQUENCE.map((type) => {
      const metadata = STARTER_CATEGORIES.find((category) => category.type === type)
      const items = categoryItems[type]
      const equippedIndex = Math.max(
        0,
        items.findIndex((item) => isAvatarV2ItemEquipped(starterAvatar, item))
      )
      return {
        type,
        label: metadata?.label ?? type,
        icon: metadata?.icon ?? "ellipse-outline",
        itemCount: items.length,
        selectedIndex: equippedIndex
      }
    })

  return (
    <BlumiSetupShell
      motionActive={motionActive}
      onBack={onBackToProfile}
      onPrimaryAction={() => void onComplete(starterAvatar).catch(() => undefined)}
      primaryActionBusy={isSubmitting}
      primaryActionDisabled={busy}
      primaryActionLabel="Karakterim hazır"
      primaryActionTestID="avatar-setup-submit"
      reduceMotion={reduceMotion}
      headerTitle="İlk görünümün"
      headerProgressStyle="fraction"
      hideHeading
      hideProgressRail
      immersiveBottomSheet
      taskCardMinHeight={getAvatarSetupTaskCardMinHeight(compact, veryCompact, height)}
      taskCardTone="sheet"
      stageHeight={getAvatarSetupImmersiveStageHeight(compact, height, veryCompact)}
      stageInteractive
      step="avatar"
      feedback={errorMessage ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      stage={(
        <AvatarSetupStudioStage
          avatar={starterAvatar}
          catalog={catalog}
          categories={studioCategories}
          compact={compact}
          disabled={busy}
          isMale={isMale}
          motionActive={motionActive}
          onCycle={cycleCategory}
          onSelectCategory={selectCategory}
          onSelectGender={(gender) => equipBody(
            gender === "man" ? MALE_STARTER_BODY_ID : FEMALE_STARTER_BODY_ID
          )}
          reduceMotion={reduceMotion}
          selectedType={selectedType}
          selectionKey={selectedItem?.id ?? `${selectedType}-empty`}
          veryCompact={veryCompact}
        />
      )}
    >
      <View style={styles.avatarFirstSheet}>
            <View style={styles.avatarFirstSummary}>
              <Text accessibilityRole="header" style={styles.avatarFirstTitle}>
                Karakterini hazırla
              </Text>
              <Text style={styles.avatarFirstDescription}>
                Bu sadece başlangıç. Tarzını sonra da değiştirebilirsin.
              </Text>
            </View>
            <View
              accessible
              accessibilityLabel="Görünümünü istediğin zaman değiştirebilir ve Mağaza’dan yeni parçalar keşfedebilirsin."
              style={styles.avatarFreedomNote}
            >
              <View style={styles.avatarFreedomItem}>
                <View style={styles.avatarFreedomIcon}>
                  <Ionicons
                    accessible={false}
                    color={uiTheme.colors.primary}
                    name="refresh-outline"
                    size={17}
                  />
                </View>
                <Text style={styles.avatarFreedomText}>İstediğin zaman değiştir</Text>
              </View>
              <View pointerEvents="none" style={styles.avatarFreedomDivider} />
              <View style={styles.avatarFreedomItem}>
                <View style={styles.avatarFreedomIcon}>
                  <Ionicons
                    accessible={false}
                    color={uiTheme.colors.primary}
                    name="bag-handle-outline"
                    size={17}
                  />
                </View>
                <Text style={styles.avatarFreedomText}>Mağaza’da yeni parçalar keşfet</Text>
              </View>
            </View>
          </View>
    </BlumiSetupShell>
  )
}

const styles = StyleSheet.create({
  avatarFirstSheet: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 124,
    paddingHorizontal: uiTheme.spacing.xs
  },
  avatarFirstSummary: {
    alignItems: "center",
    gap: 6,
    marginBottom: 14
  },
  avatarFirstTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  avatarFirstDescription: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    textAlign: "center"
  },
  avatarFreedomNote: {
    alignItems: "stretch",
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 247, 251, 0.78)",
    borderColor: "rgba(210, 79, 116, 0.18)",
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: uiTheme.spacing.sm,
    ...uiTheme.shadow.soft
  },
  avatarFreedomItem: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    paddingVertical: 8
  },
  avatarFreedomIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    borderRadius: 15,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  avatarFreedomText: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textSecondary,
    flexShrink: 1,
    fontWeight: "700",
    lineHeight: 15
  },
  avatarFreedomDivider: {
    alignSelf: "center",
    backgroundColor: "rgba(210, 79, 116, 0.16)",
    height: 28,
    width: 1
  },
  error: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.dangerInk,
    textAlign: "center"
  }
})
