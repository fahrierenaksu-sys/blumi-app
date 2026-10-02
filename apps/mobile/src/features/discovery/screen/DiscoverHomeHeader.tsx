import { Pressable, StyleSheet, Text, View } from "react-native"
import { uiTheme } from "../../../ui/theme"
import { getAppLocale } from "../../session/appLocale"
import { getDiscoveryHomeCopy } from "../discoveryHomeCopy"

// Discover header: the page title and the filters button with its
// active-filter badge. The own profile opens from My Room's profile button
// (its single entry), so Discover carries no profile chip.
export function DiscoverHomeHeader(props: {
  activeFilterCount: number
  handleOpenFilters: () => void
}) {
  const { activeFilterCount, handleOpenFilters } = props
  const copy = getDiscoveryHomeCopy(getAppLocale()).header
  return (
    <View style={styles.homeHeader}>
      <Text accessibilityRole="header" style={styles.homeTitle} numberOfLines={1}>
        {copy.title}
      </Text>
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
  homeTitle: {
    ...uiTheme.font.title,
    flex: 1,
    color: uiTheme.colors.textPrimary,
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
