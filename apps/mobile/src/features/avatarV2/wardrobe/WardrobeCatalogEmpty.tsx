import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text, View } from "react-native"
import { uiTheme } from "../../../ui/theme"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

export function WardrobeCatalogEmpty(props: {
  copy: WardrobeStudioCopy
  onExploreShop: () => void
}) {
  const { copy, onExploreShop } = props
  return (
    <View style={styles.catalogEmpty}>
      <Ionicons name="sparkles-outline" size={23} color={uiTheme.colors.primary} />
      <View style={styles.catalogEmptyCopy}>
        <Text style={styles.catalogEmptyTitle}>{copy.emptyTitle}</Text>
        <Text style={styles.catalogEmptyBody}>{copy.emptyBody}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.exploreShop}
        onPress={onExploreShop}
        style={styles.catalogEmptyAction}
      >
        <Text style={styles.catalogEmptyActionText}>{copy.exploreShop}</Text>
      </Pressable>
    </View>
  )
}
