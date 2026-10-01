import { StyleSheet } from "react-native"
import { uiTheme } from "../../../ui/theme"


/**
 * Pudra Glass wardrobe tokens: powder pink to pale lavender, a soft glass
 * panel and a rose accent. Text and product art stay on near-opaque surfaces.
 */
export const wardrobeTheme = {
  ink: uiTheme.colors.actionDark,
  muted: "#725F70",
  // The app primary pink, used for every selection and the Save action.
  accent: uiTheme.colors.primary,
  hairline: "#E9E0E9",
  screenBase: "#FBF1F6",
  screenGradient:
    "linear-gradient(165deg, #FBE3EC 0%, #FAEEF4 34%, #F1ECFA 72%, #FBF7FB 100%)",
  panelGradient:
    "linear-gradient(145deg, rgba(255,255,255,0.94) 0%, rgba(255,250,252,0.88) 48%, rgba(244,239,250,0.92) 100%)",
  panelSolid: "#FFFCFD",
  controlGradient:
    "linear-gradient(145deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.6) 100%)",
  controlSolid: "#FFFFFF",
  sheenGradient:
    "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)",
  cardGradient: "linear-gradient(145deg, #F7F1F6 0%, #F0EAF2 100%)",
  cardSelectedGradient: "linear-gradient(145deg, #FBEEF4 0%, #F4E3EE 100%)",
  cardBase: "#F3EDF2",
  cardSelectedBase: "#F7E7EE",
  edge: "rgba(255,255,255,0.95)",
  shadow: "#76566F",
  segmentInk: "#4A3448",
  segmentTrack:
    "linear-gradient(155deg, rgba(233,223,235,0.85) 0%, rgba(244,238,245,0.8) 55%, rgba(231,221,237,0.85) 100%)",
  segmentTrackSolid: "#F0E9F1",
} as const

const FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const

export const WARDROBE_PANEL_MARGIN = 12
export const WARDROBE_PANEL_PADDING = 14
export const WARDROBE_GRID_GAP = 8
export const WARDROBE_GRID_ROW_GAP = 8

export const wardrobeV2Styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: wardrobeTheme.screenBase,
    experimental_backgroundImage: wardrobeTheme.screenGradient,
  },
  safe: {
    flex: 1,
  },

  // Header
  topBarFrame: {
    zIndex: 3,
    paddingBottom: 4,
  },
  topBar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  topBarSpacer: {
    flex: 1,
  },
  headline: {
    marginTop: -2,
    paddingHorizontal: 20,
    color: wardrobeTheme.ink,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.8,
    textAlign: "center",
  },
  tagline: {
    marginTop: 3,
    paddingHorizontal: 20,
    color: wardrobeTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  glassControl: {
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  pressedControl: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  doneButton: {
    minWidth: 84,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 22,
    // The app's primary pink, solid, as on the active tab and main actions.
    backgroundColor: uiTheme.colors.primary,
    shadowColor: uiTheme.colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  doneText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    lineHeight: 20,
  },

  // Stage
  heroRegion: {
    flex: 1,
    minHeight: 150,
  },
  hero: {
    ...FILL,
  },
  heroCircle: {
    position: "absolute",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
    experimental_backgroundImage:
      "linear-gradient(135deg, rgba(255,234,241,0.35) 0%, rgba(231,227,245,0.4) 100%)",
  },
  heroAvatar: {
    ...FILL,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomButton: {
    position: "absolute",
    right: 20,
    bottom: 10,
  },
  zoomButtonSurface: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  savingPill: {
    position: "absolute",
    left: 20,
    bottom: 16,
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  savingText: {
    color: wardrobeTheme.muted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
  },
  saveErrorSlot: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    zIndex: 4,
  },
  saveError: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#FFF0F3",
    borderWidth: 1,
    borderColor: "#F7C8D2",
  },
  saveErrorText: {
    flex: 1,
    color: uiTheme.colors.dangerInk,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
  },

  // Panel
  panelShell: {
    marginHorizontal: WARDROBE_PANEL_MARGIN,
    marginBottom: 8,
    borderRadius: 30,
  },
  panelContent: {
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: WARDROBE_PANEL_PADDING,
  },

  // Dolabım / Karakterim
  sectionSwitcher: {
    minHeight: 46,
    flexDirection: "row",
    alignSelf: "center",
    width: "64%",
    minWidth: 220,
    padding: 4,
    marginBottom: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: wardrobeTheme.segmentTrackSolid,
    experimental_backgroundImage: wardrobeTheme.segmentTrack,
  },
  sectionButton: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 20,
  },
  sectionButtonActive: {
    backgroundColor: wardrobeTheme.segmentInk,
    shadowColor: wardrobeTheme.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  // The sliding capsule (WRD-3) takes sectionButtonActive's look.
  sectionIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 20,
  },
  sectionButtonText: {
    color: wardrobeTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 18,
  },
  sectionButtonTextActive: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },

  // Categories
  tabRow: {
    flexDirection: "row",
    gap: 4,
    paddingBottom: 8,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: wardrobeTheme.hairline,
  },
  tab: {
    flex: 1,
    maxWidth: 84,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 16,
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: wardrobeTheme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  // The sliding white capsule (WRD-3) takes tabActive's look.
  tabIndicator: {
    position: "absolute",
    top: 0,
    bottom: 8,
    left: 0,
    borderRadius: 16,
  },
  tabLabel: {
    color: wardrobeTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    lineHeight: 14,
  },
  tabLabelActive: {
    color: wardrobeTheme.accent,
    fontFamily: "Inter_600SemiBold",
  },

  // Sub filter and count
  catalogHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 2,
  },
  filterRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  filterButton: {
    minHeight: 36,
    justifyContent: "center",
  },
  filterText: {
    color: wardrobeTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    lineHeight: 18,
  },
  filterTextActive: {
    color: wardrobeTheme.ink,
    fontFamily: "Inter_600SemiBold",
  },
  countText: {
    color: wardrobeTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16,
  },
  bodySwitchHint: {
    color: wardrobeTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },

  // Product grid
  catalogArea: {
    paddingTop: 4,
  },
  gridPage: {
    gap: WARDROBE_GRID_ROW_GAP,
  },
  gridRow: {
    flexDirection: "row",
    gap: WARDROBE_GRID_GAP,
  },
  countGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: wardrobeTheme.hairline,
  },
  catalogEmpty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 28,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: wardrobeTheme.cardBase,
  },
  catalogEmptyCopy: {
    alignItems: "center",
    gap: 3,
  },
  catalogEmptyTitle: {
    color: wardrobeTheme.ink,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 18,
    textAlign: "center",
  },
  catalogEmptyBody: {
    color: wardrobeTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  catalogEmptyAction: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#F8EAF0",
  },
  catalogEmptyActionText: {
    color: wardrobeTheme.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
  },

  // Product card
  itemCard: {
    minWidth: 0,
  },
  itemCardPressed: {
    transform: [{ scale: 0.97 }],
  },
  itemArt: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: wardrobeTheme.cardBase,
    experimental_backgroundImage: wardrobeTheme.cardGradient,
    overflow: "hidden",
  },
  itemArtSelected: {
    borderColor: wardrobeTheme.accent,
    backgroundColor: wardrobeTheme.cardSelectedBase,
    experimental_backgroundImage: wardrobeTheme.cardSelectedGradient,
  },
  itemArtLocked: {
    opacity: 0.6,
  },
  itemThumbBox: {
    width: 100,
    height: 68,
  },
  itemPreviewSquare: {
    width: "100%",
    height: "100%",
    alignSelf: "center",
  },
  itemPreviewFeaturePortrait: {
    position: "absolute",
    top: 0,
    alignSelf: "center",
    width: 116,
    height: 116,
  },
  itemPreviewImage: {
    alignSelf: "center",
  },
  itemPreviewRigLayer: {
    ...FILL,
    width: "100%",
    height: "100%",
  },
  itemIconShell: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  itemCheckBadge: {
    position: "absolute",
    right: 5,
    top: 5,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: wardrobeTheme.accent,
  },
  itemLock: {
    position: "absolute",
    right: 6,
    bottom: 6,
  },
  itemName: {
    marginTop: 6,
    marginHorizontal: 2,
    color: wardrobeTheme.ink,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16,
  },
})
