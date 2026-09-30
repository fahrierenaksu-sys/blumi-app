import { StyleSheet } from "react-native"
import { uiTheme } from "../../../ui/theme"

/** My Room editor styles, moved verbatim from MyRoomEditorScreen. */
export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FCEAF2"
  },
  safe: {
    flex: 1,
    paddingHorizontal: uiTheme.spacing.lg
  },
  editorContentFlex: {
    flex: 1
  },
  editorContent: {
    flexGrow: 1,
    paddingBottom: uiTheme.spacing.lg
  },
  roomLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "rgba(255, 250, 248, 0.78)",
    gap: 8,
    justifyContent: "center"
  },
  roomLoadingOverlayText: {
    color: "#6D4D61",
    fontFamily: "Nunito_700Bold",
    fontSize: 14
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: uiTheme.spacing.sm,
    paddingBottom: 10
  },
  cancelButton: {
    width: 40,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.42)",
    shadowColor: "#D9A0BF",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2
  },
  actionButton: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.84)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.42)"
  },
  iconButtonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.94 }]
  },
  saveButton: {
    paddingHorizontal: 17,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5F9D",
    borderRadius: 20,
    shadowColor: "#FF4F98",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  saveButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0
  },
  titleBlock: {
    flex: 1
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  title: {
    color: "#35213A",
    ...uiTheme.font.heading,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: 2,
    color: "#7D6175",
    ...uiTheme.font.caption,
    fontWeight: "700"
  },
  persistenceBanner: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: uiTheme.spacing.sm,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.lg,
    backgroundColor: "#FFF1F5",
    borderWidth: 1,
    borderColor: "#F1B8CA"
  },
  persistenceBannerText: {
    flex: 1,
    color: "#704054",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  persistenceRetryButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18
  },
  qaPreviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.sm,
    paddingVertical: 7,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#FFF5DB",
    borderWidth: 1,
    borderColor: "#F2D795"
  },
  qaPreviewBannerText: {
    color: "#856120",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  stageWrap: {
    height: 280,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: uiTheme.spacing.sm,
    paddingBottom: uiTheme.spacing.sm,
    position: "relative"
  },
  selectedItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
    padding: 6,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.76)",
    borderWidth: 1,
    borderColor: "rgba(222,161,192,0.42)"
  },
  selectedItemAction: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: "#FFF8FB"
  },
  selectedItemActionPrimary: {
    flex: 1.25,
    backgroundColor: uiTheme.colors.primaryDeep
  },
  selectedItemActionText: {
    flexShrink: 1,
    color: "#6E5064",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center"
  },
  selectedItemActionPrimaryText: {
    flexShrink: 1,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center"
  },
  selectedItemActionDangerText: {
    color: "#B83F5C"
  },
  roomWorldStatusPill: {
    position: "absolute",
    top: 18,
    left: 12,
    zIndex: 2,
    maxWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.5)",
    shadowColor: "#C98AA9",
    shadowOpacity: 0.14,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2
  },
  roomWorldStatusText: {
    color: "#5F4058",
    fontSize: 11,
    fontWeight: "800"
  },
  dragGhostAnchor: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    overflow: "visible"
  },
  roomImageWrapper: {
    width: "100%",
    position: "relative",
    borderRadius: 26,
    backgroundColor: "#FFF9FC",
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.48)",
    shadowColor: "#C98AA9",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    overflow: "hidden"
  },
  renderer: {
    backgroundColor: "#FFF9FC"
  },
  inventoryWrap: {
    marginTop: uiTheme.spacing.sm,
    minHeight: 338,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(233,169,199,0.46)",
    paddingTop: 9,
    paddingBottom: uiTheme.spacing.md,
    shadowColor: "#B57294",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5
  },
  inventoryHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    marginBottom: 8,
    borderRadius: 2,
    backgroundColor: "rgba(151, 107, 132, 0.34)"
  },
  shellPicker: {
    gap: uiTheme.spacing.xs
  },
  shellPickerLabel: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textSecondary
  },
  shellPickerOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs
  },
  shellPickerOption: {
    maxWidth: "48%",
    minHeight: 36,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    backgroundColor: "rgba(255,255,255,0.62)",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.sm
  },
  shellPickerOptionSelected: {
    backgroundColor: uiTheme.colors.primary,
    borderColor: uiTheme.colors.primary
  },
  shellPickerOptionText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  shellPickerOptionTextSelected: {
    color: "#FFFFFF"
  },
  inventoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: uiTheme.spacing.lg,
    marginBottom: uiTheme.spacing.sm
  },
  inventoryTitle: {
    color: "#3A253D",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5
  },
  inventoryEyebrow: {
    marginTop: 2,
    color: "#896F80",
    fontSize: 11,
    fontWeight: "700"
  },
  inventoryStatusFailed: {
    color: "#B75B73"
  },
  inventorySubtitle: {
    color: "#A26484",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2
  },
  inventorySubtitleDisabled: {
    color: "#B9ABB4"
  },
  inventorySearchField: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: uiTheme.spacing.lg,
    marginBottom: uiTheme.spacing.sm,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#FFF7FA",
    borderWidth: 1,
    borderColor: "rgba(222,161,192,0.5)"
  },
  inventorySearchInput: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 0,
    color: "#4B3047",
    fontSize: 13,
    fontWeight: "600"
  },
  inventorySearchClear: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  categoryRail: {
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: uiTheme.spacing.lg,
    marginBottom: 8
  },
  categoryChip: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(219,164,191,0.52)",
    backgroundColor: "#FFF8FB"
  },
  categoryChipSelected: {
    borderColor: "#FF5F9D",
    backgroundColor: "#FF5F9D"
  },
  categoryChipText: {
    color: "#806579",
    fontSize: 11,
    fontWeight: "800"
  },
  categoryChipTextSelected: {
    color: "#FFFFFF"
  },
  inventoryScroll: {
    paddingHorizontal: uiTheme.spacing.md,
    gap: 10,
    paddingTop: 8
  },
  inventoryLoadingRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 8
  },
  inventoryLoadingItem: {
    width: 72,
    alignItems: "center"
  },
  inventoryLoadingCard: {
    width: 72,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,163,191,0.3)",
    backgroundColor: "#F9EEF4"
  },
  inventoryLoadingLabel: {
    width: 42,
    height: 5,
    marginTop: 8,
    borderRadius: 3,
    backgroundColor: "#F3E3EC"
  },
  inventoryLoadingPreview: {
    opacity: 0.92
  },
  inventoryLoadingPreviewContentRow: {
    minHeight: 72
  },
  inventoryLoadingPreviewImage: {
    backgroundColor: "#F5EAF0"
  },
  inventoryLoadingPreviewCopy: {
    flex: 1,
    gap: 8
  },
  inventoryLoadingPreviewEyebrow: {
    width: 64,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F0DFE8"
  },
  inventoryLoadingPreviewTitle: {
    width: "76%",
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F0DFE8"
  },
  inventoryLoadingPreviewHint: {
    width: "62%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F0DFE8"
  },
  inventoryLoadingPreviewAction: {
    alignSelf: "flex-end",
    width: 112,
    height: 38,
    borderRadius: 15,
    backgroundColor: "#F3E3EC"
  },
  inventoryItemContainer: {
    alignItems: "center",
    justifyContent: "center"
  },
  inventoryItem: {
    width: 72,
    height: 52,
    backgroundColor: "#FFF9FC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,163,191,0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 7
  },
  inventoryItemLocked: {
    opacity: 0.46
  },
  inventoryItemPlaced: {
    borderColor: "rgba(42, 163, 111, 0.52)",
    backgroundColor: "#F0FCF6"
  },
  inventoryItemSelected: {
    borderColor: "#FF5F9D",
    backgroundColor: "#FFF0F6",
    shadowColor: "#FF5F9D",
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
  },
  inventoryItemPressed: {
    backgroundColor: "#FCE1EC",
    borderColor: "#EE9CC2",
    transform: [{ scale: 0.94 }]
  },
  inventoryItemImage: {
    width: "100%",
    height: "100%"
  },
  inventoryItemName: {
    width: 72,
    marginTop: 4,
    color: "#5D4058",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center"
  },
  inventoryItemLock: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(85,55,78,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)"
  },
  inventoryItemPlacedMark: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#BAF0D1"
  },
  selectedInventoryPreview: {
    minHeight: 90,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    marginHorizontal: uiTheme.spacing.md,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(232,161,197,0.52)",
    backgroundColor: "#FFF7FB"
  },
  selectedInventoryContentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  selectedInventoryImageWrap: {
    width: 60,
    height: 60,
    padding: 5,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBE5EF"
  },
  selectedInventoryImage: {
    width: "100%",
    height: "100%"
  },
  selectedInventoryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5
  },
  selectedInventoryEyebrow: {
    color: "#B26C8B",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  selectedInventoryHint: {
    color: "#8D7081",
    fontSize: 10,
    fontWeight: "700"
  },
  selectedInventoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  selectedInventoryName: {
    flex: 1,
    color: "#3C273E",
    fontSize: 13,
    fontWeight: "800"
  },
  selectedInventoryPlacedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#E4F8EC"
  },
  selectedInventoryPlacedText: {
    color: "#208458",
    fontSize: 9,
    fontWeight: "800"
  },
  rotationRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5
  },
  rotationOption: {
    minWidth: 36,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: "#FFF8FB",
    borderWidth: 1,
    borderColor: "rgba(222,161,192,0.38)"
  },
  rotationOptionSelected: {
    backgroundColor: "#FFE2EF",
    borderColor: "#FF83B8"
  },
  rotationOptionText: {
    color: "#806579",
    fontSize: 9,
    fontWeight: "800"
  },
  rotationOptionTextSelected: {
    color: "#C83B78"
  },
  placeSelectedInventoryButton: {
    minHeight: 38,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 11,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5F9D",
    shadowColor: "#FF4F98",
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5
  },
  placeSelectedInventoryButtonDisabled: {
    opacity: 1,
    backgroundColor: "#F2E7ED",
    shadowOpacity: 0,
    elevation: 0
  },
  placeSelectedInventoryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  placeSelectedInventoryButtonTextDisabled: {
    color: "#A68D9C"
  },
  placeSelectedInventoryButtonPressed: {
    transform: [{ scale: 0.94 }]
  },
  inventoryEmptyState: {
    minWidth: 220,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.md
  },
  inventoryEmptyText: {
    color: "#806579",
    fontSize: 12,
    fontWeight: "700"
  },
  inventoryEmptyAction: {
    minHeight: 36,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#FFE2EF"
  },
  inventoryEmptyActionText: {
    color: "#C83B78",
    fontSize: 12,
    fontWeight: "900"
  }
})
