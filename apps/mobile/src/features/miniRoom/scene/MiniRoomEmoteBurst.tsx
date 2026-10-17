import { useEffect } from "react"
import { StyleSheet, Text, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import type { ChatEmote } from "../emotes/chatEmoteMapper"
import { MINI_ROOM_EMOTE_LIFETIME_MS } from "../emotes/miniRoomEmoteModel"

/** Which side of the head the burst sits on (away from the speech bubbles). */
export type MiniRoomEmoteSide = "left" | "right"

export interface MiniRoomEmoteBurstProps {
  emote: ChatEmote
  side: MiniRoomEmoteSide
  /** Reduce Motion: a still badge for the emote's lifetime instead of any movement. */
  reduceMotion: boolean
}

export type ParticleMotion = "rise" | "bounce" | "rock" | "pop" | "appear"

export interface ParticleSpec {
  readonly glyph?: string
  /** A drawn shape instead of a glyph (the thought bubble's cloud and dots). */
  readonly shape?: "cloud" | "dotSmall" | "dotLarge"
  readonly motion: ParticleMotion
  readonly size: number
  /** Start position in the burst box, from its bottom centre (px). */
  readonly x: number
  readonly y: number
  /** Share of the lifetime before this particle starts (0–1). */
  readonly delay: number
  /** Rise distance for "rise" (px). */
  readonly rise?: number
  /** Sideways drift over a rise (px). */
  readonly drift?: number
}

export const MINI_ROOM_EMOTE_PARTICLES: Readonly<Record<ChatEmote, readonly ParticleSpec[]>> = {
  heart: [
    { glyph: "💗", motion: "rise", size: 18, x: -10, y: 0, delay: 0, rise: 44, drift: -6 },
    { glyph: "💕", motion: "rise", size: 14, x: 9, y: 4, delay: 0.14, rise: 40, drift: 6 },
    { glyph: "❤️", motion: "rise", size: 15, x: -1, y: 2, delay: 0.28, rise: 36, drift: 0 }
  ],
  laugh: [{ glyph: "😆", motion: "bounce", size: 26, x: 0, y: 4, delay: 0 }],
  think: [
    { shape: "dotSmall", motion: "appear", size: 5, x: -14, y: 0, delay: 0 },
    { shape: "dotLarge", motion: "appear", size: 8, x: -8, y: 8, delay: 0.1 },
    { shape: "cloud", motion: "appear", size: 34, x: 6, y: 18, delay: 0.2 }
  ],
  wave: [{ glyph: "👋", motion: "rock", size: 24, x: 0, y: 6, delay: 0 }],
  sparkle: [
    { glyph: "✨", motion: "pop", size: 16, x: -14, y: 4, delay: 0 },
    { glyph: "✨", motion: "pop", size: 13, x: 12, y: 18, delay: 0.18 },
    { glyph: "✨", motion: "pop", size: 11, x: -4, y: 34, delay: 0.34 }
  ],
  sleepy: [
    { glyph: "z", motion: "rise", size: 11, x: -6, y: 0, delay: 0, rise: 30, drift: 8 },
    { glyph: "z", motion: "rise", size: 14, x: -2, y: 0, delay: 0.2, rise: 32, drift: 10 },
    { glyph: "Z", motion: "rise", size: 18, x: 2, y: 0, delay: 0.4, rise: 30, drift: 12 }
  ]
}

/** One still glyph per emote for Reduce Motion. */
const STATIC_BADGE_GLYPH: Readonly<Record<ChatEmote, string>> = {
  heart: "💗", laugh: "😆", think: "💭", wave: "👋", sparkle: "✨", sleepy: "💤"
}

/**
 * One emote over the speaker's chibi: floating hearts, a bouncing laugh, a
 * thought bubble, a waving hand, sparkles or drifting z's. Purely decorative
 * (hidden from assistive tech, no sound, no touch); the chibi art and its own
 * transforms are untouched. The parent keys it by emote, so each one plays once.
 */
export function MiniRoomEmoteBurst(props: MiniRoomEmoteBurstProps) {
  const boxStyle = props.side === "left" ? styles.boxLeft : styles.boxRight
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`mini-room-emote-${props.emote}`}
      style={[styles.box, boxStyle]}
    >
      {props.reduceMotion
        ? <StaticEmoteBadge emote={props.emote} />
        : <AnimatedEmoteParticles emote={props.emote} />}
    </View>
  )
}

function StaticEmoteBadge({ emote }: { emote: ChatEmote }) {
  return (
    <View testID="mini-room-emote-badge" style={styles.badge}>
      <Text allowFontScaling={false} style={styles.badgeGlyph}>{STATIC_BADGE_GLYPH[emote]}</Text>
    </View>
  )
}

function AnimatedEmoteParticles({ emote }: { emote: ChatEmote }) {
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = 0
    progress.value = withTiming(1, {
      duration: MINI_ROOM_EMOTE_LIFETIME_MS,
      easing: Easing.linear,
      // The parent shows a still badge under Reduce Motion, so this path always moves.
      reduceMotion: ReduceMotion.Never
    })
    return () => cancelAnimation(progress)
  }, [progress])
  return (
    <>
      {MINI_ROOM_EMOTE_PARTICLES[emote].map((spec, index) => (
        <EmoteParticle key={`${emote}:${index}`} spec={spec} progress={progress} />
      ))}
    </>
  )
}

/** Where one particle is at burst progress `p` (0–1); every particle is gone again at 1. */
export function resolveMiniRoomEmoteParticleFrame(
  p: number,
  motion: ParticleMotion,
  delay: number,
  rise: number,
  drift: number
): { opacity: number; translateX: number; translateY: number; scale: number; rotate: number } {
  "worklet"
  const span = Math.max(0.01, 1 - delay)
  const t = Math.min(1, Math.max(0, (p - delay) / span))
  const started = p >= delay
  const fadeIn = Math.min(1, t / 0.15)
  const fadeOut = t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1
  const opacity = started ? fadeIn * fadeOut : 0
  if (motion === "rise") {
    return { opacity, translateX: drift * t, translateY: -rise * t, scale: 0.6 + 0.4 * Math.min(1, t * 3), rotate: 0 }
  }
  if (motion === "bounce") {
    const hop = Math.abs(Math.sin(t * Math.PI * 3)) * 9 * (1 - 0.5 * t)
    return { opacity, translateX: 0, translateY: -hop, scale: 0.7 + 0.3 * fadeIn, rotate: Math.sin(t * Math.PI * 6) * 8 }
  }
  if (motion === "rock") {
    return { opacity, translateX: 0, translateY: -4 * fadeIn, scale: 0.7 + 0.3 * fadeIn, rotate: Math.sin(t * Math.PI * 4) * 20 }
  }
  if (motion === "pop") {
    const swell = Math.sin(t * Math.PI)
    return { opacity: started ? swell : 0, translateX: 0, translateY: 0, scale: 0.2 + 0.8 * swell, rotate: 90 * t }
  }
  return { opacity, translateX: 0, translateY: 0, scale: 0.4 + 0.6 * Math.min(1, t / 0.12), rotate: 0 }
}

function EmoteParticle({ spec, progress }: { spec: ParticleSpec; progress: SharedValue<number> }) {
  const { motion, delay } = spec
  const rise = spec.rise ?? 0
  const drift = spec.drift ?? 0
  const animatedStyle = useAnimatedStyle(() => {
    const frame = resolveMiniRoomEmoteParticleFrame(progress.value, motion, delay, rise, drift)
    return {
      opacity: frame.opacity,
      transform: [
        { translateX: frame.translateX },
        { translateY: frame.translateY },
        { scale: frame.scale },
        { rotate: `${frame.rotate}deg` }
      ]
    }
  })
  const placement = { bottom: spec.y, marginLeft: spec.x - spec.size / 2 }
  if (spec.shape) {
    const shapeStyle = spec.shape === "cloud" ? styles.cloud : spec.shape === "dotLarge" ? styles.dotLarge : styles.dotSmall
    return (
      <Animated.View style={[styles.particle, placement, shapeStyle, animatedStyle]}>
        {spec.shape === "cloud" ? <CloudDots /> : null}
      </Animated.View>
    )
  }
  const glyphStyle = spec.glyph === "z" || spec.glyph === "Z" ? styles.sleepyGlyph : null
  return (
    <Animated.View style={[styles.particle, placement, { width: spec.size + 8 }, animatedStyle]}>
      <Text allowFontScaling={false} style={[styles.glyph, { fontSize: spec.size, lineHeight: spec.size + 4 }, glyphStyle]}>
        {spec.glyph}
      </Text>
    </Animated.View>
  )
}

function CloudDots() {
  return (
    <View style={styles.cloudDots}>
      <View style={styles.cloudDot} />
      <View style={styles.cloudDot} />
      <View style={styles.cloudDot} />
    </View>
  )
}

// Matches the speech bubble's white glass and pink rim (RoomSpeechBubbleStack).
const PAPER = "rgba(255, 255, 255, 0.96)"
const EDGE = "rgba(255, 201, 224, 0.9)"
const BOX_SIZE = 64

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    left: "50%",
    bottom: 92,
    width: BOX_SIZE,
    height: BOX_SIZE
  },
  boxRight: {
    marginLeft: 4
  },
  boxLeft: {
    marginLeft: -4 - BOX_SIZE
  },
  particle: {
    position: "absolute",
    left: "50%",
    alignItems: "center",
    justifyContent: "center"
  },
  glyph: {
    textAlign: "center"
  },
  sleepyGlyph: {
    color: "#6E4F9C",
    fontWeight: "800",
    textShadowColor: "rgba(255, 255, 255, 0.95)",
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 }
  },
  dotSmall: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: EDGE
  },
  dotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: EDGE
  },
  cloud: {
    width: 34,
    height: 24,
    borderRadius: 12,
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: EDGE,
    shadowColor: "#5B263B",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2
  },
  cloudDots: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3
  },
  cloudDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D06A9A"
  },
  badge: {
    position: "absolute",
    left: "50%",
    bottom: 6,
    width: 30,
    height: 30,
    marginLeft: -15,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: EDGE
  },
  badgeGlyph: {
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center"
  }
})
