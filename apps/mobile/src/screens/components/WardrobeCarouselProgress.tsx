import { Text, View } from "react-native"
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue
} from "react-native-reanimated"
import type { WardrobeCategoryId } from "../../features/avatarV2/wardrobeCategoryModel"
import { getWardrobeCarouselIndicator } from "../../features/avatarV2/wardrobeCategoryModel"
import { wardrobeV2Styles as styles } from "../../features/avatarV2/wardrobe/wardrobeV2Styles"

interface WardrobeCarouselProgressProps {
  category: WardrobeCategoryId
  contentWidth: number
  label: string
  /** Live scroll offset, written on the UI thread by the carousel's scroll handler. */
  offsetX: SharedValue<number>
  positionFraction: number
  viewportWidth: number
}

const TRACK_WIDTH = 94

export function WardrobeCarouselProgress(
  props: WardrobeCarouselProgressProps
): React.ReactElement {
  const indicator = getWardrobeCarouselIndicator(
    0,
    props.contentWidth,
    props.viewportWidth
  )
  const thumbWidth = TRACK_WIDTH * indicator.thumbFraction
  const maxScroll = Math.max(0, props.contentWidth - props.viewportWidth)
  const maxTranslate = Math.max(0, TRACK_WIDTH - thumbWidth)
  const offsetX = props.offsetX
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: maxScroll === 0
        ? 0
        : interpolate(offsetX.value, [0, maxScroll], [0, maxTranslate], Extrapolation.CLAMP)
    }]
  }))

  return (
    <View style={styles.carouselHeader}>
      <Text style={styles.carouselTitle}>{props.label}</Text>
      <View
        testID="wardrobe-carousel-progress"
        accessibilityRole="progressbar"
        accessibilityLabel={`${props.category} wardrobe scroll progress`}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(props.positionFraction * 100)
        }}
        style={styles.carouselProgressTrack}
      >
        <Animated.View
          style={[
            styles.carouselProgressThumb,
            { width: thumbWidth },
            thumbStyle
          ]}
        />
      </View>
    </View>
  )
}
