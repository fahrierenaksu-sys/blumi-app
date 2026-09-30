import Ionicons from "@expo/vector-icons/Ionicons"
import { useEffect, useState } from "react"
import { Pressable, Text, View } from "react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated"
import { AvatarPreview2D } from "../components/AvatarPreview2D"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2.types"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { WardrobeGlass } from "./WardrobeGlass"
import { getWardrobeStageLayout } from "./wardrobeStageLayout"
import { wardrobeTheme, wardrobeV2Styles as styles } from "./wardrobeV2Styles"

const ZOOM_SCALE = 1.28
const ZOOM_DURATION_MS = 220

/**
 * The canonical character, large and centred over a thin circle, with a zoom
 * control at the lower right. The renderer and layer order are unchanged.
 */
export function WardrobePreviewStage(props: {
  avatar: UserAvatar
  catalog: AvatarCatalogItem[]
  copy: WardrobeStudioCopy
  reduceMotion: boolean
  showSavingStatus: boolean
}) {
  const { avatar, catalog, copy, reduceMotion, showSavingStatus } = props
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 })
  const [zoomed, setZoomed] = useState(false)
  const zoom = useSharedValue(1)

  useEffect(() => {
    const target = zoomed ? ZOOM_SCALE : 1
    zoom.value = reduceMotion
      ? target
      : withTiming(target, { duration: ZOOM_DURATION_MS, easing: Easing.out(Easing.cubic) })
  }, [reduceMotion, zoom, zoomed])

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoom.value }]
  }))

  const layout = getWardrobeStageLayout({
    heroWidth: heroSize.width,
    heroHeight: heroSize.height
  })
  const isMeasured = heroSize.width > 0 && heroSize.height > 0

  return (
    <View
      style={styles.hero}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout
        setHeroSize((current) =>
          Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
            ? current
            : { width, height }
        )
      }}
    >
      {isMeasured ? (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.heroCircle,
              {
                width: layout.circleSize,
                height: layout.circleSize,
                borderRadius: layout.circleSize / 2,
                top: (heroSize.height - layout.circleSize) / 2
              }
            ]}
          />
          <View pointerEvents="none" style={styles.heroAvatar}>
            <View style={{ transform: [{ translateY: layout.avatarOffsetY }] }}>
              <Animated.View
                style={[
                  { width: layout.avatarSize, height: layout.avatarHeight, transformOrigin: "50% 28%" },
                  zoomStyle
                ]}
              >
                <AvatarPreview2D
                  avatar={avatar}
                  catalog={catalog}
                  animationState="idle_front"
                  showGlow={false}
                  size={layout.avatarSize}
                  stageHeight={layout.avatarHeight}
                />
              </Animated.View>
            </View>
          </View>
        </>
      ) : null}
      {showSavingStatus ? (
        <WardrobeGlass tone="control" radius={14} style={styles.savingPill}>
          <Text
            testID="wardrobe-save-status"
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={1.3}
            style={styles.savingText}
          >
            {copy.savingLook}
          </Text>
        </WardrobeGlass>
      ) : null}
      <Pressable
        testID="wardrobe-zoom"
        accessibilityRole="button"
        accessibilityLabel={zoomed ? copy.zoomOut : copy.zoomIn}
        accessibilityState={{ selected: zoomed }}
        onPress={() => setZoomed((current) => !current)}
        hitSlop={6}
        style={({ pressed }) => [styles.zoomButton, pressed ? styles.pressedControl : null]}
      >
        <WardrobeGlass
          tone="control"
          radius={20}
          style={styles.zoomButtonSurface}
          contentStyle={styles.glassControl}
        >
          <Ionicons
            name={zoomed ? "contract-outline" : "search-outline"}
            size={18}
            color={wardrobeTheme.ink}
          />
        </WardrobeGlass>
      </Pressable>
    </View>
  )
}
