import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native"
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated"
import { blumiEntryTheme as uiTheme } from "../../../ui/theme"
import {
  getAvatarStudioStageMetrics,
  type AvatarStudioCategory
} from "../avatarSetupLayout"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2.types"
import { AvatarPreview2D } from "./AvatarPreview2D"

export interface AvatarStudioCategoryDescriptor {
  type: AvatarStudioCategory
  label: string
  icon: keyof typeof Ionicons.glyphMap
  itemCount: number
  selectedIndex: number
}

interface AvatarSetupStudioStageProps {
  avatar: UserAvatar
  catalog: AvatarCatalogItem[]
  categories: AvatarStudioCategoryDescriptor[]
  compact: boolean
  disabled: boolean
  isMale: boolean
  motionActive: boolean
  onCycle: (category: AvatarStudioCategory, direction: -1 | 1) => void
  onSelectCategory: (category: AvatarStudioCategory) => void
  onSelectGender: (gender: "woman" | "man") => void
  reduceMotion: boolean
  selectedType: AvatarStudioCategory
  selectionKey: string
  veryCompact: boolean
}

const MOTION_MS = 220
const POD_ARROW_VISUAL_SIZE = 26
const POD_ARROW_HIT_SLOP = 9

const SPARKLES = [
  { top: 110, left: 34, size: 8 },
  { top: 148, right: 40, size: 7 },
  { top: 226, left: 64, size: 6 },
  { top: 286, right: 78, size: 7 },
  { top: 370, left: 76, size: 6 },
  { top: 432, right: 56, size: 7 }
] as const

export function AvatarSetupStudioStage({
  avatar,
  catalog,
  categories,
  compact,
  disabled,
  isMale,
  motionActive,
  onCycle,
  onSelectCategory,
  onSelectGender,
  reduceMotion,
  selectedType,
  selectionKey,
  veryCompact
}: AvatarSetupStudioStageProps) {
  const { height, width } = useWindowDimensions()
  const [stageWidth, setStageWidth] = useState(0)
  const metrics = getAvatarStudioStageMetrics(
    compact,
    width,
    stageWidth > 0 ? stageWidth : undefined,
    height,
    veryCompact
  )
  const selectionProgress = useSharedValue(1)
  const ambientPulse = useSharedValue(0)
  const previousSelectionKeyRef = useRef(selectionKey)

  useLayoutEffect(() => {
    if (reduceMotion || !motionActive) {
      selectionProgress.value = 1
      previousSelectionKeyRef.current = selectionKey
      return
    }
    if (previousSelectionKeyRef.current === selectionKey) {
      selectionProgress.value = 1
      return
    }
    previousSelectionKeyRef.current = selectionKey
    selectionProgress.value = 0
    selectionProgress.value = withTiming(1, { duration: MOTION_MS })
  }, [motionActive, reduceMotion, selectionKey, selectionProgress])

  useEffect(() => {
    ambientPulse.value = 0
    if (reduceMotion || !motionActive) {
      ambientPulse.value = 0.42
      return undefined
    }

    ambientPulse.value = withRepeat(
      withTiming(1, {
        duration: 3600,
        easing: Easing.inOut(Easing.sin)
      }),
      -1,
      true
    )

    return () => {
      ambientPulse.value = 0
    }
  }, [ambientPulse, motionActive, reduceMotion])

  const avatarArrivalStyle = useAnimatedStyle(() => ({
    opacity: selectionProgress.value,
    transform: [
      { translateY: interpolate(selectionProgress.value, [0, 1], [10, 0]) },
      { scale: interpolate(selectionProgress.value, [0, 1], [0.982, 1]) }
    ]
  }))
  const backdropVeilStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ambientPulse.value, [0, 1], [0.56, 0.74])
  }))
  const orbitGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ambientPulse.value, [0, 1], [0.2, 0.36]),
    transform: [
      { scale: interpolate(ambientPulse.value, [0, 1], [0.97, 1.03]) }
    ]
  }))
  const ambientSparkleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ambientPulse.value, [0, 1], [0.22, 0.74])
  }))
  const onStageLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width)

    if (nextWidth > 0 && nextWidth !== stageWidth) {
      setStageWidth(nextWidth)
    }
  }

  return (
    <View
      accessibilityLabel="Karakter görünüm stüdyosu"
      onLayout={onStageLayout}
      style={[styles.root, { height: metrics.stageHeight }]}
      testID="avatar-setup-studio-stage"
    >
      <View pointerEvents="none" style={styles.orbitalBackdrop}>
        <Animated.View style={[styles.backdropVeil, backdropVeilStyle]} />
        <Animated.View style={[styles.ambientBloom, orbitGlowStyle]} />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[styles.orbitRing, styles.orbitRingOuter, orbitGlowStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.orbitRing, styles.orbitRingInner, orbitGlowStyle]}
      />

      {SPARKLES.map((sparkle, index) => (
        <Animated.View
          key={`sparkle-${index}`}
          pointerEvents="none"
          style={[
            styles.sparkleDot,
            styles.ambientSparkle,
            {
              top: sparkle.top,
              left: "left" in sparkle ? sparkle.left : undefined,
              right: "right" in sparkle ? sparkle.right : undefined,
              width: sparkle.size,
              height: sparkle.size,
              borderRadius: sparkle.size / 2
            },
            ambientSparkleStyle
          ]}
        />
      ))}

      <View style={[styles.genderRail, { width: metrics.genderRailWidth }]}>
        <GenderButton
          active={!isMale}
          disabled={disabled}
          icon="woman-outline"
          label="Kadın"
          onPress={() => onSelectGender("woman")}
          testID="avatar-gender-woman"
        />
        <GenderButton
          active={isMale}
          disabled={disabled}
          icon="man-outline"
          label="Erkek"
          onPress={() => onSelectGender("man")}
          testID="avatar-gender-man"
        />
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.avatarAnchor,
          { bottom: metrics.avatarBottomInset },
          avatarArrivalStyle
        ]}
      >
        <AvatarPreview2D
          animationState="idle_front"
          avatar={avatar}
          catalog={catalog}
          showGlow={false}
          size={metrics.avatarSize}
          stageHeight={metrics.stageHeight}
          themeTone="entry"
        />
      </Animated.View>

      {categories.map((category) => (
        <OrbitPod
          active={category.type === selectedType}
          category={category}
          disabled={disabled}
          key={`zone-${category.type}`}
          onCycle={onCycle}
          onSelect={onSelectCategory}
        position={metrics.orbitPod[category.type]}
        size={{ height: metrics.orbitPodHeight, width: metrics.orbitPodWidth }}
        />
      ))}
    </View>
  )
}

function GenderButton({
  active,
  disabled,
  icon,
  label,
  onPress,
  testID
}: {
  active: boolean
  disabled: boolean
  icon: keyof typeof Ionicons.glyphMap
  label: string
  onPress: () => void
  testID: string
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.genderButton, active ? styles.genderButtonActive : null]}
      testID={testID}
    >
      <Ionicons
        color={active ? "#FFFFFF" : "#8C6C82"}
        name={icon}
        size={21}
      />
      <Text style={[styles.genderButtonText, active ? styles.genderButtonTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  )
}

function OrbitPod({
  active,
  category,
  disabled,
  onCycle,
  onSelect,
  position,
  size
}: {
  active: boolean
  category: AvatarStudioCategoryDescriptor
  disabled: boolean
  onCycle: (category: AvatarStudioCategory, direction: -1 | 1) => void
  onSelect: (category: AvatarStudioCategory) => void
  position: { side: "left" | "right"; top: number }
  size: { height: number; width: number }
}) {
  return (
    <View
      pointerEvents={disabled ? "none" : "box-none"}
      style={[
        styles.orbitPod,
        position.side === "left" ? styles.orbitPodLeft : styles.orbitPodRight,
        { height: size.height, top: position.top, width: size.width },
        active ? styles.orbitPodActive : null
      ]}
    >
      <PodArrow
        active={active}
        categoryLabel={category.label}
        direction={-1}
        disabled={disabled}
        onPress={() => {
          onSelect(category.type)
          onCycle(category.type, -1)
        }}
        testID={`avatar-style-previous-${category.type}`}
      />
      <Pressable
        accessibilityHint={`${category.label} görünümünü seç`}
        accessibilityRole="tab"
        accessibilityState={{ disabled, selected: active }}
        disabled={disabled}
        onPress={() => onSelect(category.type)}
        style={styles.podCenter}
        testID={`avatar-zone-${category.type}`}
      >
        <View style={[styles.podIcon, active ? styles.podIconActive : null]}>
          <Ionicons
            color={active ? uiTheme.colors.primary : "#8C6C82"}
            name={category.icon}
            size={14}
          />
        </View>
        <Text numberOfLines={1} style={[styles.podText, active ? styles.podTextActive : null]}>
          {category.label}
        </Text>
      </Pressable>
      <PodArrow
        active={active}
        categoryLabel={category.label}
        direction={1}
        disabled={disabled}
        onPress={() => {
          onSelect(category.type)
          onCycle(category.type, 1)
        }}
        testID={`avatar-style-next-${category.type}`}
      />
    </View>
  )
}

function PodArrow({
  active,
  categoryLabel,
  direction,
  disabled,
  onPress,
  testID
}: {
  active: boolean
  categoryLabel: string
  direction: -1 | 1
  disabled: boolean
  onPress: () => void
  testID: string
}) {
  const previous = direction === -1

  return (
    <Pressable
      accessibilityLabel={`${categoryLabel} için ${previous ? "önceki" : "sonraki"} görünüm`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={POD_ARROW_HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.podArrow,
        active ? styles.podArrowActive : null,
        pressed ? styles.podArrowPressed : null
      ]}
      testID={testID}
    >
      <Ionicons
        color={uiTheme.colors.primary}
        name={previous ? "chevron-back" : "chevron-forward"}
        size={17}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    position: "relative",
    overflow: "visible",
    backgroundColor: "transparent"
  },
  orbitalBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    borderRadius: 42
  },
  backdropVeil: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(255, 246, 243, 0.24)"
  },
  ambientBloom: {
    position: "absolute",
    top: 82,
    alignSelf: "center",
    width: "76%",
    maxWidth: 286,
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255, 224, 235, 0.58)",
    shadowColor: "#FFD0E1",
    shadowOpacity: 0.42,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 }
  },
  orbitRing: {
    position: "absolute",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    borderRadius: 999
  },
  orbitRingOuter: {
    top: 88,
    width: "76%",
    maxWidth: 286,
    aspectRatio: 1
  },
  orbitRingInner: {
    top: 128,
    width: "60%",
    maxWidth: 224,
    aspectRatio: 1,
    borderColor: "rgba(255, 240, 246, 0.92)"
  },
  sparkleDot: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.92)",
    shadowColor: "#FFE5EE",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }
  },
  ambientSparkle: {
    zIndex: 2
  },
  genderRail: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    height: 62,
    padding: 5,
    flexDirection: "row",
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1.5,
    borderColor: "rgba(214, 70, 109, 0.28)",
    shadowColor: "#C63D59",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 7
  },
  genderButton: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderRadius: 28
  },
  genderButtonActive: {
    backgroundColor: uiTheme.colors.primary
  },
  genderButtonText: {
    ...uiTheme.font.body,
    color: "#8C6C82",
    fontWeight: "800"
  },
  genderButtonTextActive: {
    color: "#FFFFFF"
  },
  avatarAnchor: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 5
  },
  orbitPod: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 999,
    backgroundColor: "rgba(255, 252, 251, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.96)",
    shadowColor: "#F3CAD8",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    overflow: "hidden",
    // The rendered rig stays visually dominant where its transparent canvas
    // crosses the orbit, while the compact pod remains legible at the edge.
    zIndex: 4
  },
  orbitPodLeft: {
    left: 8
  },
  orbitPodRight: {
    right: 8
  },
  orbitPodActive: {
    backgroundColor: "rgba(255, 237, 244, 0.88)",
    borderColor: "rgba(214, 70, 109, 0.42)",
    shadowColor: "#DB4B74",
    shadowOpacity: 0.18
  },
  podCenter: {
    flex: 1,
    height: "100%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 0,
    paddingHorizontal: 0
  },
  podIcon: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: 1,
    borderColor: "rgba(238, 215, 226, 0.64)"
  },
  podIconActive: {
    backgroundColor: "rgba(205, 55, 96, 0.1)",
    borderColor: "rgba(205, 55, 96, 0.18)"
  },
  podText: {
    fontSize: 10.5,
    lineHeight: 12,
    maxWidth: 52,
    color: "#8C6C82",
    fontWeight: "800",
    textAlign: "center"
  },
  podTextActive: {
    color: uiTheme.colors.primary
  },
  podArrow: {
    width: POD_ARROW_VISUAL_SIZE,
    height: POD_ARROW_VISUAL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: POD_ARROW_VISUAL_SIZE / 2,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.98)",
    shadowColor: "#C78BA2",
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }
  },
  podArrowActive: {
    borderColor: "rgba(219, 75, 116, 0.28)",
    shadowColor: "#D54770",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }
  },
  podArrowPressed: {
    backgroundColor: "rgba(255, 227, 237, 0.96)",
    transform: [{ scale: 0.94 }]
  }
})
