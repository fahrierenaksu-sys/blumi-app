import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, Text, View } from "react-native"
import { PressableScale } from "../../ui/PressableScale"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import type { OwnProfileCopy } from "./profileCopy"

/**
 * The glass name card that overlaps the bottom of the hero: name and age in
 * the display face, the avatar vibe as a coloured chip, and the one
 * "Edit profile" pill.
 */
export function OwnProfileIdentity(props: {
  copy: OwnProfileCopy
  displayName: string
  age?: number
  vibeLabel: string
  vibeColor: string
  onEditProfile: () => void
}) {
  const { copy, displayName, age } = props
  const nameLine = typeof age === "number" ? `${displayName}, ${age}` : displayName
  return (
    <View style={styles.card}>
      <View style={styles.sheen} pointerEvents="none" />
      <Text accessibilityRole="header" style={styles.name} numberOfLines={2}>
        {nameLine}
      </Text>
      <View style={styles.vibeChip}>
        <View style={[styles.vibeDot, { backgroundColor: props.vibeColor }]} />
        <Text style={styles.vibeText}>{copy.vibe(props.vibeLabel)}</Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={copy.editProfile}
        accessibilityHint={copy.editProfileHint}
        onPress={props.onEditProfile}
        style={styles.editPill}
      >
        <LinearGradient
          colors={uiTheme.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.editGradient}
        >
          <Ionicons name="pencil" size={16} color="#FFFFFF" />
          <Text style={styles.editText}>{copy.editProfile}</Text>
        </LinearGradient>
      </PressableScale>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.lg,
    paddingBottom: uiTheme.spacing.lg,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.95)",
    overflow: "hidden",
    ...uiTheme.shadow.float
  },
  sheen: {
    position: "absolute",
    top: 1,
    left: 40,
    right: 40,
    height: 1.5,
    borderRadius: 999,
    backgroundColor: uiTheme.ambientGlass.sheen
  },
  name: {
    ...uiTheme.font.title,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  vibeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 30,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.chipBackground
  },
  vibeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF"
  },
  vibeText: {
    ...uiTheme.font.label,
    color: uiTheme.colors.chipText
  },
  editPill: {
    marginTop: uiTheme.spacing.xs,
    borderRadius: uiTheme.radius.full,
    overflow: "hidden",
    ...uiTheme.shadow.glowSubtle
  },
  editGradient: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: uiTheme.spacing.xl,
    borderRadius: uiTheme.radius.full
  },
  editText: {
    ...uiTheme.font.bodyBold,
    color: "#FFFFFF"
  }
})
