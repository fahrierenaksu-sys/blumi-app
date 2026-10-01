import Ionicons from "@expo/vector-icons/Ionicons"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { WardrobeGlass } from "./WardrobeGlass"
import { wardrobeTheme, wardrobeV2Styles as styles } from "./wardrobeV2Styles"

/** Back and the rose Save capsule, with the headline and tagline underneath. */
export function WardrobeTopBar(props: {
  copy: WardrobeStudioCopy
  isDoneWaiting: boolean
  onBack: () => void
  onDone: () => void
}) {
  const { copy, isDoneWaiting, onBack, onDone } = props
  return (
    <View style={styles.topBarFrame}>
      <View style={styles.topBar}>
      <Pressable
        testID="wardrobe-back"
        accessibilityRole="button"
        accessibilityLabel={copy.back}
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => (pressed ? styles.pressedControl : null)}
      >
        <WardrobeGlass
          tone="control"
          radius={20}
          style={styles.backButton}
          contentStyle={styles.glassControl}
        >
          {/* WRD-5: the same back chevron as every other detail screen. */}
          <Ionicons name="chevron-back" size={20} color={wardrobeTheme.ink} />
        </WardrobeGlass>
      </Pressable>
      <View style={styles.topBarSpacer} />
      <Pressable
        testID="wardrobe-done"
        accessibilityRole="button"
        accessibilityLabel={isDoneWaiting ? copy.doneSaving : copy.done}
        accessibilityState={{ disabled: isDoneWaiting, busy: isDoneWaiting }}
        disabled={isDoneWaiting}
        onPress={onDone}
        hitSlop={8}
        style={({ pressed }) => (pressed ? styles.pressedControl : null)}
      >
        <View style={styles.doneButton}>
          {isDoneWaiting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.doneText}>
              {copy.done}
            </Text>
          )}
        </View>
      </Pressable>
      </View>
      <Text
        accessibilityRole="header"
        accessibilityLabel={`${copy.title}. ${copy.headline}`}
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={styles.headline}
      >
        {copy.headline}
      </Text>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={styles.tagline}>
        {copy.tagline}
      </Text>
    </View>
  )
}
