import { Image, StyleSheet, Text, View } from "react-native"
import type { MiniRoomCopy } from "../miniRoomCopy"
import type { MiniRoomParticipantAvatarSnapshots } from "./miniRoomSceneTypes"
import { RoomAvatarRenderer2D } from "../../avatarV2/room/components/RoomAvatarRenderer2D"
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated"
import { resolveMiniRoomContentOpacity } from "./miniRoomTransitionModel"

/** Reuses the participants' existing room presentation; never changes their loadout. */
export function MiniRoomContext({ copy, top, partnerName, snapshots, contentProgress, visible }: {
  copy: MiniRoomCopy; top: number; partnerName: string; snapshots: MiniRoomParticipantAvatarSnapshots
  /** The dock's content progress (crossfades alone under Reduce Motion). */
  contentProgress: SharedValue<number>
  visible: boolean
}) {
  const contextStyle = useAnimatedStyle(() => ({
    opacity: resolveMiniRoomContentOpacity(contentProgress.value).context
  }))
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[styles.context, { top }, contextStyle]}>
      <View accessible={false} style={styles.pair}>
        {[snapshots.local, snapshots.partner].map((snapshot, index) => (
          <View key={snapshot.role} style={[styles.avatar, index === 1 ? styles.partner : null]}>
            {snapshot.appearance.roomAvatarLayers ? <RoomAvatarRenderer2D layers={snapshot.appearance.roomAvatarLayers} />
              : snapshot.appearance.fullBodyAsset ? <Image source={snapshot.appearance.fullBodyAsset} resizeMode="contain" style={StyleSheet.absoluteFill} /> : null}
          </View>
        ))}
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.35} style={styles.title}>{copy.roomPairTitle(partnerName)}</Text>
        <Text maxFontSizeMultiplier={1.35} style={styles.caption}>{copy.roomPairCaption}</Text>
      </View>
    </Animated.View>
  )
}
const styles = StyleSheet.create({
  context: { position: "absolute", alignSelf: "center", maxWidth: "85%", flexDirection: "row", alignItems: "center", gap: 10,
    paddingLeft: 9, paddingRight: 15, paddingVertical: 7, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.55)" },
  pair: { flexDirection: "row", marginRight: 3 },
  avatar: { width: 30, height: 39, borderRadius: 22, backgroundColor: "#FFF9FC", overflow: "hidden" },
  partner: { marginLeft: -5, backgroundColor: "#F2EDFA" },
  text: { flexShrink: 1, gap: 2 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16, color: "#49364A" },
  caption: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15, color: "#8D7993" }
})
