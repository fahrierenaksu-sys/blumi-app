import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import Animated, { FadeIn, FadeOut } from "react-native-reanimated"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { WardrobeGlass } from "./WardrobeGlass"
import { wardrobeTheme, wardrobeV2Styles as styles } from "./wardrobeV2Styles"
import { PressableScale } from "../../../ui/PressableScale"

/**
 * MICRO-3: shown under the stage while a locked item is tried on: what is
 * previewed, that it is not owned yet, and "See in Shop" for that product.
 */
export function WardrobeLockedPreviewBar(props: {
  itemName: string
  copy: WardrobeStudioCopy
  reduceMotion: boolean
  onSeeInShop: () => void
  onClose: () => void
}) {
  const { itemName, copy, reduceMotion } = props
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(160)}
      exiting={reduceMotion ? undefined : FadeOut.duration(120)}
      style={styles.lockedPreviewSlot}
    >
      <WardrobeGlass tone="control" radius={20} contentStyle={styles.lockedPreview}>
        <Ionicons name="lock-closed-outline" size={16} color={wardrobeTheme.muted} />
        <View style={styles.lockedPreviewCopy} accessible accessibilityLiveRegion="polite">
          <Text maxFontSizeMultiplier={1.4} numberOfLines={2} style={styles.lockedPreviewTitle}>
            {copy.lockedPreviewTitle(itemName)}
          </Text>
          <Text maxFontSizeMultiplier={1.4} numberOfLines={2} style={styles.lockedPreviewBody}>
            {copy.lockedPreviewBody}
          </Text>
        </View>
        <Pressable
          testID="wardrobe-locked-see-in-shop"
          accessibilityRole="button"
          accessibilityLabel={copy.seeInShopAccessibility(itemName)}
          onPress={props.onSeeInShop}
          style={({ pressed }) => [styles.lockedPreviewAction, pressed ? styles.pressedControl : null]}
        >
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.lockedPreviewActionText}>
            {copy.seeInShop}
          </Text>
        </Pressable>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={copy.closePreview}
          onPress={props.onClose}
          hitSlop={10}
          style={styles.lockedPreviewClose}
        >
          <Ionicons name="close" size={16} color={wardrobeTheme.muted} />
        </PressableScale>
      </WardrobeGlass>
    </Animated.View>
  )
}
