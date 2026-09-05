import { useRef } from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { Avatar } from "../ui/avatar"
import { LinearGradient } from "../ui/linearGradient"
import { uiTheme } from "../ui/theme"

interface IncomingInviteCalloutProps {
  senderDisplayName: string
  senderUserId: string
  onAccept: () => void
  onDecline: () => void
}

export function IncomingInviteCallout(props: IncomingInviteCalloutProps) {
  const { senderDisplayName, senderUserId, onAccept, onDecline } = props
  const acceptScaleAnim = useRef(new Animated.Value(1)).current

  const handleAcceptPressIn = () => {
    Animated.spring(acceptScaleAnim, {
      toValue: uiTheme.animation.scalePress,
      useNativeDriver: true,
      ...uiTheme.animation.spring,
    }).start()
  }

  const handleAcceptPressOut = () => {
    Animated.spring(acceptScaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...uiTheme.animation.springBouncy,
    }).start()
  }

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={["#FFFFFF", "#FFF8FB", "#FFF0F6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.row}>
        <View style={styles.avatarGlow}>
          <Avatar name={senderDisplayName} seed={senderUserId} size={56} ring="soft" />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.eyebrow}>New invite</Text>
          <Text style={styles.title}>{senderDisplayName} wants to connect</Text>
          <Text style={styles.body}>
            Step into the mini room while the vibe is fresh.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decline ${senderDisplayName}'s room invite`}
          style={({ pressed }) => [
            styles.declineButton,
            pressed ? styles.declineButtonPressed : null
          ]}
          onPress={onDecline}
        >
          <Text style={styles.declineText}>Not now</Text>
        </Pressable>
        <Animated.View style={[styles.acceptWrap, { transform: [{ scale: acceptScaleAnim }] }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Accept ${senderDisplayName}'s room invite`}
            onPress={onAccept}
            onPressIn={handleAcceptPressIn}
            onPressOut={handleAcceptPressOut}
            style={styles.acceptButton}
          >
            <LinearGradient
              colors={uiTheme.gradients.primary as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.acceptGradient}
            >
              <Text style={styles.acceptText}>Let&apos;s go</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: uiTheme.radius.xl,
    borderWidth: 1,
    borderColor: "#FADAE8",
    padding: uiTheme.spacing.lg,
    gap: uiTheme.spacing.md,
    position: "relative",
    overflow: "hidden",
    ...uiTheme.shadow.deep,
  },
  glow: {
    position: "absolute",
    right: -80,
    top: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: uiTheme.colors.accentGlow,
  },
  row: {
    flexDirection: "row",
    gap: uiTheme.spacing.md,
    alignItems: "center",
  },
  avatarGlow: {
    ...uiTheme.shadow.glowSubtle,
    borderRadius: 28,
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.primary,
  },
  title: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
  },
  body: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: uiTheme.spacing.sm,
    marginTop: uiTheme.spacing.xs,
  },
  declineButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1.5,
    borderColor: uiTheme.colors.border,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonPressed: {
    backgroundColor: uiTheme.colors.surfaceMuted,
  },
  declineText: {
    ...uiTheme.font.bodyMedium,
    color: uiTheme.colors.textSecondary,
  },
  acceptWrap: {
    flex: 1.4,
  },
  acceptButton: {
    borderRadius: uiTheme.radius.full,
    overflow: "hidden",
    ...uiTheme.shadow.glow,
  },
  acceptGradient: {
    minHeight: 50,
    borderRadius: uiTheme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF",
  },
})
