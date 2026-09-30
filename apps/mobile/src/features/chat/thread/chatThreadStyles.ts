import { StyleSheet } from "react-native"
import { uiTheme } from "../../../ui/theme"

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background,
  },
  safe: {
    flex: 1,
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.sm,
  },
  flex: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    minHeight: 56,
    paddingBottom: uiTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(53, 27, 50, 0.08)"
  },
  chatHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  chatHeaderName: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    fontWeight: "800"
  },
  matchReplayText: {
    ...uiTheme.font.micro,
    color: uiTheme.colors.primaryDeep,
    fontWeight: "700",
    marginTop: 2
  },
  moreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  messageListContainer: {
    flex: 1,
  },
  messageListContent: {
    paddingVertical: uiTheme.spacing.md,
    paddingHorizontal: 4
  },
  loadEarlierButton: {
    alignSelf: "center",
    minHeight: 34,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 7,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    marginBottom: uiTheme.spacing.sm,
  },
  loadEarlierButtonPressed: {
    opacity: 0.82,
  },
  loadEarlierButtonDisabled: {
    opacity: 0.55,
  },
  loadEarlierText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textMuted,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: uiTheme.spacing.xl,
  },
  emptyText: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
  },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.sm,
    paddingBottom: uiTheme.spacing.xxxl,
    position: "relative",
  },
  emptyChatGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: uiTheme.colors.accentGlow,
  },
  emptyChatTitle: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    marginTop: uiTheme.spacing.sm,
  },
  emptyChatBody: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
  },
  messageLoadState: {
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    maxWidth: 320,
  },
  retryMessagesButton: {
    minHeight: 44,
    marginTop: uiTheme.spacing.xs,
    paddingHorizontal: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTheme.spacing.xs,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
  },
  retryMessagesButtonPressed: {
    opacity: 0.82,
  },
  retryMessagesButtonDisabled: {
    opacity: 0.6,
  },
  retryMessagesText: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.primaryDeep,
  },
  composerSafe: {
    backgroundColor: "transparent",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: uiTheme.spacing.xs,
    paddingVertical: uiTheme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: uiTheme.colors.border,
  },
  inputWrap: {
    flex: 1,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glassStrong,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    overflow: "hidden",
  },
  roomInviteButton: {
    alignItems: "center",
    backgroundColor: uiTheme.colors.primarySoft,
    borderColor: "rgba(255, 79, 152, 0.22)",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  roomInviteButtonPressed: {
    backgroundColor: "#FFD3E5"
  },
  roomInviteButtonDisabled: {
    opacity: uiTheme.opacity.disabled
  },
  input: {
    minHeight: 44,
    maxHeight: 100,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    ...uiTheme.font.body,
    color: uiTheme.colors.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    ...uiTheme.shadow.glowSubtle,
  },
  sendButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonPressed: {
    opacity: 0.9,
  },
})

export const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  rowGroupInner: {
    marginBottom: 4
  },
  rowGroupEnd: {
    marginBottom: 16
  },
  rowMe: {
    justifyContent: "flex-end",
  },
  rowThem: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    position: "relative"
  },
  bubbleMe: {
    backgroundColor: "#F6E7EB",
    borderColor: "#E8D7DD"
  },
  bubbleThem: {
    backgroundColor: "#FFFDFC",
    borderColor: "#EEE5E8"
  },
  bubbleMefirst: {
    borderBottomRightRadius: 6
  },
  bubbleMemiddle: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6
  },
  bubbleMelast: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 5
  },
  bubbleMesingle: {
    borderBottomRightRadius: 5
  },
  bubbleThemfirst: {
    borderBottomLeftRadius: 6
  },
  bubbleThemmiddle: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6
  },
  bubbleThemlast: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 5
  },
  bubbleThemsingle: {
    borderBottomLeftRadius: 5
  },
  tail: {
    position: "absolute",
    bottom: 1,
    width: 10,
    height: 10,
    transform: [{ rotate: "45deg" }]
  },
  tailMe: {
    right: -4,
    backgroundColor: "#F6E7EB",
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: "#E8D7DD"
  },
  tailThem: {
    left: -4,
    backgroundColor: "#FFFDFC",
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#EEE5E8"
  },
  contentRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8
  },
  metadataRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    marginBottom: 1
  },
  body: {
    ...uiTheme.font.body,
    color: "#2F2630",
    flexShrink: 1
  },
  bodyMe: {
    color: "#351B32"
  },
  time: {
    ...uiTheme.font.micro,
    color: "#8D7D86",
    fontSize: 10,
  },
  timeMe: {
    color: "#876F78"
  },
  dateSep: {
    alignItems: "center",
    paddingVertical: uiTheme.spacing.md,
  },
  dateSepPill: {
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: 5,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.soft,
  },
  dateSepText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
})

export const bubbleGroupStyles = {
  me: {
    single: bubbleStyles.bubbleMesingle,
    first: bubbleStyles.bubbleMefirst,
    middle: bubbleStyles.bubbleMemiddle,
    last: bubbleStyles.bubbleMelast
  },
  them: {
    single: bubbleStyles.bubbleThemsingle,
    first: bubbleStyles.bubbleThemfirst,
    middle: bubbleStyles.bubbleThemmiddle,
    last: bubbleStyles.bubbleThemlast
  }
} as const
