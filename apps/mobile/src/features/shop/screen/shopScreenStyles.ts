import { StyleSheet } from "react-native"
import { uiTheme } from "../../../ui/theme"

/** Cosmetic Shop screen, closet browser, category rail and product card styles. */
export const shopScreenStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFF4FA",
  },
  safe: {
    flex: 1,
    paddingTop: 4,
  },
  shopScroller: {
    flex: 1,
  },
  shopContent: {
    gap: 6,
  },
  header: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm,
    paddingBottom: 6,
  },
  headerAccessibility: {
    alignItems: "stretch",
    flexDirection: "column"
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: 0,
  },
  headerEyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
    letterSpacing: 2.6,
  },
  headerTitle: {
    ...uiTheme.font.heading,
    fontSize: 24,
    lineHeight: 27,
    color: uiTheme.colors.textPrimary,
  },
  coinPill: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.3)", // Liquid glass
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.6)",
    ...uiTheme.shadow.soft,
  },
  coinPillAccessibility: {
    alignSelf: "flex-end"
  },
  coinPillPressed: {
    opacity: 0.82,
  },
  coinText: {
    ...uiTheme.font.bodyBold,
    color: "#7B5708",
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  showcaseCard: {
    gap: 6,
    padding: 7,
    borderRadius: 26,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 247, 252, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.86)",
    overflow: "hidden",
    ...uiTheme.shadow.soft,
  },
  closetBrowserCard: {
    gap: 6,
    padding: 8,
    borderRadius: 26,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 250, 253, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.86)",
    overflow: "hidden",
    ...uiTheme.shadow.soft,
  },
  closetBrowserHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  closetBrowserCopy: {
    flex: 1,
    gap: 1,
  },
  closetBrowserTitle: {
    ...uiTheme.font.subheading,
    fontSize: 16,
    lineHeight: 20,
    color: uiTheme.colors.textPrimary,
  },
  closetBrowserSubtitle: {
    ...uiTheme.font.caption,
    fontSize: 11.5,
    color: "rgba(103, 91, 115, 0.76)",
    fontWeight: "800",
  },
  closetBrowserBody: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 7,
  },
  closetBrowserBodyAccessibility: {
    flexDirection: "column"
  },
  horizontalCategoryScroller: {
    flexGrow: 0,
    width: "100%"
  },
  horizontalCategoryRail: {
    flexDirection: "row",
    minHeight: 0
  },
  horizontalCategoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10
  },
  verticalCategoryRail: {
    gap: 4,
  },
  verticalCategoryChip: {
    minHeight: 44,
    alignItems: "stretch",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent",
  },
  verticalCategoryChipActive: {
    backgroundColor: "rgba(255, 235, 246, 0.96)",
    borderColor: "rgba(255, 79, 152, 0.56)",
  },
  verticalCategoryChipPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  verticalCategoryLabel: {
    ...uiTheme.font.micro,
    textAlign: "center",
    color: "rgba(45, 31, 58, 0.64)",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
  },
  verticalCategoryHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  trousersIcon: { width: 17, height: 18 },
  trousersWaist: { position: "absolute", top: 1, left: 1, right: 1, height: 6, borderWidth: 1.5, borderBottomWidth: 0 },
  trousersLeg: { position: "absolute", top: 6, width: 6, height: 11, borderWidth: 1.5, borderTopWidth: 0 },
  verticalCategoryLabelActive: {
    color: uiTheme.colors.primary,
  },
  verticalCategoryCount: {
    ...uiTheme.font.micro,
    minWidth: 19,
    textAlign: "center",
    color: "rgba(45, 31, 58, 0.54)",
    paddingHorizontal: 3,
    paddingVertical: 0,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  verticalCategoryCountActive: {
    color: uiTheme.colors.primary,
    backgroundColor: "transparent",
  },
  closetProductScroller: {
    flexGrow: 0,
    minWidth: 0,
  },
  closetProductShelf: {
    flexDirection: "row",
    gap: 0,
    paddingRight: 0,
    paddingBottom: 1,
  },
  catalogPagination: {
    flexDirection: "row",
    alignItems: "center"
  },
  catalogPageButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "transparent"
  },
  catalogPageButtonDisabled: { opacity: 0.3 },
  catalogPageCount: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.primary,
    marginHorizontal: 5,
    fontVariant: ["tabular-nums"]
  },
  closetProductPage: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 9,
  },
  closetProductColumn: {
    gap: 8,
  },
  productCard: {
    width: 84,
    minHeight: 118,
    gap: 3,
    padding: 7,
    justifyContent: "space-between",
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "rgba(255, 255, 255, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.70)",
  },
  productCardCompact: {
    width: 76,
    height: 122,
    minHeight: 122,
    padding: 5,
  },
  productCardSelected: {
    borderColor: uiTheme.colors.primary,
    backgroundColor: "rgba(255, 242, 249, 0.94)",
  },
  productCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  productThumb: {
    position: "relative",
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#FFF0F6",
    overflow: "hidden",
  },
  productThumbHalo: {
    position: "absolute",
    bottom: 4,
    width: 72,
    height: 42,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#EBC0D8",
    opacity: 0.76,
  },
  productIconOrb: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F2D9E9",
  },
  productIconOrbSelected: {
    backgroundColor: uiTheme.colors.primary,
    borderColor: "rgba(255,255,255,0.5)",
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productWearableImage: {
    alignSelf: "center",
    width: "100%",
    height: "100%",
  },
  productWearableRigLayer: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
  },
  productDropBadge: {
    position: "absolute",
    left: 4,
    top: 4,
    width: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255,255,255,0.90)",
    borderWidth: 1,
    borderColor: "#F2D9E9",
  },
  productViewingBadge: {
    backgroundColor: "rgba(255, 79, 152, 0.92)",
    borderColor: "rgba(255, 255, 255, 0.76)",
  },
  productTitle: {
    ...uiTheme.font.caption,
    minHeight: 26,
    fontSize: 11,
    color: uiTheme.colors.textPrimary,
    fontWeight: "600",
    lineHeight: 13,
    textAlign: "center",
  },
  productMetaPill: {
    alignSelf: "center",
    width: "100%",
    minHeight: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "transparent",
  },
  productMetaPillOwned: {
    backgroundColor: "transparent",
  },
  productMeta: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.chipText,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
})
