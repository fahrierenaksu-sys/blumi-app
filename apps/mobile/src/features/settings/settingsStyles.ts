import { StyleSheet } from "react-native"
import { uiTheme } from "../../ui/theme"

/** Shared Settings styles: one sheet so every extracted section renders exactly as the original screen. */
export const settingsStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  safe: {
    flex: 1,
    paddingTop: uiTheme.spacing.sm
  },
  scroll: {
    gap: uiTheme.spacing.md
  },

  /* ── Section ────────────────────────────────────── */
  sectionWrap: {
    gap: uiTheme.spacing.xs
  },
  sectionOverline: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
    paddingLeft: uiTheme.spacing.xxs,
    marginBottom: 2
  },
  sectionCard: {
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    overflow: "hidden",
    ...uiTheme.shadow.soft
  },
  privacyNote: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: uiTheme.spacing.xs
  },
  myReportsPanel: {
    paddingHorizontal: uiTheme.spacing.md,
    paddingBottom: uiTheme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: uiTheme.colors.glassBorder
  },
  myReportRow: {
    gap: uiTheme.spacing.xxs,
    paddingVertical: uiTheme.spacing.sm
  },
  myReportDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: uiTheme.colors.glassBorder
  },
  myReportHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm
  },
  myReportStatus: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary
  },
  myReportDate: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted
  },
  myReportMessage: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    lineHeight: 20
  },
  myReportErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.sm,
    paddingTop: uiTheme.spacing.sm
  },
  myReportRetry: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.primary
  },
  deletionModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: uiTheme.spacing.lg,
    backgroundColor: "rgba(32, 20, 30, 0.48)"
  },
  deletionModalCard: {
    width: "100%",
    borderRadius: uiTheme.radius.xl,
    padding: uiTheme.spacing.lg,
    gap: uiTheme.spacing.sm,
    backgroundColor: uiTheme.colors.background
  },
  deletionModalTitle: { ...uiTheme.font.heading, color: uiTheme.colors.textPrimary },
  deletionModalBody: { ...uiTheme.font.bodySmall, color: uiTheme.colors.textSecondary, lineHeight: 20 },
  deletionCodeInput: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    letterSpacing: 8,
    textAlign: "center",
    borderWidth: 1,
    borderColor: uiTheme.colors.divider,
    borderRadius: uiTheme.radius.md,
    paddingVertical: uiTheme.spacing.sm
  },
  phoneChangeControl: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: uiTheme.colors.divider,
    borderRadius: uiTheme.radius.md,
    backgroundColor: uiTheme.colors.surface,
    overflow: "hidden"
  },
  phoneChangeDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: uiTheme.colors.divider
  },
  phoneChangeInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: uiTheme.spacing.sm,
    paddingVertical: uiTheme.spacing.sm,
    ...uiTheme.font.body,
    color: uiTheme.colors.textPrimary
  },
  deletionModalActions: { flexDirection: "row", justifyContent: "flex-end", gap: uiTheme.spacing.sm },
  deletionSecondaryButton: { paddingHorizontal: uiTheme.spacing.md, paddingVertical: uiTheme.spacing.sm },
  deletionSecondaryText: { ...uiTheme.font.label, color: uiTheme.colors.textSecondary },
  deletionPrimaryButton: { borderRadius: uiTheme.radius.full, paddingHorizontal: uiTheme.spacing.md, paddingVertical: uiTheme.spacing.sm, backgroundColor: uiTheme.colors.danger },
  deletionButtonDisabled: { opacity: 0.45 },
  deletionPrimaryText: { ...uiTheme.font.label, color: "#FFFFFF" },

  /* ── Row ─────────────────────────────────────────── */
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    gap: uiTheme.spacing.sm
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: uiTheme.colors.divider
  },
  rowPressed: {
    backgroundColor: uiTheme.colors.surfaceMuted
  },
  rowBody: {
    flex: 1
  },
  rowLabel: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.textPrimary
  },
  rowDescription: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textMuted,
    marginTop: 2
  },
  rowValue: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  /* ── Icon Circle ─────────────────────────────────── */
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: "hidden"
  },
  iconGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  /* ── Empty state ─────────────────────────────────── */
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.md
  },
  emptyText: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textMuted,
    flex: 1,
    lineHeight: 20
  },

  /* ── Blocked card ────────────────────────────────── */
  blockedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm
  },
  blockedBody: {
    flex: 1,
    gap: 2
  },
  blockedId: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textPrimary
  },
  blockedLabel: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.danger
  },
  unblockButton: {
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 6,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: uiTheme.colors.danger
  },
  unblockText: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.dangerInk
  },

  /* ── Footer ──────────────────────────────────────── */
  footerWrap: {
    alignItems: "center",
    gap: uiTheme.spacing.xs,
    paddingVertical: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.md
  },
  footerTagline: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textMuted,
    textAlign: "center",
    lineHeight: 20
  },
  footerVersion: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.textMuted,
    opacity: 0.6
  }
})
