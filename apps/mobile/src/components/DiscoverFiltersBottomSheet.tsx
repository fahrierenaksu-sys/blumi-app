import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useMemo, useState } from "react"
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type {
  DiscoveryFilters,
  DiscoveryGender
} from "@blumi/contracts"
import {
  DEFAULT_DISCOVERY_FILTERS,
  DISCOVERY_MAXIMUM_AGE,
  DISCOVERY_MINIMUM_AGE
} from "../features/discovery/discoveryFiltersModel"
import {
  DISCOVERY_VIBE_OPTIONS,
  getDiscoveryHomeCopy
} from "../features/discovery/discoveryHomeCopy"
import { getAppLocale } from "../features/session/appLocale"
import { PrimaryButton, SecondaryButton } from "../ui/primitives"
import { SwipeDismissSheet, SwipeDismissSheetScrollView } from "../ui/SwipeDismissSheet"
import { hapticSelection } from "../ui/haptics"
import { uiTheme } from "../ui/theme"

export type DiscoverFilters = DiscoveryFilters

const AGE_LONG_PRESS_STEP = 5
const AGE_ADJUST_ACTIONS = [{ name: "increment" }, { name: "decrement" }]

const GENDER_OPTIONS: readonly DiscoveryGender[] = ["woman", "man"]

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = DEFAULT_DISCOVERY_FILTERS

interface DiscoverFiltersBottomSheetProps {
  visible: boolean
  initialFilters: DiscoverFilters
  onClose: () => void
  onApply: (filters: DiscoverFilters) => void
}

function clampAge(value: number): number {
  return Math.max(
    DISCOVERY_MINIMUM_AGE,
    Math.min(DISCOVERY_MAXIMUM_AGE, value)
  )
}

function toggleVibe(selectedVibes: string[], vibe: string): string[] {
  if (selectedVibes.includes(vibe)) {
    return selectedVibes.filter((current) => current !== vibe)
  }
  return [...selectedVibes, vibe]
}

function toggleGender(
  selectedGenders: DiscoveryGender[],
  gender: DiscoveryGender
): DiscoveryGender[] {
  if (selectedGenders.includes(gender)) {
    return selectedGenders.filter((current) => current !== gender)
  }
  return [...selectedGenders, gender]
}

export function DiscoverFiltersBottomSheet(props: DiscoverFiltersBottomSheetProps) {
  const { visible, initialFilters, onClose, onApply } = props
  const [draftFilters, setDraftFilters] = useState<DiscoverFilters>(initialFilters)
  const insets = useSafeAreaInsets()
  const { width, fontScale } = useWindowDimensions()
  const expandedLayout = width < 360 || fontScale >= 1.3
  const copy = getDiscoveryHomeCopy(getAppLocale()).filters

  useEffect(() => {
    if (visible) {
      setDraftFilters(initialFilters)
    }
  }, [initialFilters, visible])

  const ageSummary = useMemo(
    () => `${draftFilters.ageMin} - ${draftFilters.ageMax}`,
    [draftFilters.ageMax, draftFilters.ageMin]
  )

  const updateAgeMin = (step: number) => {
    setDraftFilters((previous) => {
      const nextMin = clampAge(previous.ageMin + step)
      return {
        ...previous,
        ageMin: Math.min(nextMin, previous.ageMax)
      }
    })
  }

  // DSC-13: every step ticks; a long press jumps five years.
  const stepAge = (update: (step: number) => void, step: number) => {
    hapticSelection()
    update(step)
  }

  const updateAgeMax = (step: number) => {
    setDraftFilters((previous) => {
      const nextMax = clampAge(previous.ageMax + step)
      return {
        ...previous,
        ageMax: Math.max(nextMax, previous.ageMin)
      }
    })
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.overlay}>
        <SwipeDismissSheet
          onDismiss={onClose}
          presentation="self"
          accessibilityViewIsModal
          backdrop={{
            style: styles.backdrop,
            onPress: onClose,
            accessibilityLabel: copy.closeAccessibilityLabel
          }}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <View style={styles.grabber} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no" />
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>{copy.eyebrow}</Text>
              <Text accessibilityRole="header" style={styles.headerTitle}>{copy.title}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.closeAccessibilityLabel}
              style={styles.closeButton}
              onPress={onClose}
            >
              <Ionicons accessible={false} name="close" size={20} color={uiTheme.colors.secondaryText} />
            </Pressable>
          </View>

          <SwipeDismissSheetScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{copy.showMe}</Text>
              <View style={[styles.segmentRow, expandedLayout && styles.stackedRow]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.showEveryoneAccessibilityLabel}
                  accessibilityState={{ selected: draftFilters.genders.length === 0 }}
                  style={[
                    styles.segment,
                    expandedLayout && styles.stackedItem,
                    draftFilters.genders.length === 0 ? styles.segmentActive : null
                  ]}
                  onPress={() => {
                    setDraftFilters((previous) => ({ ...previous, genders: [] }))
                  }}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      draftFilters.genders.length === 0
                        ? styles.segmentTextActive
                        : null
                    ]}
                  >
                    {copy.everyone}
                  </Text>
                </Pressable>
                {GENDER_OPTIONS.map((gender) => {
                  const active = draftFilters.genders.includes(gender)
                  const genderCopy = copy.genders[gender]
                  return (
                    <Pressable
                      key={gender}
                      accessibilityRole="button"
                      accessibilityLabel={genderCopy.accessibilityLabel}
                      accessibilityState={{ selected: active }}
                      style={[styles.segment, expandedLayout && styles.stackedItem, active ? styles.segmentActive : null]}
                      onPress={() => {
                        setDraftFilters((previous) => ({
                          ...previous,
                          genders: toggleGender(previous.genders, gender)
                        }))
                      }}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          active ? styles.segmentTextActive : null
                        ]}
                      >
                        {genderCopy.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{copy.ageWindow}</Text>
              <View style={styles.ageCard}>
                <Text style={styles.ageValue}>{ageSummary}</Text>
                <View style={[styles.ageControls, expandedLayout && styles.stackedRow]}>
                  <View style={[styles.ageControlGroup, expandedLayout && styles.stackedItem]}>
                    <Text style={styles.ageLabel}>{copy.minimum}</Text>
                    <View
                      style={styles.ageStepper}
                      accessible
                      accessibilityRole="adjustable"
                      accessibilityLabel={copy.minimum}
                      accessibilityValue={{ text: String(draftFilters.ageMin) }}
                      accessibilityActions={AGE_ADJUST_ACTIONS}
                      onAccessibilityAction={(event) => stepAge(updateAgeMin, event.nativeEvent.actionName === "increment" ? 1 : -1)}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.decreaseMinimumAge(draftFilters.ageMin)}
                        style={styles.stepperButton}
                        hitSlop={6}
                        onPress={() => stepAge(updateAgeMin, -1)}
                        onLongPress={() => stepAge(updateAgeMin, -AGE_LONG_PRESS_STEP)}
                      >
                        <Text style={styles.stepperText}>−</Text>
                      </Pressable>
                      <Text style={styles.stepperValue}>{draftFilters.ageMin}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.increaseMinimumAge(draftFilters.ageMin)}
                        style={styles.stepperButton}
                        hitSlop={6}
                        onPress={() => stepAge(updateAgeMin, 1)}
                        onLongPress={() => stepAge(updateAgeMin, AGE_LONG_PRESS_STEP)}
                      >
                        <Text style={styles.stepperText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={[styles.ageControlGroup, expandedLayout && styles.stackedItem]}>
                    <Text style={styles.ageLabel}>{copy.maximum}</Text>
                    <View
                      style={styles.ageStepper}
                      accessible
                      accessibilityRole="adjustable"
                      accessibilityLabel={copy.maximum}
                      accessibilityValue={{ text: String(draftFilters.ageMax) }}
                      accessibilityActions={AGE_ADJUST_ACTIONS}
                      onAccessibilityAction={(event) => stepAge(updateAgeMax, event.nativeEvent.actionName === "increment" ? 1 : -1)}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.decreaseMaximumAge(draftFilters.ageMax)}
                        style={styles.stepperButton}
                        hitSlop={6}
                        onPress={() => stepAge(updateAgeMax, -1)}
                        onLongPress={() => stepAge(updateAgeMax, -AGE_LONG_PRESS_STEP)}
                      >
                        <Text style={styles.stepperText}>−</Text>
                      </Pressable>
                      <Text style={styles.stepperValue}>{draftFilters.ageMax}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.increaseMaximumAge(draftFilters.ageMax)}
                        style={styles.stepperButton}
                        hitSlop={6}
                        onPress={() => stepAge(updateAgeMax, 1)}
                        onLongPress={() => stepAge(updateAgeMax, AGE_LONG_PRESS_STEP)}
                      >
                        <Text style={styles.stepperText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{copy.vibesTitle}</Text>
              <View style={styles.tagsWrap}>
                {DISCOVERY_VIBE_OPTIONS.map((vibe) => {
                  const selected = draftFilters.vibes.includes(vibe)
                  const vibeLabel = copy.vibeLabels[vibe]
                  return (
                    <Pressable
                      key={vibe}
                      accessibilityRole="button"
                      accessibilityLabel={copy.vibeAccessibilityLabel(vibeLabel)}
                      accessibilityState={{ selected }}
                      style={[styles.vibeChip, selected ? styles.vibeChipSelected : null]}
                      onPress={() => {
                        setDraftFilters((previous) => ({
                          ...previous,
                          vibes: toggleVibe(previous.vibes, vibe)
                        }))
                      }}
                    >
                      <Text
                        style={[
                          styles.vibeChipText,
                          selected ? styles.vibeChipTextSelected : null
                        ]}
                      >
                        {vibeLabel}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

          </SwipeDismissSheetScrollView>

          <View style={[styles.footer, expandedLayout && styles.stackedRow]}>
            <View style={[styles.footerButton, expandedLayout && styles.stackedItem]}>
              <SecondaryButton
                label={copy.reset}
                onPress={() => {
                  setDraftFilters(DEFAULT_DISCOVER_FILTERS)
                }}
              />
            </View>
            <View style={[styles.footerButton, styles.applyButton, expandedLayout && styles.stackedItem]}>
              <PrimaryButton
                label={copy.apply}
                onPress={() => {
                  onApply(draftFilters)
                }}
              />
            </View>
          </View>
        </SwipeDismissSheet>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(35, 18, 42, 0.16)",
  },
  grabber: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(32, 22, 42, 0.18)",
    zIndex: 2,
  },
  sheet: {
    maxHeight: "86%",
    borderTopLeftRadius: uiTheme.radius.xxl,
    borderTopRightRadius: uiTheme.radius.xxl,
    borderCurve: "continuous",
    backgroundColor: "#FFF8FC",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.88)",
    paddingTop: uiTheme.spacing.xl,
    overflow: "hidden",
    ...uiTheme.shadow.deep,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.lg,
    paddingBottom: uiTheme.spacing.md,
    gap: uiTheme.spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  headerEyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
    letterSpacing: 1.2,
  },
  headerTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 30,
  },
  closeButton: {
    flexShrink: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
  },
  content: {
    flexShrink: 1,
  },
  contentContainer: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingBottom: uiTheme.spacing.md,
    gap: uiTheme.spacing.lg,
  },
  section: {
    gap: uiTheme.spacing.xs,
  },
  sectionTitle: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
  },
  segmentRow: {
    flexDirection: "row",
    gap: uiTheme.spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    borderColor: "#EDE1EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    borderColor: uiTheme.colors.primary,
    backgroundColor: "#FFE8F3",
    ...uiTheme.shadow.soft,
  },
  segmentText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: uiTheme.colors.chipText,
    fontWeight: "700",
  },
  ageCard: {
    borderRadius: uiTheme.radius.xl,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    backgroundColor: "#FFFFFF",
    padding: uiTheme.spacing.md,
    gap: uiTheme.spacing.md,
    ...uiTheme.shadow.soft,
  },
  ageValue: {
    ...uiTheme.font.title,
    color: uiTheme.colors.textPrimary,
    fontSize: 22,
  },
  ageControls: {
    flexDirection: "row",
    gap: uiTheme.spacing.md,
  },
  ageControlGroup: {
    flex: 1,
    gap: uiTheme.spacing.xs,
  },
  ageLabel: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textMuted,
  },
  ageStepper: {
    minHeight: 44,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    backgroundColor: "#FFF4FA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.xs,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 232, 244, 0.82)",
  },
  stepperText: {
    color: uiTheme.colors.primary,
    fontSize: 18,
    fontWeight: "800",
  },
  stepperValue: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs,
  },
  vibeChip: {
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    borderColor: "#EDE1EB",
    backgroundColor: "#FFFFFF",
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  vibeChipSelected: {
    borderColor: uiTheme.colors.primary,
    backgroundColor: "#FFE8F3",
    ...uiTheme.shadow.soft,
  },
  vibeChipText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
    fontWeight: "600",
  },
  vibeChipTextSelected: {
    color: uiTheme.colors.chipText,
    fontWeight: "700",
  },
  footer: {
    marginHorizontal: uiTheme.spacing.lg,
    marginBottom: uiTheme.spacing.md,
    paddingTop: 12,
    flexDirection: "row",
    gap: uiTheme.spacing.sm,
  },
  footerButton: {
    flexGrow: 1,
    flexBasis: 0,
  },
  applyButton: { flexGrow: 2 },
  stackedRow: { flexDirection: "column" },
  stackedItem: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
})
