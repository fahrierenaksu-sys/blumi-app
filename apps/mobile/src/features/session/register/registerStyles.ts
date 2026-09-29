import { StyleSheet } from "react-native"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import { REGISTER_PHONE_PANEL_LAYOUT as phonePanel } from "../registerPhonePanelModel"

export const registerStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.backgroundWarm
  },
  safe: {
    flex: 1
  },
  flex: {
    flex: 1
  },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: uiTheme.spacing.xxs,
    paddingBottom: uiTheme.spacing.sm,
    gap: 0
  },
  createContent: {
    justifyContent: "flex-start",
    gap: uiTheme.spacing.md
  },
  topBar: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.soft
  },
  brandRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs
  },
  brandMark: {
    borderRadius: 14
  },
  brandText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary,
    letterSpacing: -0.25
  },
  stepPill: {
    minWidth: 54,
    minHeight: 36,
    paddingHorizontal: uiTheme.spacing.sm,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.66)"
  },
  stepPillText: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textSecondary
  },
  heading: {
    paddingTop: 26
  },
  createHeading: {
    alignItems: "center",
    gap: 3,
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.xs,
    paddingBottom: 0
  },
  createHeadingCompact: {
    paddingHorizontal: uiTheme.spacing.md
  },
  createCharacterScene: {
    alignItems: "center",
    justifyContent: "center",
    height: 148,
    position: "relative",
    width: 240
  },
  createCharacterSceneCompact: {
    height: 136,
    width: 224
  },
  createCharacterSceneVeryCompact: {
    height: 124,
    width: 208
  },
  createCharacterHalo: {
    backgroundColor: "rgba(255, 223, 233, 0.78)",
    borderRadius: 96,
    height: 126,
    position: "absolute",
    top: 12,
    width: 208,
    ...uiTheme.shadow.glowSubtle
  },
  createCharacterFrame: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderColor: "rgba(255,255,255,0.96)",
    borderRadius: 102,
    borderWidth: 1,
    height: 136,
    position: "absolute",
    top: 6,
    width: 226,
    ...uiTheme.shadow.soft
  },
  createCharacterHome: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: uiTheme.colors.glassBorder,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    position: "absolute",
    right: 4,
    top: 8,
    width: 30,
    zIndex: 2,
    ...uiTheme.shadow.soft
  },
  createHeadingTitle: {
    ...uiTheme.font.heading,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  createHeadingBody: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    textAlign: "center"
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12
  },
  eyebrowSpark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C65378",
    transform: [{ rotate: "45deg" }],
    ...uiTheme.shadow.glowSubtle
  },
  eyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primaryDeep,
    letterSpacing: 1.4
  },
  title: {
    color: uiTheme.colors.textPrimary,
    fontFamily: "Inter_900Black",
    fontWeight: "900",
    fontSize: 36,
    letterSpacing: -1.5,
    maxWidth: 350
  },
  body: {
    color: uiTheme.colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    fontWeight: "400",
    maxWidth: 350,
    marginTop: uiTheme.spacing.sm
  },
  progressRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 20,
    marginHorizontal: 2
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.62)"
  },
  progressTrackActive: {
    backgroundColor: uiTheme.colors.actionDark,
    ...uiTheme.shadow.glowSubtle
  },
  formCard: {
    gap: uiTheme.spacing.sm,
    marginTop: 18,
    padding: 18,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.46)",
    borderColor: "rgba(255,255,255,0.84)",
    ...uiTheme.shadow.deep
  },
  formCardCompact: {
    marginTop: 14,
    padding: 16
  },
  formGlassTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  formMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: phonePanel.spacing.headerGap,
    paddingBottom: 2
  },
  formMetaIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,240,246,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    ...uiTheme.shadow.soft
  },
  formMetaCopy: {
    flex: 1,
    gap: 3,
    paddingTop: 1
  },
  formMetaEyebrow: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.primaryDeep,
    fontSize: phonePanel.typography.eyebrow.fontSize,
    lineHeight: phonePanel.typography.eyebrow.lineHeight,
    letterSpacing: phonePanel.typography.eyebrow.letterSpacing
  },
  formMetaTitle: {
    color: uiTheme.colors.textPrimary,
    fontFamily: "Inter_800ExtraBold",
    fontWeight: "800",
    fontSize: phonePanel.typography.title.fontSize,
    lineHeight: phonePanel.typography.title.lineHeight,
    letterSpacing: phonePanel.typography.title.letterSpacing
  },
  stepContent: {
    gap: phonePanel.spacing.sectionGap
  },
  stepContentCompact: {
    gap: uiTheme.spacing.sm
  },
  otpField: {
    gap: uiTheme.spacing.xs
  },
  otpLabel: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textPrimary
  },
  otpInputShell: {
    minHeight: 58,
    position: "relative"
  },
  otpNativeInput: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    color: "transparent",
    opacity: 0.02
  },
  otpCells: {
    flex: 1,
    flexDirection: "row",
    gap: 7
  },
  otpCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.66)",
    borderWidth: 1.5,
    borderColor: uiTheme.colors.borderStrong
  },
  otpCellFilled: {
    backgroundColor: "rgba(255,238,246,0.86)",
    borderColor: uiTheme.colors.primarySoft
  },
  otpCellActive: {
    borderColor: uiTheme.colors.primary,
    ...uiTheme.shadow.glowSubtle
  },
  otpDigit: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary
  },
  otpError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk,
    paddingHorizontal: 2
  },
  phoneLabel: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textPrimary,
    fontSize: phonePanel.typography.fieldLabel.fontSize,
    lineHeight: phonePanel.typography.fieldLabel.lineHeight,
    letterSpacing: phonePanel.typography.fieldLabel.letterSpacing
  },
  phoneControl: {
    minHeight: phonePanel.spacing.fieldControlMinHeight,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong,
    backgroundColor: "rgba(255,255,255,0.88)",
    overflow: "hidden",
    ...uiTheme.shadow.soft
  },
  phoneControlError: {
    borderColor: uiTheme.colors.danger,
    backgroundColor: "rgba(255,248,249,0.94)"
  },
  phoneDivider: {
    width: 1,
    height: 28,
    backgroundColor: uiTheme.colors.divider
  },
  phoneInput: {
    flex: 1,
    minHeight: phonePanel.spacing.fieldControlMinHeight,
    paddingHorizontal: 14,
    color: uiTheme.colors.textPrimary,
    ...uiTheme.font.bodyMedium,
    fontSize: phonePanel.typography.fieldValue.fontSize,
    lineHeight: phonePanel.typography.fieldValue.lineHeight,
    letterSpacing: phonePanel.typography.fieldValue.letterSpacing
  },
  phoneError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk,
    paddingHorizontal: 2
  },
  phoneHint: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    paddingHorizontal: 4,
    textAlign: "center",
    fontSize: phonePanel.typography.helper.fontSize,
    lineHeight: phonePanel.typography.helper.lineHeight,
    letterSpacing: phonePanel.typography.helper.letterSpacing
  },
  sentCard: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    padding: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.md,
    backgroundColor: uiTheme.colors.successSoft,
    borderWidth: 1,
    borderColor: "rgba(58,192,138,0.22)"
  },
  sentIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)"
  },
  sentCopy: {
    flex: 1,
    gap: 1
  },
  sentTitle: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.successInk
  },
  sentNumber: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.successInk
  },
  changeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  changeButtonText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.successInk
  },
  resendButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.sm
  },
  resendText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep
  },
  errorBox: {
    flexDirection: "row",
    gap: uiTheme.spacing.sm,
    alignItems: "center",
    borderRadius: uiTheme.radius.md,
    padding: uiTheme.spacing.sm,
    backgroundColor: uiTheme.colors.dangerSoft
  },
  error: {
    flex: 1,
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.dangerInk
  },
  submitWrap: {
    borderRadius: 20,
    overflow: "hidden",
    ...uiTheme.shadow.glowSubtle
  },
  submit: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: uiTheme.spacing.lg
  },
  submitLabelRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.sm,
    position: "relative"
  },
  submitText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF"
  },
  submitArrowBubble: {
    position: "absolute",
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  disabled: {
    opacity: uiTheme.opacity.disabled,
    shadowOpacity: 0
  },
  submitPressed: {
    transform: [{ scale: uiTheme.animation.scalePress }]
  },
  controlPressed: {
    opacity: 0.7
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: phonePanel.spacing.privacyTop,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(233,223,232,0.82)",
    backgroundColor: "rgba(255,250,252,0.72)"
  },
  privacyRowCompact: {
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  privacyIcon: {
    alignItems: "center",
    height: phonePanel.typography.privacy.lineHeight,
    justifyContent: "center",
    width: 14
  },
  privacyText: {
    color: uiTheme.colors.textSecondary,
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: phonePanel.typography.privacy.fontSize,
    fontWeight: "400",
    lineHeight: phonePanel.typography.privacy.lineHeight,
    letterSpacing: phonePanel.typography.privacy.letterSpacing
  },
  recoveryLink: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  recoveryLinkText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep,
    textDecorationLine: "underline"
  },
  recoveryBackdrop: {
    flex: 1,
    backgroundColor: "rgba(45, 22, 37, 0.42)"
  },
  recoveryKeyboard: {
    flex: 1,
    justifyContent: "flex-end",
    padding: uiTheme.spacing.lg
  },
  recoveryScrollContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingVertical: uiTheme.spacing.xs
  },
  recoveryCard: {
    gap: uiTheme.spacing.sm,
    padding: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.lg,
    backgroundColor: uiTheme.colors.backgroundWarm,
    ...uiTheme.shadow.deep
  },
  recoveryTitle: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary
  },
  recoveryBody: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary
  },
  recoveryInput: {
    minHeight: 52,
    borderRadius: uiTheme.radius.md,
    paddingHorizontal: uiTheme.spacing.sm,
    color: uiTheme.colors.textPrimary,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong,
    ...uiTheme.font.bodyMedium
  },
  recoveryError: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk
  },
  recoveryActions: {
    flexDirection: "row",
    gap: uiTheme.spacing.sm,
    marginTop: uiTheme.spacing.xs
  },
  recoveryActionsStacked: {
    flexDirection: "column"
  },
  recoveryActionStacked: {
    flex: 0,
    width: "100%"
  },
  recoverySecondary: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTheme.radius.md,
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong
  },
  recoverySecondaryText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary
  },
  recoveryPrimary: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: uiTheme.radius.md,
    backgroundColor: uiTheme.colors.primary
  },
  recoveryPrimaryText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF"
  },
  footerArea: {
    alignItems: "flex-start",
    gap: 0,
    marginTop: phonePanel.spacing.footerTop
  },
  footerAreaCompact: {
    gap: 4,
    marginTop: 4
  },
  termsConsent: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    minHeight: phonePanel.spacing.termsTargetMinHeight,
    paddingVertical: 12,
    paddingHorizontal: 4
  },
  termsConsentCompact: {
    paddingHorizontal: 0,
    paddingVertical: 5
  },
  termsConsentText: {
    color: uiTheme.colors.textSecondary,
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 11.5,
    lineHeight: 17,
    letterSpacing: -0.1,
    marginLeft: 8
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: -8
  },
  legalRowWrapped: {
    flexWrap: "wrap",
    marginLeft: -8,
    rowGap: 2
  },
  legalPressable: {
    minHeight: phonePanel.spacing.legalTargetMinHeight,
    justifyContent: "center",
    paddingHorizontal: 8
  },
  legalLink: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.primaryDeep,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    fontSize: phonePanel.typography.legal.fontSize,
    lineHeight: phonePanel.typography.legal.lineHeight,
    letterSpacing: phonePanel.typography.legal.letterSpacing,
    textDecorationLine: "underline"
  },
  legalSeparator: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    fontSize: phonePanel.typography.footer.fontSize,
    lineHeight: phonePanel.typography.footer.lineHeight,
    letterSpacing: phonePanel.typography.footer.letterSpacing
  },
  footerNote: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    fontSize: phonePanel.typography.footer.fontSize,
    lineHeight: phonePanel.typography.footer.lineHeight,
    letterSpacing: phonePanel.typography.footer.letterSpacing
  }
})
