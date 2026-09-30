import { Pressable, StyleSheet, Text, View } from "react-native"
import {
  CandidateAvatarPreview,
  type createCandidateAvatarSnapshot
} from "../../../components/DiscoverCard"
import { uiTheme } from "../../../ui/theme"
import { getAppLocale } from "../../session/appLocale"
import { getDiscoveryHomeCopy } from "../discoveryHomeCopy"

// Discover header: the viewer's profile chip (opens You) and the filters
// button with its active-filter badge.
export function DiscoverHomeHeader(props: {
  myDisplayName: string
  myAvatarSnapshot: ReturnType<typeof createCandidateAvatarSnapshot>
  startupScope: string
  onHeaderDisplay: () => void
  onBackgroundError: () => void
  activeFilterCount: number
  handleOpenProfileEdit: () => void
  handleOpenFilters: () => void
}) {
  const {
    myDisplayName,
    myAvatarSnapshot,
    startupScope,
    onHeaderDisplay,
    onBackgroundError,
    activeFilterCount,
    handleOpenProfileEdit,
    handleOpenFilters
  } = props
  const copy = getDiscoveryHomeCopy(getAppLocale()).header
  return (
    <View style={styles.homeHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.profileAccessibilityLabel}
        onPress={handleOpenProfileEdit}
        style={({ pressed }) => [
          styles.homeProfileChip,
          pressed ? styles.homeProfileChipPressed : null
        ]}
      >
        <View style={styles.homeProfileSheen} pointerEvents="none" />
        <View style={styles.homeAvatarPreview}>
          <CandidateAvatarPreview
            key={startupScope}
            onDisplay={onHeaderDisplay}
            onImageError={onBackgroundError}
            size={48}
            snapshot={myAvatarSnapshot}
            stage="profile"
            imagePriority="normal"
          />
        </View>
        <View style={styles.homeProfileText}>
          <Text style={styles.homeProfileName} numberOfLines={1}>
            {myDisplayName}
          </Text>
          <Text style={styles.homeProfileMeta} numberOfLines={1}>
            {copy.profileMeta}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.filtersAccessibilityLabel}
        style={({ pressed }) => [
          styles.filterButton,
          pressed ? styles.filterButtonPressed : null
        ]}
        onPress={handleOpenFilters}
        hitSlop={6}
      >
        <View style={styles.filterButtonGlow} pointerEvents="none" />
        <View style={styles.filterButtonInner} pointerEvents="none" />
        <View style={styles.filterDotGrid} pointerEvents="none">
          <View style={styles.filterDot} />
          <View style={styles.filterDot} />
          <View style={styles.filterDot} />
          <View style={styles.filterDot} />
        </View>
        {activeFilterCount > 0 ? (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.md,
    marginBottom: uiTheme.spacing.md,
  },
  homeProfileChip: {
    flex: 1,
    minHeight: 58,
    maxWidth: 238,
    borderRadius: 29,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: uiTheme.ambientGlass.surface,
    borderWidth: 1,
    borderColor: uiTheme.ambientGlass.edgeLight,
    overflow: "hidden",
  },
  homeProfileChipPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  homeProfileSheen: {
    position: "absolute",
    left: 26,
    right: 26,
    top: 1,
    height: 1.5,
    borderRadius: 999,
    backgroundColor: uiTheme.ambientGlass.sheen
  },
  homeAvatarPreview: {
    alignItems: "center",
    backgroundColor: uiTheme.ambientGlass.surfaceStrong,
    borderColor: uiTheme.ambientGlass.edgeLight,
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    overflow: "hidden",
    width: 42
  },
  homeProfileText: {
    flex: 1,
    gap: 2,
  },
  homeProfileName: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textPrimary,
    fontWeight: "900",
  },
  homeProfileMeta: {
    ...uiTheme.font.caption,
    color: "rgba(54, 40, 68, 0.62)",
    fontWeight: "700",
  },
  filterButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.ambientGlass.surface,
    borderWidth: 1,
    borderColor: uiTheme.ambientGlass.edgeLight,
    position: "relative",
    overflow: "hidden",
  },
  filterButtonGlow: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: uiTheme.ambientGlass.surfaceQuiet,
  },
  filterButtonInner: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: uiTheme.ambientGlass.surfaceQuiet,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
  },
  filterButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  filterDotGrid: {
    width: 18,
    height: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  filterDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(48, 35, 62, 0.46)",
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: uiTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: uiTheme.colors.surface,
  },
  filterBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
})
