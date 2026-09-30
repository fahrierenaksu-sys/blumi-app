import Ionicons from "@expo/vector-icons/Ionicons"
import { Text, View } from "react-native"
import { WardrobeGlass } from "../../avatarV2/wardrobe/WardrobeGlass"
import type { getEditRoomWorldStatus } from "./roomEditorPresentationModel"
import { roomEditorTheme, styles } from "./roomEditorStyles"

/**
 * One short line over the room: live placement or save feedback, else a
 * warning when the layout leaves the avatar too little space. Nothing is
 * shown when the room is fine.
 */
export function RoomEditorStageNotice(props: {
  placementFeedback: string | undefined
  roomWorldWarning: ReturnType<typeof getEditRoomWorldStatus> | undefined
}) {
  const { placementFeedback, roomWorldWarning } = props
  const text = placementFeedback || roomWorldWarning?.label
  if (!text) return null
  return (
    <View style={styles.stageNotice} pointerEvents="none">
      <WardrobeGlass
        tone="control"
        radius={18}
        style={styles.stageNoticePill}
        contentStyle={styles.stageNoticeContent}
      >
        {!placementFeedback && roomWorldWarning ? (
          <Ionicons name={roomWorldWarning.icon} size={14} color={roomEditorTheme.accent} />
        ) : null}
        <Text
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1.4}
          numberOfLines={3}
          style={styles.stageNoticeText}
        >
          {text}
        </Text>
      </WardrobeGlass>
    </View>
  )
}
