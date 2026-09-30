import { useEffect, useMemo, useState } from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, Text, View } from "react-native"
import { uiTheme } from "../../ui/theme"
import type { PendingInviteMemory } from "./pendingInvitesStore"
import {
  resolvePendingInviteRemainingSeconds,
  resolvePendingInviteStripTitle
} from "./pendingInviteModel"

// Legacy lobby: outgoing room invites waiting for an answer. Rendered only
// outside production Discover.
export function PendingInviteStrip(props: { pendingInvites: PendingInviteMemory[] }) {
  return (
    <View style={styles.pendingInviteStrip}>
      <View style={styles.pendingInviteIcon}>
        <Ionicons name="heart" size={17} color={uiTheme.colors.primary} />
      </View>
      <View style={styles.pendingInviteCopy}>
        <Text style={styles.pendingInviteTitle}>
          {resolvePendingInviteStripTitle(props.pendingInvites)}
        </Text>
        <Text style={styles.pendingInviteBody}>
          Keep discovering. A shared room opens when someone accepts.
        </Text>
      </View>
      <PendingInviteCountdown pendingInvites={props.pendingInvites} />
    </View>
  )
}

function PendingInviteCountdown(props: { pendingInvites: PendingInviteMemory[] }) {
  const [now, setNow] = useState(() => Date.now())
  const remainingSeconds = useMemo(
    () => resolvePendingInviteRemainingSeconds(props.pendingInvites, now),
    [now, props.pendingInvites]
  )

  useEffect(() => {
    if (props.pendingInvites.length === 0) return undefined
    if (remainingSeconds === 0) return undefined
    const timer = setTimeout(() => setNow(Date.now()), 1000)
    return () => clearTimeout(timer)
  }, [props.pendingInvites.length, remainingSeconds])

  return <Text style={styles.pendingInviteTime}>{remainingSeconds}s</Text>
}

const styles = StyleSheet.create({
  pendingInviteStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.lg,
    paddingVertical: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.float,
  },
  pendingInviteIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primarySoft,
  },
  pendingInviteCopy: {
    flex: 1,
    gap: 2,
  },
  pendingInviteTitle: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textPrimary,
    fontWeight: "800",
  },
  pendingInviteBody: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
    lineHeight: 17,
  },
  pendingInviteTime: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep,
    minWidth: 28,
    textAlign: "right",
  },
})
