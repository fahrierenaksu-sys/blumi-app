import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useMemo, useState } from "react"
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
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
import { uiTheme } from "../ui/theme"

export type DiscoverFilters = DiscoveryFilters

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.overlay}>
        <SwipeDismissSheet
          onDismiss={onClose}
          backdrop={{
            style: styles.backdrop,
            onPress: onClose,
            accessibilityLabel: copy.closeAccessibilityLabel
          }}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <View style={styles.sheetGlowTop} pointerEvents="none" />
          <View style={styles.sheetGlowBottom} pointerEvents="none" />
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>{copy.eyebrow}</Text>
              <Text style={styles.headerTitle}>{copy.title}</Text>
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
              <View style={styles.segmentRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.showEveryoneAccessibilityLabel}
                  accessibilityState={{ selected: draftFilters.genders.length === 0 }}
                  style={[
                    styles.segment,
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
                      style={[styles.segment, active ? styles.segmentActive : null]}
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
                <View style={styles.ageControls}>
                  <View style={styles.ageControlGroup}>
                    <Text style={styles.ageLabel}>{copy.minimum}</Text>
                    <View style={styles.ageStepper}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.decreaseMinimumAge(draftFilters.ageMin)}
                        style={styles.stepperButton}
                        onPress={() => updateAgeMin(-1)}
                      >
                        <Text style={styles.stepperText}>−</Text>
                      </Pressable>
                      <Text style={styles.stepperValue}>{draftFilters.ageMin}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.increaseMinimumAge(draftFilters.ageMin)}
                        style={styles.stepperButton}
                        onPress={() => updateAgeMin(1)}
                      >
                        <Text style={styles.stepperText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.ageControlGroup}>
                    <Text style={styles.ageLabel}>{copy.maximum}</Text>
                    <View style={styles.ageStepper}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.decreaseMaximumAge(draftFilters.ageMax)}
                        style={styles.stepperButton}
                        onPress={() => updateAgeMax(-1)}
                      >
                        <Text style={styles.stepperText}>−</Text>
                      </Pressable>
                      <Text style={styles.stepperValue}>{draftFilters.ageMax}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copy.increaseMaximumAge(draftFilters.ageMax)}
                        style={styles.stepperButton}
                        onPress={() => updateAgeMax(1)}
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

          <View style={[styles.footer, { marginBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.footerButton}>
              <SecondaryButton
                label={copy.reset}
                onPress={() => {
                  setDraftFilters(DEFAULT_DISCOVER_FILTERS)
                }}
              />
            </View>
            <View style={styles.footerButton}>
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
  sheet: {
    maxHeight: "86%",
    borderTopLeftRadius: uiTheme.radius.xxl,
    borderTopRightRadius: uiTheme.radius.xxl,
    backgroundColor: "rgba(255, 250, 253, 0.76)",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.88)",
    paddingTop: uiTheme.spacing.lg,
    overflow: "hidden",
    ...uiTheme.shadow.deep,
  },
  sheetSheen: {
    position: "absolute",
    left: -40,
    right: -40,
    top: 72,
    height: 104,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.26)",
    transform: [{ rotate: "-7deg" }],
  },
  sheetGlowTop: {
    position: "absolute",
    top: -132,
    left: -96,
    width: 390,
    height: 276,
    borderRadius: 180,
    backgroundColor: "rgba(255, 124, 183, 0.18)",
  },
  sheetGlowBottom: {
    position: "absolute",
    right: -120,
    bottom: -130,
    width: 420,
    height: 320,
    borderRadius: 210,
    backgroundColor: "rgba(191, 166, 255, 0.20)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.lg,
    paddingBottom: uiTheme.spacing.md,
  },
  headerCopy: {
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
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.52)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
  },
  content: {
    maxHeight: 520,
  },
  contentContainer: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingBottom: uiTheme.spacing.md,
    gap: uiTheme.spacing.md,
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
    borderColor: "rgba(255, 255, 255, 0.78)",
    backgroundColor: "rgba(255, 255, 255, 0.34)",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    borderColor: "rgba(255, 79, 152, 0.72)",
    backgroundColor: "rgba(255, 229, 244, 0.62)",
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
    backgroundColor: "rgba(255, 255, 255, 0.30)",
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
    backgroundColor: "rgba(255, 255, 255, 0.38)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: uiTheme.spacing.xs,
  },
  stepperButton: {
    width: 32,
    height: 32,
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
    borderColor: "rgba(255, 255, 255, 0.78)",
    backgroundColor: "rgba(255, 255, 255, 0.36)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  vibeChipSelected: {
    borderColor: "rgba(255, 79, 152, 0.82)",
    backgroundColor: "rgba(255, 229, 244, 0.64)",
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
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)",
    borderRadius: 28,
    borderCurve: "continuous",
    padding: 8,
    flexDirection: "row",
    gap: uiTheme.spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.34)",
    ...uiTheme.shadow.soft,
  },
  footerButton: {
    flex: 1,
  },
})
