import Ionicons from "@expo/vector-icons/Ionicons"
import { useState } from "react"
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { DiscoveryFilters } from "@blumi/contracts"
import { DEFAULT_DISCOVERY_FILTERS } from "../features/discovery/discoveryFiltersModel"
import {
  DISCOVERY_AUDIENCE_OPTIONS,
  formatDiscoveryAgeRange,
  getDiscoveryAudience,
  hasVisibleDiscoveryFilterChanges,
  resetVisibleDiscoveryFilters,
  shouldStackDiscoveryAudience,
  withDiscoveryAgeEdge,
  withDiscoveryAudience,
  type DiscoveryAgeEdge,
  type DiscoveryAudience
} from "../features/discovery/discoveryFiltersSheetModel"
import { getDiscoveryHomeCopy } from "../features/discovery/discoveryHomeCopy"
import { getAppLocale } from "../features/session/appLocale"
import { PrimaryButton } from "../ui/primitives"
import { SwipeDismissSheetScrollView } from "../ui/SwipeDismissSheet"
import { ModalBottomSheet } from "../ui/ModalBottomSheet"
import { useSheetPresentation } from "../ui/sheetPresentation"
import { useNativeSheet } from "../navigation/nativeSheets/useNativeSheet"
import { hapticSelection } from "../ui/haptics"
import { uiTheme } from "../ui/theme"
import { DiscoverAgeRangeSlider } from "./DiscoverAgeRangeSlider"

export type DiscoverFilters = DiscoveryFilters

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = DEFAULT_DISCOVERY_FILTERS

interface DiscoverFiltersBottomSheetProps {
  visible: boolean
  initialFilters: DiscoverFilters
  onClose: () => void
  onApply: (filters: DiscoverFilters) => void
}

export interface DiscoverFiltersSheetContentProps {
  initialFilters: DiscoverFilters
  onApply: (filters: DiscoverFilters) => void
}

/**
 * Discover preferences, presented as a native form sheet on iOS and as the
 * app's swipe-down sheet elsewhere (navigation/nativeSheets). `visible` shows
 * it, `onClose` reports a dismissal.
 */
export function DiscoverFiltersBottomSheet(props: DiscoverFiltersBottomSheetProps) {
  const { visible, initialFilters, onClose, onApply } = props
  const insets = useSafeAreaInsets()
  const copy = getDiscoveryHomeCopy(getAppLocale()).filters
  const presentsNatively = useNativeSheet(
    "discoverFilters",
    visible ? { initialFilters, onApply } : null,
    onClose
  )
  if (presentsNatively) return null
  return (
    <ModalBottomSheet
      visible={visible}
      onClose={onClose}
      backdrop={{
        style: styles.backdrop,
        onPress: onClose,
        accessibilityLabel: copy.closeAccessibilityLabel
      }}
      sheetStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, uiTheme.spacing.md) }]}
    >
      <DiscoverFiltersSheetContent initialFilters={initialFilters} onApply={onApply} />
    </ModalBottomSheet>
  )
}

/**
 * Who you see and their age range. Fields the sheet does not show (legacy
 * vibes) pass through every edit, Reset and Apply unchanged
 * (discoveryFiltersSheetModel). The draft starts from `initialFilters` each
 * time the sheet is presented.
 */
export function DiscoverFiltersSheetContent(props: DiscoverFiltersSheetContentProps) {
  const { initialFilters, onApply } = props
  const [draftFilters, setDraftFilters] = useState<DiscoverFilters>(initialFilters)
  const { close } = useSheetPresentation()
  const { width: windowWidth, fontScale } = useWindowDimensions()
  const copy = getDiscoveryHomeCopy(getAppLocale()).filters

  const audience = getDiscoveryAudience(draftFilters.genders)
  const canReset = hasVisibleDiscoveryFilterChanges(draftFilters)
  const audienceLabels: Record<DiscoveryAudience, { label: string; accessibilityLabel: string }> = {
    everyone: { label: copy.everyone, accessibilityLabel: copy.showEveryoneAccessibilityLabel },
    woman: copy.genders.woman,
    man: copy.genders.man
  }
  const stackAudience = shouldStackDiscoveryAudience({
    windowWidth,
    fontScale,
    longestLabelLength: Math.max(...DISCOVERY_AUDIENCE_OPTIONS.map((option) => audienceLabels[option].label.length))
  })

  const selectAudience = (next: DiscoveryAudience) => {
    if (next === audience) return
    hapticSelection()
    setDraftFilters((previous) => withDiscoveryAudience(previous, next))
  }

  // DSC-13: every whole-year change ticks once.
  const changeAge = (edge: DiscoveryAgeEdge, age: number) => {
    hapticSelection()
    setDraftFilters((previous) => withDiscoveryAgeEdge(previous, edge, age))
  }

  return (
    <>
      <View style={styles.sheetGlow} pointerEvents="none" />
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.closeAccessibilityLabel}
          style={({ pressed }) => [styles.closeButton, pressed ? styles.closeButtonPressed : null]}
          onPress={() => close()}
        >
          <Ionicons accessible={false} name="close" size={22} color={uiTheme.colors.secondaryText} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.resetAccessibilityLabel}
          accessibilityState={{ disabled: !canReset }}
          disabled={!canReset}
          style={({ pressed }) => [styles.resetButton, pressed ? styles.resetButtonPressed : null]}
          onPress={() => {
            hapticSelection()
            setDraftFilters(resetVisibleDiscoveryFilters)
          }}
        >
          <Text style={[styles.resetText, canReset ? null : styles.resetTextDisabled]}>
            {copy.reset}
          </Text>
        </Pressable>
      </View>

      <SwipeDismissSheetScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>{copy.showMe}</Text>
          <View style={stackAudience ? styles.audienceList : styles.segmentTrack}>
            {DISCOVERY_AUDIENCE_OPTIONS.map((option) => {
              const selected = option === audience
              const optionCopy = audienceLabels[option]
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={optionCopy.accessibilityLabel}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => stackAudience
                    ? [
                        styles.audienceRow,
                        selected ? styles.audienceRowSelected : null,
                        pressed && !selected ? styles.audienceRowPressed : null
                      ]
                    : [
                        styles.segment,
                        selected ? styles.segmentSelected : null,
                        pressed && !selected ? styles.segmentPressed : null
                      ]}
                  onPress={() => selectAudience(option)}
                >
                  <Text
                    style={[
                      stackAudience ? styles.audienceRowText : styles.segmentText,
                      selected ? styles.optionTextSelected : null
                    ]}
                  >
                    {optionCopy.label}
                  </Text>
                  {stackAudience && selected ? (
                    <Ionicons accessible={false} name="checkmark" size={22} color={uiTheme.colors.primaryDeep} />
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View
            style={styles.sectionHeader}
            accessible
            accessibilityRole="header"
            accessibilityLabel={copy.ageRangeAccessibilityLabel(draftFilters.ageMin, draftFilters.ageMax)}
          >
            <Text style={styles.sectionTitle}>{copy.ageRange}</Text>
            <Text style={styles.sectionValue}>
              {formatDiscoveryAgeRange(draftFilters.ageMin, draftFilters.ageMax)}
            </Text>
          </View>
          <DiscoverAgeRangeSlider
            ageMin={draftFilters.ageMin}
            ageMax={draftFilters.ageMax}
            minimumAccessibilityLabel={copy.minimumAge}
            maximumAccessibilityLabel={copy.maximumAge}
            onChange={changeAge}
          />
        </View>
      </SwipeDismissSheetScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={copy.apply}
          onPress={() => {
            onApply(draftFilters)
          }}
        />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: uiTheme.colors.overlaySoft,
  },
  // Opaque on purpose: the deck behind never shows through the controls, so
  // Reduce Transparency needs no separate surface.
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: uiTheme.radius.xl,
    borderTopRightRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.background,
    overflow: "hidden",
    ...uiTheme.shadow.deep,
  },
  sheetGlow: {
    position: "absolute",
    top: -160,
    left: -80,
    width: 360,
    height: 260,
    borderRadius: 180,
    backgroundColor: uiTheme.colors.accentGlow,
    opacity: 0.6,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.sm,
    paddingTop: uiTheme.spacing.xxs,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonPressed: {
    backgroundColor: uiTheme.colors.secondary,
  },
  resetButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  resetButtonPressed: {
    backgroundColor: uiTheme.colors.secondary,
  },
  resetText: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.primaryDeep,
  },
  resetTextDisabled: {
    color: uiTheme.colors.textMuted,
  },
  content: {
    flexGrow: 0,
    flexShrink: 1,
  },
  contentContainer: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingBottom: uiTheme.spacing.lg,
    gap: uiTheme.spacing.md,
  },
  titleBlock: {
    gap: uiTheme.spacing.xxs,
    paddingBottom: uiTheme.spacing.xxs,
  },
  title: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
  },
  subtitle: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
  },
  sectionCard: {
    borderRadius: uiTheme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    backgroundColor: uiTheme.colors.surface,
    padding: uiTheme.spacing.md,
    gap: uiTheme.spacing.sm,
    ...uiTheme.shadow.soft,
  },
  sectionHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: uiTheme.spacing.sm,
  },
  sectionTitle: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
  },
  sectionValue: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.primaryDeep,
    fontVariant: ["tabular-nums"],
  },
  // iOS-style segmented control: one track, the selected segment raised.
  segmentTrack: {
    flexDirection: "row",
    padding: 3,
    gap: 3,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.secondary,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: uiTheme.spacing.xs,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentSelected: {
    backgroundColor: uiTheme.colors.surface,
    ...uiTheme.shadow.soft,
  },
  segmentPressed: {
    backgroundColor: uiTheme.colors.secondaryPressed,
  },
  segmentText: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
  },
  optionTextSelected: {
    color: uiTheme.colors.primaryDeep,
  },
  // Large text or a narrow phone: the same choices as a checked list.
  audienceList: {
    gap: uiTheme.spacing.xxs,
  },
  audienceRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.sm,
    paddingVertical: uiTheme.spacing.xs,
    borderRadius: uiTheme.radius.sm,
    borderCurve: "continuous",
  },
  audienceRowSelected: {
    backgroundColor: uiTheme.colors.surfaceSoft,
  },
  audienceRowPressed: {
    backgroundColor: uiTheme.colors.surfaceMuted,
  },
  audienceRowText: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textPrimary,
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: uiTheme.colors.borderStrong,
  },
})
