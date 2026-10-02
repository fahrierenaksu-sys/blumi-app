import Ionicons from "@expo/vector-icons/Ionicons"
import type { ReactNode } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, { ReduceMotion, ZoomIn } from "react-native-reanimated"
import { useReducedMotion } from "../../ui/animations"
import { PressableScale } from "../../ui/PressableScale"
import { uiTheme } from "../../ui/theme"
import type { OwnProfileCopy } from "./profileCopy"
import type { ProfilePromptView } from "./profileViewModel"

const CHIP_STAGGER_MS = 45
const CHIP_BASE_DELAY_MS = 260

/** A titled section of the profile page. */
export function ProfileSection(props: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{props.title}</Text>
      {props.children}
    </View>
  )
}

/** The gentle "add" affordance shown instead of an empty section. */
export function ProfileAddCard(props: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  hint: string
  onPress: () => void
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={props.title}
      accessibilityHint={props.hint}
      onPress={props.onPress}
      style={styles.addCard}
    >
      <View style={styles.addIcon}>
        <Ionicons accessible={false} name={props.icon} size={18} color={uiTheme.colors.primaryDeep} />
      </View>
      <View style={styles.addText}>
        <Text style={styles.addTitle}>{props.title}</Text>
        <Text style={styles.addHint}>{props.hint}</Text>
      </View>
      <Ionicons accessible={false} name="add-circle" size={24} color={uiTheme.colors.primary} />
    </PressableScale>
  )
}

export function ProfileBioCard(props: { bio: string }) {
  return (
    <View style={styles.bioCard}>
      <Ionicons accessible={false} name="chatbubble-ellipses" size={20} color={uiTheme.colors.primarySoft} style={styles.bioQuote} />
      <Text style={styles.bioText}>{props.bio}</Text>
    </View>
  )
}

/** Interest chips that pop in one after another (still under Reduce Motion). */
export function ProfileInterestChips(props: { interests: readonly string[] }) {
  const reduceMotion = useReducedMotion()
  return (
    <View style={styles.chipRow}>
      {props.interests.map((interest, index) => (
        <Animated.View
          key={interest}
          entering={reduceMotion
            ? undefined
            : ZoomIn.delay(CHIP_BASE_DELAY_MS + index * CHIP_STAGGER_MS).springify().damping(14).reduceMotion(ReduceMotion.Never)}
          style={styles.chip}
        >
          <Text style={styles.chipText}>{interest}</Text>
        </Animated.View>
      ))}
    </View>
  )
}

export function ProfilePromptCards(props: { prompts: readonly ProfilePromptView[] }) {
  return (
    <View style={styles.promptStack}>
      {props.prompts.map((prompt, index) => (
        <View key={prompt.id} style={[styles.promptCard, index % 2 === 1 ? styles.promptCardAlt : null]}>
          <Text style={styles.promptQuestion}>{prompt.question}</Text>
          <Text style={styles.promptAnswer}>{prompt.answer}</Text>
        </View>
      ))}
    </View>
  )
}

/** "See how others see you": opens the profile preview in self mode. */
export function ProfilePreviewEntry(props: { copy: OwnProfileCopy; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={props.copy.previewTitle}
      accessibilityHint={props.copy.previewBody}
      onPress={props.onPress}
      style={styles.previewRow}
    >
      <View style={styles.previewIcon}>
        <Ionicons accessible={false} name="eye" size={20} color="#FFFFFF" />
      </View>
      <View style={styles.addText}>
        <Text style={styles.previewTitle}>{props.copy.previewTitle}</Text>
        <Text style={styles.addHint}>{props.copy.previewBody}</Text>
      </View>
      <Ionicons accessible={false} name="chevron-forward" size={18} color={uiTheme.colors.textMuted} />
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: uiTheme.spacing.sm
  },
  sectionTitle: {
    ...uiTheme.font.overline,
    color: uiTheme.colors.textMuted,
    paddingHorizontal: 4
  },
  addCard: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(246, 92, 157, 0.38)",
    backgroundColor: "rgba(255, 242, 248, 0.7)"
  },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.surface
  },
  addText: {
    flex: 1,
    gap: 2
  },
  addTitle: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.primaryDeep
  },
  addHint: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary
  },
  bioCard: {
    padding: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.xl,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    ...uiTheme.shadow.soft
  },
  bioQuote: {
    position: "absolute",
    top: uiTheme.spacing.sm,
    left: uiTheme.spacing.md
  },
  bioText: {
    ...uiTheme.font.body,
    color: uiTheme.colors.textPrimary
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: uiTheme.spacing.xs
  },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: uiTheme.radius.full,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: "rgba(246, 92, 157, 0.24)",
    ...uiTheme.shadow.soft
  },
  chipText: {
    ...uiTheme.font.label,
    color: uiTheme.colors.chipText
  },
  promptStack: {
    gap: uiTheme.spacing.sm
  },
  promptCard: {
    gap: uiTheme.spacing.xs,
    padding: uiTheme.spacing.lg,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: "#FFF2F8",
    borderWidth: 1,
    borderColor: "rgba(246, 92, 157, 0.16)"
  },
  promptCardAlt: {
    backgroundColor: "#F5ECFA",
    borderColor: "rgba(184, 169, 232, 0.32)"
  },
  promptQuestion: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary
  },
  promptAnswer: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary
  },
  previewRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    padding: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.surface,
    borderWidth: 1,
    borderColor: uiTheme.colors.border,
    ...uiTheme.shadow.soft
  },
  previewIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.brandLavender
  },
  previewTitle: {
    ...uiTheme.font.bodyBold,
    color: uiTheme.colors.textPrimary
  }
})
