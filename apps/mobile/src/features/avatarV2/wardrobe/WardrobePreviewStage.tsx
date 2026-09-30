import { Text, View } from "react-native"
import { uiTheme } from "../../../ui/theme"
import { AvatarPreview2D } from "../components/AvatarPreview2D"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2.types"
import type { WardrobeStudioCopy } from "./wardrobeCopy"
import { wardrobeV2Styles as styles } from "./wardrobeV2Styles"

export function WardrobePreviewStage(props: {
  avatar: UserAvatar
  catalog: AvatarCatalogItem[]
  copy: WardrobeStudioCopy
  showSavingStatus: boolean
}) {
  const { avatar, catalog, copy, showSavingStatus } = props
  return (
    <View style={styles.previewPanel}>
      <View style={styles.previewAndSlots}>
        <View style={styles.avatarPreviewColumn}>
          <AvatarPreview2D
            avatar={avatar}
            catalog={catalog}
            animationState="idle_front"
            metaTone="light"
            size={180}
            stageHeight={228}
          />
          {showSavingStatus ? (
            <Text
              testID="wardrobe-save-status"
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
              style={{
                marginTop: 4,
                color: uiTheme.colors.textSecondary,
                ...uiTheme.font.caption,
                textAlign: "center"
              }}
            >
              {copy.savingLook}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}
