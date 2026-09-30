import { StyleSheet } from "react-native"
import { wardrobeTheme } from "../../avatarV2/wardrobe/wardrobeV2Styles"
import { uiTheme } from "../../../ui/theme"


/**
 * My Room editor styles ("Yüzen Dock"): the Wardrobe's powder-pink to
 * lavender tokens, an edge-to-edge room, and a floating glass inventory dock.
 */
export const roomEditorTheme = {
  ink: wardrobeTheme.ink,
  muted: wardrobeTheme.muted,
  accent: wardrobeTheme.accent,
  hairline: wardrobeTheme.hairline,
  edge: wardrobeTheme.edge,
  shadow: wardrobeTheme.shadow,
  screenBase: wardrobeTheme.screenBase,
  screenGradient: wardrobeTheme.screenGradient,
  cardSelectedBase: wardrobeTheme.cardSelectedBase,
  cardSelectedGradient: wardrobeTheme.cardSelectedGradient,
  /** Product cards share the wardrobe's powder-lilac surface. */
  cardBase: wardrobeTheme.cardBase,
  cardGradient: wardrobeTheme.cardGradient
} as const

export const ROOM_EDITOR_DOCK_MARGIN = 12
export const ROOM_EDITOR_DOCK_PADDING = 14
export const ROOM_EDITOR_DOCK_GRID_GAP = 8
export const ROOM_EDITOR_CARD_ART_HEIGHT = 92
/** The room keeps at least this much height; the page scrolls below it. */
export const ROOM_EDITOR_STAGE_MIN_HEIGHT = 230

const CONTROL_SURFACE = "rgba(255,255,255,0.72)"
const SOFT_ROSE = "#F8EAF0"

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: roomEditorTheme.screenBase,
    experimental_backgroundImage: roomEditorTheme.screenGradient
  },
  safe: {
    flex: 1
  },
  editorContentFlex: {
    flex: 1
  },
  editorContent: {
    flexGrow: 1
  },
  roomLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "rgba(251,241,246,0.84)",
    gap: 8,
    justifyContent: "center"
  },
  roomLoadingOverlayText: {
    color: roomEditorTheme.muted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 20
  },

  // Header
  topBar: {
    minHeight: 52,
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16
  },
  glassControl: {
    alignItems: "center",
    justifyContent: "center"
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20
  },
  controlPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }]
  },
  controlDisabled: {
    opacity: 0.4
  },
  title: {
    flex: 1,
    color: roomEditorTheme.ink,
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.5
  },
  saveButton: {
    minWidth: 84,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 22,
    // Same solid primary pink as the wardrobe's Save.
    backgroundColor: uiTheme.colors.primary,
    shadowColor: uiTheme.colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    lineHeight: 20
  },

  // Sync failure
  persistenceBanner: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: 16,
    marginTop: 4,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#FFF0F3",
    borderWidth: 1,
    borderColor: "#F7C8D2"
  },
  persistenceBannerText: {
    flex: 1,
    color: uiTheme.colors.dangerInk,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    lineHeight: 17
  },
  persistenceRetryButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18
  },

  // Room stage
  stageRegion: {
    flex: 1,
    minHeight: ROOM_EDITOR_STAGE_MIN_HEIGHT,
    overflow: "hidden"
  },
  stageSurface: {
    position: "absolute",
    overflow: "hidden"
  },
  stagePressable: {
    width: "100%",
    height: "100%"
  },
  renderer: {
    backgroundColor: "transparent"
  },
  stageTools: {
    position: "absolute",
    top: 8,
    right: 16,
    flexDirection: "row",
    gap: 8
  },
  stageToolButton: {
    width: 36,
    height: 36,
    borderRadius: 18
  },
  stageNotice: {
    position: "absolute",
    top: 8,
    left: 16,
    right: 112,
    alignItems: "flex-start"
  },
  stageNoticePill: {
    borderRadius: 18
  },
  stageNoticeContent: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  stageNoticeText: {
    flexShrink: 1,
    color: roomEditorTheme.ink,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16
  },
  dragGhostAnchor: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    overflow: "visible"
  },

  // Selection capsule
  capsuleSlot: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 10
  },
  capsule: {
    borderRadius: 24
  },
  capsuleContent: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6
  },
  capsuleName: {
    flex: 1,
    color: roomEditorTheme.ink,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    lineHeight: 18
  },
  capsuleIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CONTROL_SURFACE,
    borderWidth: 1,
    borderColor: roomEditorTheme.edge
  },
  capsuleDirectionButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: CONTROL_SURFACE,
    borderWidth: 1,
    borderColor: roomEditorTheme.edge
  },
  capsuleDirectionText: {
    color: roomEditorTheme.ink,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16
  },
  capsulePrimaryButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: roomEditorTheme.accent
  },
  capsulePrimaryText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    lineHeight: 16
  },

  // Room style chooser (only with more than one shell)
  shellPicker: {
    gap: uiTheme.spacing.xs,
    paddingHorizontal: 16,
    paddingBottom: 6
  },
  shellPickerLabel: {
    color: roomEditorTheme.muted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    lineHeight: 16
  },
  shellPickerOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs
  },
  shellPickerOption: {
    maxWidth: "48%",
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: roomEditorTheme.edge,
    backgroundColor: CONTROL_SURFACE,
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.sm
  },
  shellPickerOptionSelected: {
    backgroundColor: SOFT_ROSE,
    borderColor: roomEditorTheme.accent
  },
  shellPickerOptionText: {
    color: roomEditorTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16
  },
  shellPickerOptionTextSelected: {
    color: roomEditorTheme.accent
  },

  // Dock
  dockShell: {
    marginHorizontal: ROOM_EDITOR_DOCK_MARGIN,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 30
  },
  dockContent: {
    padding: ROOM_EDITOR_DOCK_PADDING
  },
  inventoryHeader: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginHorizontal: 2,
    marginBottom: 8
  },
  inventoryTitleRow: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6
  },
  inventoryCount: {
    color: roomEditorTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16
  },
  inventoryHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16
  },
  inventoryTitle: {
    flexShrink: 1,
    color: roomEditorTheme.ink,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 18
  },
  dockToggleText: {
    color: roomEditorTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16
  },
  inventoryStatus: {
    marginHorizontal: 4,
    marginBottom: 6,
    color: roomEditorTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16
  },
  inventoryStatusFailed: {
    color: uiTheme.colors.dangerInk
  },

  // Categories
  categoryRailFrame: {
    marginBottom: 6,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: roomEditorTheme.hairline
  },
  categoryRail: {
    flexDirection: "row",
    gap: 4
  },
  categoryTab: {
    width: 78,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 16
  },
  categoryTabSelected: {
    backgroundColor: "#FFFFFF",
    shadowColor: roomEditorTheme.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  categoryTabText: {
    color: roomEditorTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 15
  },
  categoryTabTextSelected: {
    color: roomEditorTheme.accent,
    fontFamily: "Inter_600SemiBold"
  },

  // Tray
  inventoryScroll: {
    gap: ROOM_EDITOR_DOCK_GRID_GAP
  },
  inventoryColumn: {
    gap: ROOM_EDITOR_DOCK_GRID_GAP
  },
  inventoryPageDots: {
    height: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6
  },
  inventoryPageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: roomEditorTheme.hairline
  },
  inventoryPageDotActive: {
    width: 16,
    backgroundColor: roomEditorTheme.accent
  },
  inventoryLoadingRow: {
    flexDirection: "row",
    gap: ROOM_EDITOR_DOCK_GRID_GAP
  },
  inventoryLoadingItem: {
    flex: 1
  },
  inventoryLoadingCard: {
    height: ROOM_EDITOR_CARD_ART_HEIGHT,
    borderRadius: 18,
    backgroundColor: roomEditorTheme.cardBase
  },
  inventoryLoadingLabel: {
    width: 48,
    height: 6,
    marginTop: 11,
    marginBottom: 5,
    marginLeft: 2,
    borderRadius: 3,
    backgroundColor: roomEditorTheme.hairline
  },
  inventoryItemContainer: {
    minWidth: 0
  },
  inventoryItem: {
    height: ROOM_EDITOR_CARD_ART_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    padding: 5,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: "transparent",
    backgroundColor: roomEditorTheme.cardBase,
    experimental_backgroundImage: roomEditorTheme.cardGradient
  },
  inventoryItemLocked: {
    opacity: 0.46
  },
  inventoryItemSelected: {
    borderColor: roomEditorTheme.accent,
    backgroundColor: roomEditorTheme.cardSelectedBase,
    experimental_backgroundImage: roomEditorTheme.cardSelectedGradient
  },
  inventoryItemPressed: {
    transform: [{ scale: 0.96 }]
  },
  inventoryItemImage: {
    width: "100%",
    height: "100%"
  },
  inventoryItemName: {
    marginTop: 6,
    marginHorizontal: 2,
    color: roomEditorTheme.ink,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16
  },
  inventoryItemLock: {
    position: "absolute",
    right: 5,
    top: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85,55,78,0.76)"
  },
  inventoryItemCheck: {
    position: "absolute",
    right: 5,
    top: 5,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: roomEditorTheme.accent
  },
  inventoryItemPlacedMark: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: roomEditorTheme.hairline
  },
  inventoryEmptyState: {
    minHeight: ROOM_EDITOR_CARD_ART_HEIGHT + 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.md
  },
  inventoryEmptyText: {
    color: roomEditorTheme.muted,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center"
  },
  inventoryEmptyAction: {
    minHeight: 40,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: SOFT_ROSE
  },
  inventoryEmptyActionText: {
    color: roomEditorTheme.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 18
  }
})
