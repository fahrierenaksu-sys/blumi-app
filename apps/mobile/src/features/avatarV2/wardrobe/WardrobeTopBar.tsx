import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import { uiTheme } from "../../../ui/theme"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

export function WardrobeTopBar(props: {
  copy: WardrobeStudioCopy
  onBack: () => void
}) {
  const { copy, onBack } = props
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={({ pressed }) => [
          styles.iconButton,
          pressed ? styles.iconButtonPressed : null
        ]}
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={20} color={uiTheme.colors.textPrimary} />
      </Pressable>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>
      </View>
      <View style={styles.progressPill} accessibilityLabel={`Step ${copy.progress}`}>
        <Text style={styles.progressPillText}>{copy.progress}</Text>
      </View>
    </View>
  )
}
