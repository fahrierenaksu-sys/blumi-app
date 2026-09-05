import { Animated, Image, StyleSheet, Text, View } from "react-native"
import {
  ONBOARDING_HERO_FRAME,
  ONBOARDING_MALE_HERO_FRAME
} from "../features/session/OnboardingGreetingPair"
import { useEntranceAnimation, useReducedMotion } from "../ui/animations"
import { blumiEntryTheme as uiTheme } from "../ui/theme"

interface RegisterCharacterHeroProps {
  message: string
  title: string
  body: string
  compact?: boolean
}

/**
 * The register hero mirrors the friendly onboarding composition without
 * introducing a second illustration system. The same authored characters
 * appear here as the user moves from the world scene into phone verification.
 */
export function RegisterCharacterHero({
  message,
  title,
  body,
  compact = false
}: RegisterCharacterHeroProps) {
  const reduceMotion = useReducedMotion()
  const bubbleEntrance = useEntranceAnimation({
    delay: 20,
    duration: reduceMotion ? 0 : 300,
    translateY: 8
  })
  const maleEntrance = useEntranceAnimation({
    delay: 120,
    duration: reduceMotion ? 0 : 440,
    translateY: 20
  })
  const femaleEntrance = useEntranceAnimation({
    delay: 210,
    duration: reduceMotion ? 0 : 440,
    translateY: 20
  })
  const copyEntrance = useEntranceAnimation({
    delay: 300,
    duration: reduceMotion ? 0 : 320,
    translateY: 8
  })

  return (
    <View
      testID="register-character-hero"
      style={[styles.hero, compact ? styles.heroCompact : null]}
    >
      <View accessible accessibilityLabel={message} style={styles.messageWrap}>
        <AnimatedMessageBubble
          compact={compact}
          style={bubbleEntrance}
          message={message}
        />
      </View>

      <AnimatedCharacterPair
        compact={compact}
        femaleStyle={femaleEntrance}
        maleStyle={maleEntrance}
      />

      <AnimatedCopy
        body={body}
        compact={compact}
        style={copyEntrance}
        title={title}
      />
    </View>
  )
}

function AnimatedMessageBubble({
  compact,
  message,
  style
}: {
  compact: boolean
  message: string
  style: ReturnType<typeof useEntranceAnimation>
}) {
  return (
    <Animated.View accessible={false} style={[styles.messageAnimated, style]}>
      <View
        style={[
          styles.messageBubble,
          compact ? styles.messageBubbleCompact : null
        ]}
      >
        <Text maxFontSizeMultiplier={1.35} style={styles.messageText}>
          {message}
        </Text>
        <View accessible={false} style={styles.messageTail} />
      </View>
    </Animated.View>
  )
}

function AnimatedCharacterPair({
  compact,
  femaleStyle,
  maleStyle
}: {
  compact: boolean
  femaleStyle: ReturnType<typeof useEntranceAnimation>
  maleStyle: ReturnType<typeof useEntranceAnimation>
}) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.characterPair,
        compact ? styles.characterPairCompact : null
      ]}
    >
      <Animated.View style={[styles.characterSlot, maleStyle]}>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          fadeDuration={0}
          resizeMode="contain"
          source={ONBOARDING_MALE_HERO_FRAME}
          style={[
            styles.character,
            styles.maleCharacter,
            compact ? styles.characterCompact : null
          ]}
        />
      </Animated.View>
      <Animated.View style={[styles.characterSlot, femaleStyle]}>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          fadeDuration={0}
          resizeMode="contain"
          source={ONBOARDING_HERO_FRAME}
          style={[
            styles.character,
            styles.femaleCharacter,
            compact ? styles.characterCompact : null
          ]}
        />
      </Animated.View>
    </View>
  )
}

function AnimatedCopy({
  body,
  compact,
  style,
  title
}: {
  body: string
  compact: boolean
  style: ReturnType<typeof useEntranceAnimation>
  title: string
}) {
  return (
    <Animated.View style={style}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1.3}
        style={[styles.title, compact ? styles.titleCompact : null]}
      >
        {title}
      </Text>
      <Text
        maxFontSizeMultiplier={1.5}
        style={[styles.body, compact ? styles.bodyCompact : null]}
      >
        {body}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    width: "100%",
    paddingTop: uiTheme.spacing.sm,
    paddingBottom: uiTheme.spacing.xxs
  },
  heroCompact: {
    paddingTop: uiTheme.spacing.xxs
  },
  messageWrap: {
    alignItems: "center",
    width: "100%"
  },
  messageAnimated: {
    alignItems: "center",
    width: "100%"
  },
  messageBubble: {
    alignItems: "center",
    justifyContent: "center",
    width: "88%",
    minWidth: 248,
    maxWidth: 330,
    minHeight: 70,
    paddingHorizontal: uiTheme.spacing.lg,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.lg,
    backgroundColor: uiTheme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: uiTheme.colors.borderStrong,
    ...uiTheme.shadow.soft
  },
  messageBubbleCompact: {
    minHeight: 60,
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.xs
  },
  messageText: {
    ...uiTheme.font.subheading,
    color: uiTheme.colors.textPrimary,
    textAlign: "center"
  },
  messageTail: {
    position: "absolute",
    bottom: -8,
    width: 16,
    height: 16,
    backgroundColor: uiTheme.colors.surfaceRaised,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: uiTheme.colors.borderStrong,
    transform: [{ rotate: "45deg" }]
  },
  characterPair: {
    width: 208,
    height: 140,
    marginTop: uiTheme.spacing.sm,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    overflow: "visible"
  },
  characterPairCompact: {
    width: 184,
    height: 118,
    marginTop: uiTheme.spacing.xs
  },
  characterSlot: {
    alignItems: "center",
    justifyContent: "flex-end"
  },
  character: {
    width: 108,
    height: 140
  },
  characterCompact: {
    width: 92,
    height: 118
  },
  maleCharacter: {
    marginRight: -8
  },
  femaleCharacter: {
    marginLeft: -8
  },
  title: {
    ...uiTheme.font.title,
    color: uiTheme.colors.textPrimary,
    marginTop: uiTheme.spacing.xxs,
    textAlign: "center"
  },
  titleCompact: {
    ...uiTheme.font.heading
  },
  body: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textSecondary,
    maxWidth: 320,
    marginTop: uiTheme.spacing.xxs,
    textAlign: "center"
  },
  bodyCompact: {
    maxWidth: 296,
    lineHeight: 18
  }
})
