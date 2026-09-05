import { StyleSheet } from "react-native"
import { uiTheme } from "../../ui/theme"

export const shopPreviewStyles = StyleSheet.create({
  previewCard: {
    gap: 10,
    padding: 2,
    borderRadius: 24,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    overflow: "hidden"
  },
  previewHeroBody: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 6,
    minHeight: 218
  },
  previewInfoPanel: {
    flex: 0.86,
    minWidth: 132,
    justifyContent: "center",
    gap: 4,
    paddingVertical: 0
  },
  previewInfoTop: {
    gap: 3
  },
  previewEyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
    letterSpacing: 1.8
  },
  previewTitle: {
    ...uiTheme.font.display,
    fontSize: 34,
    lineHeight: 38,
    color: uiTheme.colors.textPrimary
  },
  previewTitleCompact: {
    fontSize: 15.5,
    lineHeight: 18.5
  },
  previewTitleRoomCompact: {
    fontSize: 14,
    lineHeight: 16.5,
    fontWeight: "900",
    letterSpacing: 0
  },
  statePill: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.90)"
  },
  stateText: {
    ...uiTheme.font.captionBold,
    color: "rgba(86, 67, 99, 0.82)",
    textAlign: "center"
  },
  pricePill: {
    minHeight: 30,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 252, 242, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.90)"
  },
  pricePillRoomCompact: {
    minHeight: 28,
    paddingHorizontal: 7,
    backgroundColor: "rgba(255, 255, 250, 0.84)"
  },
  pricePillText: {
    ...uiTheme.font.bodyBold,
    fontSize: 17,
    color: uiTheme.colors.primary,
    fontVariant: ["tabular-nums"]
  },
  pricePillTextOwned: {
    color: uiTheme.colors.successInk
  },
  pricePillTextRoomCompact: {
    fontSize: 16,
    lineHeight: 18
  },
  livePill: {
    minHeight: 28,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 221, 238, 0.96)"
  },
  livePillText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primary
  },
  previewStage: {
    flex: 1,
    minWidth: 148,
    minHeight: 272,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "rgba(255, 239, 248, 0.34)",
    borderWidth: 0,
    borderColor: "transparent",
    overflow: "hidden"
  },
  previewStageAvatar: {
    backgroundColor: "rgba(255, 239, 248, 0.42)"
  },
  previewStageRoom: {
    minHeight: 262,
    backgroundColor: "rgba(255, 245, 239, 0.54)"
  },
  previewSparkleA: {
    position: "absolute",
    left: 16,
    top: 28,
    zIndex: 3
  },
  previewSparkleB: {
    position: "absolute",
    right: 20,
    top: 58,
    zIndex: 3
  },
  shopAvatarPreview: {
    width: "100%",
    minHeight: 168,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
    zIndex: 10
  },
  shopAvatarFrame: {
    marginBottom: 5,
    overflow: "visible",
    transform: [{ translateY: 14 }]
  },
  shopAvatarLayer: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%"
  },
  shopAvatarMetaPill: {
    position: "absolute",
    bottom: 0,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.82)"
  },
  shopAvatarMetaDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: uiTheme.colors.primary
  },
  shopAvatarMetaText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textPrimary
  },
  shopRoomScenePreview: {
    width: "100%",
    minHeight: 218,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "rgba(255, 241, 248, 0.58)"
  },
  shopRoomSceneRenderer: {
    width: "134%",
    backgroundColor: "transparent",
    transform: [{ translateY: -4 }, { scale: 1 }]
  },
  roomHeroTopOverlay: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 8,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8
  },
  roomHeroTitleGlass: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 247, 252, 0.76)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.76)"
  },
  roomHeroEyebrow: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.primary,
    fontWeight: "900",
    letterSpacing: 1.5
  },
  roomHeroTitle: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 15
  },
  avatarHeroTitleWithRemove: {
    paddingRight: 36
  },
  avatarPreviewRemoveButton: {
    position: "absolute",
    right: 8,
    top: 11,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255, 236, 246, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255, 79, 152, 0.22)"
  },
  avatarPreviewRemoveButtonPressed: {
    backgroundColor: "rgba(255, 219, 236, 0.98)",
    transform: [{ scale: 0.96 }]
  },
  roomHeroStatusPill: {
    minHeight: 29,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "rgba(255, 255, 250, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.80)"
  },
  roomHeroStatusText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.successInk,
    fontSize: 13,
    lineHeight: 15
  },
  avatarHeroTopPanel: {
    height: 54,
    borderRadius: 18
  },
  roomHeroAction: {
    position: "absolute",
    right: 10,
    bottom: 9,
    zIndex: 5,
    minWidth: 124,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#F93696",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.48)",
    ...uiTheme.shadow.glow
  },
  roomHeroActionText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 19,
    textAlign: "center"
  },
  avatarHeroAction: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 18,
    backgroundColor: "#F93696",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.48)",
    ...uiTheme.shadow.glow
  },
  avatarHeroActionContent: {
    width: "100%",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  avatarHeroActionText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center"
  },
  avatarHeroPricePill: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#FFFFFF"
  },
  avatarHeroPriceText: {
    ...uiTheme.font.bodyBold,
    color: "#D91F78",
    fontSize: 15,
    lineHeight: 18,
    fontVariant: ["tabular-nums"]
  },
  previewDescription: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    fontWeight: "700",
    lineHeight: 20
  },
  primaryAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#F93696",
    ...uiTheme.shadow.glow
  },
  primaryActionCompact: {
    minHeight: 44
  },
  primaryActionRoomCompact: {
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: 10
  },
  primaryActionPressed: {
    backgroundColor: uiTheme.colors.primaryPressed,
    transform: [{ scale: 0.99 }]
  },
  primaryActionDisabled: {
    opacity: 0.5
  },
  primaryActionText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
    textAlign: "center"
  },
  previewFootnote: {
    ...uiTheme.font.micro,
    color: "rgba(86, 67, 99, 0.62)",
    fontWeight: "800",
    textAlign: "center"
  }
})
