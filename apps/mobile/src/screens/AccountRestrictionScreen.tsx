import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import type { AccountModerationState } from "../features/session/accountModeration"
import { SoftBlobBackground } from "../ui/backgrounds"
import { LinearGradient } from "../ui/linearGradient"
import { uiTheme } from "../ui/theme"

interface AccountRestrictionScreenProps {
  moderation: AccountModerationState
  busy?: boolean
  errorMessage?: string | null
  onAcknowledge: () => void
  onSignOut: () => void
  onOpenGuidelines: () => void
}

function describeRestriction(moderation: AccountModerationState): {
  eyebrow: string
  title: string
  body: string
  primaryLabel: string | null
  icon: keyof typeof Ionicons.glyphMap
} {
  if (moderation.status === "warned") {
    return {
      eyebrow: "A quick check-in",
      title: "Please keep Blumi respectful",
      body: "We received a report connected to your account. Read our community standards before returning to conversations.",
      primaryLabel: "I understand",
      icon: "heart-dislike-outline"
    }
  }
  if (moderation.status === "suspended") {
    return {
      eyebrow: "Account paused",
      title: "Your account is temporarily paused",
      body: moderation.suspendedUntil
        ? `You can return after ${formatDate(moderation.suspendedUntil)}. Until then, your account cannot use Blumi spaces.`
        : "Your account cannot use Blumi spaces right now.",
      primaryLabel: null,
      icon: "time-outline"
    }
  }
  return {
    eyebrow: "Account unavailable",
    title: "Your account cannot use Blumi",
    body: "This account has been restricted from Blumi spaces. You can review the community standards or sign out.",
    primaryLabel: null,
    icon: "shield-outline"
  }
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return "the end of your pause"
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })
}

export function AccountRestrictionScreen(props: AccountRestrictionScreenProps) {
  const {
    busy = false,
    errorMessage,
    moderation,
    onAcknowledge,
    onOpenGuidelines,
    onSignOut
  } = props
  const copy = describeRestriction(moderation)

  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="lobby" />
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.content}>
          <View style={styles.iconShell} accessibilityElementsHidden>
            <LinearGradient
              colors={uiTheme.gradients.primary as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconGradient}
            >
              <Ionicons name={copy.icon} size={35} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <View style={styles.actions}>
            {copy.primaryLabel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.primaryLabel}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={onAcknowledge}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || busy) ? styles.primaryButtonPressed : null
                ]}
              >
                <LinearGradient
                  colors={uiTheme.gradients.primary as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryGradient}
                >
                  <Text style={styles.primaryLabel}>
                    {busy ? "Saving…" : copy.primaryLabel}
                  </Text>
                </LinearGradient>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Read community guidelines"
              onPress={onOpenGuidelines}
              style={({ pressed }) => [styles.textButton, pressed ? styles.textButtonPressed : null]}
            >
              <Text style={styles.textButtonLabel}>Read community guidelines</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={onSignOut}
              style={({ pressed }) => [styles.signOutButton, pressed ? styles.textButtonPressed : null]}
            >
              <Text style={styles.signOutLabel}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: uiTheme.colors.background },
  safe: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: uiTheme.spacing.xl,
    gap: uiTheme.spacing.md
  },
  iconShell: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: "hidden",
    ...uiTheme.shadow.soft
  },
  iconGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  eyebrow: { ...uiTheme.font.overline, color: uiTheme.colors.primaryDeep },
  title: {
    ...uiTheme.font.title,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  body: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 23
  },
  error: { ...uiTheme.font.bodySmall, color: uiTheme.colors.danger, textAlign: "center" },
  actions: { width: "100%", marginTop: uiTheme.spacing.lg, gap: uiTheme.spacing.sm },
  primaryButton: { width: "100%", borderRadius: uiTheme.radius.lg, overflow: "hidden" },
  primaryButtonPressed: { opacity: 0.76 },
  primaryGradient: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  primaryLabel: { ...uiTheme.font.bodyBold, color: "#FFFFFF" },
  textButton: { alignItems: "center", paddingVertical: 13 },
  textButtonPressed: { opacity: 0.68 },
  textButtonLabel: { ...uiTheme.font.bodyBold, color: uiTheme.colors.primaryDeep },
  signOutButton: { alignItems: "center", paddingVertical: 10 },
  signOutLabel: { ...uiTheme.font.bodySmall, color: uiTheme.colors.textMuted }
})
