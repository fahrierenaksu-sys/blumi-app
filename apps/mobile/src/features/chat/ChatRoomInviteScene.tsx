import Ionicons from "@expo/vector-icons/Ionicons"
import type { AvatarSelection } from "@blumi/contracts"
import { StyleSheet, Text, View } from "react-native"
import Animated from "react-native-reanimated"
import { LinearGradient } from "../../ui/linearGradient"
import { uiTheme } from "../../ui/theme"
import { RoomInviteAvatar } from "./RoomInviteAvatar"
import { useRoomInviteSceneMotion } from "./useRoomInviteSceneMotion"

export interface RoomInviteSceneParticipant { avatar?: AvatarSelection; name: string; userId: string }

export function ChatRoomInviteScene({ open, label, note, sender, recipient }: {
  open: boolean; label: string; note: string; sender: RoomInviteSceneParticipant; recipient: RoomInviteSceneParticipant
}) {
  const motion = useRoomInviteSceneMotion(open)
  return (
    <View style={styles.scene} accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <LinearGradient colors={[uiTheme.colors.brandMilk, uiTheme.colors.brandBlush]} style={StyleSheet.absoluteFill} />
      <View style={styles.floor}><LinearGradient colors={["#EED6D5", "#F3E3E7"]} style={StyleSheet.absoluteFill} /></View>
      <View style={styles.label}><Ionicons name="home-outline" size={13} color={uiTheme.colors.brandPlum} /><Text style={styles.labelText}>{label}</Text></View>
      <Animated.View style={[styles.lightBeam, motion.beamStyle]} />
      <Animated.View style={[styles.lightPool, motion.poolStyle]}><View style={styles.poolMiddle}><View style={styles.poolCore} /></View></Animated.View>
      <View style={styles.doorFrame}>
        <LinearGradient colors={["#F6E1CC", "#D6AB98", "#E6C6B0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.frameOuter} />
        <View style={styles.frameMoulding} />
        <View style={styles.doorOpening}>
          <Animated.View style={[StyleSheet.absoluteFill, motion.interiorStyle]}>
            <LinearGradient colors={["#FFEBC2", "#F5C985", "#E8B172"]} style={StyleSheet.absoluteFill} />
            <View style={styles.innerWall} /><View style={styles.innerSkirting} />
            <View style={styles.innerRug} /><View style={styles.innerGlow} />
          </Animated.View>
        </View>
        <Animated.View style={[styles.doorLeaf, motion.doorStyle]}>
          <LinearGradient colors={["#E8B8BE", "#DA9CA8", "#C98596"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.doorFace}>
            <View style={styles.doorBevel}><View style={styles.upperPanel}><Ionicons name="heart" size={18} color="#FFECD5" /></View><View style={styles.lowerPanel} /></View>
            <View style={styles.handlePlate}><View style={styles.handle}><View style={styles.handleGlint} /></View></View>
          </LinearGradient>
          <View style={styles.doorEdge} />
        </Animated.View>
        <View style={[styles.hinge, styles.hingeTop]} /><View style={[styles.hinge, styles.hingeBottom]} />
        <View style={styles.threshold} />
      </View>
      <View style={styles.lamp}><View style={styles.lampMount} /><View style={styles.lampShade} /><View style={styles.lampBulb} /></View>
      <View style={[styles.person, styles.sender]}><RoomInviteAvatar avatar={sender.avatar} name={sender.name} seed={sender.userId} /></View>
      <View style={[styles.person, styles.recipient]}><RoomInviteAvatar avatar={recipient.avatar} name={recipient.name} seed={recipient.userId} /></View>
      <View style={[styles.note, open ? styles.acceptedNote : styles.pendingNote]}><Text style={styles.noteText}>{note}</Text><View style={[styles.noteTail, open ? styles.acceptedNoteTail : styles.pendingNoteTail]} /></View>
      {open ? <Animated.View style={[styles.check, motion.checkStyle]}><Ionicons name="checkmark" size={14} color={uiTheme.colors.surface} /></Animated.View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  scene: { height: 210, overflow: "hidden" },
  label: { position: "absolute", top: 13, left: 16, flexDirection: "row", alignItems: "center", gap: 5 },
  labelText: { ...uiTheme.font.micro, color: uiTheme.colors.brandPlum },
  floor: { position: "absolute", left: 0, right: 0, bottom: 0, height: 38, borderTopWidth: 1, borderTopColor: "#E5C8CB" },
  doorFrame: { position: "absolute", width: 98, height: 146, left: "50%", marginLeft: -49, bottom: 28 },
  frameOuter: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderTopLeftRadius: 51, borderTopRightRadius: 51, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, borderWidth: 1, borderColor: "#FAEADD", shadowColor: "#9F6A77", shadowOpacity: 0.2, shadowOffset: { width: 3, height: 3 }, shadowRadius: 4 },
  frameMoulding: { position: "absolute", top: 4, bottom: 3, left: 4, right: 4, borderTopLeftRadius: 47, borderTopRightRadius: 47, borderWidth: 2, borderColor: "#EBCFB9" },
  doorOpening: { position: "absolute", top: 9, bottom: 4, left: 9, right: 9, borderTopLeftRadius: 41, borderTopRightRadius: 41, backgroundColor: "#F8D4A0", overflow: "hidden", borderWidth: 1, borderColor: "#BA8D7D" },
  innerWall: { position: "absolute", right: 3, top: 31, bottom: 23, width: 33, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 3, borderColor: "#FFE7BC", backgroundColor: "#F6D398" },
  innerSkirting: { position: "absolute", bottom: 24, left: 0, right: 0, height: 3, backgroundColor: "#E6B677" },
  innerRug: { position: "absolute", left: 8, right: 8, bottom: 3, height: 14, borderRadius: 30, backgroundColor: "#E8BF91", transform: [{ scaleY: 0.4 }] },
  innerGlow: { position: "absolute", width: 32, height: 90, top: 8, left: 4, backgroundColor: "#FFF5D638", borderRadius: 40 },
  doorLeaf: { position: "absolute", top: 10, bottom: 5, left: 10, width: 78, transformOrigin: "left center", backfaceVisibility: "hidden", shadowColor: "#85525F", shadowOpacity: 0.16, shadowRadius: 3, shadowOffset: { width: 2, height: 1 } },
  doorFace: { flex: 1, borderTopLeftRadius: 40, borderTopRightRadius: 40, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, borderWidth: 1, borderColor: "#F4CED0", overflow: "hidden" },
  doorBevel: { position: "absolute", top: 8, bottom: 8, left: 7, right: 7, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, borderTopColor: "#F6D3D7", borderLeftColor: "#EFC5CC", borderRightColor: "#B97589", borderBottomColor: "#B97589" },
  upperPanel: { height: 63, margin: 5, marginTop: 7, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, borderWidth: 1, borderColor: "#C7899A", backgroundColor: "#DAA2AE", alignItems: "center", justifyContent: "center" },
  lowerPanel: { flex: 1, margin: 5, marginTop: 2, borderRadius: 3, borderWidth: 1, borderColor: "#C7899A", backgroundColor: "#DBA2AF" },
  doorEdge: { position: "absolute", right: -2, top: 34, bottom: 0, width: 3, backgroundColor: "#B16E83", borderTopRightRadius: 2 },
  handlePlate: { position: "absolute", right: 5, top: 76, width: 6, height: 15, borderRadius: 4, backgroundColor: "#B5876C", borderWidth: 1, borderColor: "#E3BCA0" },
  handle: { position: "absolute", width: 7, height: 7, borderRadius: 4, right: -3, top: 3, backgroundColor: "#B58A66", borderWidth: 1, borderColor: "#E4C19B" },
  handleGlint: { position: "absolute", left: 1, top: 1, height: 2, width: 3, borderRadius: 2, backgroundColor: "#FFE3B7" },
  hinge: { position: "absolute", width: 3, height: 8, left: 8, borderRadius: 2, backgroundColor: "#AC876E" },
  hingeTop: { top: 54 }, hingeBottom: { bottom: 26 },
  threshold: { position: "absolute", left: 7, right: 5, bottom: 1, height: 4, backgroundColor: "#CBA58C", borderRadius: 2, borderTopWidth: 1, borderTopColor: "#F7DBC4" },
  lamp: { position: "absolute", width: 26, height: 19, left: "50%", marginLeft: -13, top: 23, alignItems: "center" },
  lampMount: { width: 4, height: 6, backgroundColor: "#AE856A", borderRadius: 3 },
  lampShade: { width: 25, height: 8, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: "#B68D6D", borderBottomWidth: 1, borderBottomColor: "#D9B08A" },
  lampBulb: { width: 10, height: 5, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: "#FFECC1", shadowColor: "#F5C369", shadowOpacity: 0.8, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 },
  lightBeam: { position: "absolute", left: "50%", marginLeft: -62, bottom: 17, width: 0, height: 0, borderLeftWidth: 62, borderRightWidth: 62, borderBottomWidth: 90, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#FFE7B1", transformOrigin: "center top" },
  lightPool: { position: "absolute", width: 172, height: 32, bottom: 12, left: "50%", marginLeft: -86, borderRadius: 100, backgroundColor: "#FFE5A91C", justifyContent: "center", alignItems: "center" },
  poolMiddle: { width: 139, height: 23, borderRadius: 90, backgroundColor: "#FFE5A928", justifyContent: "center", alignItems: "center" },
  poolCore: { width: 104, height: 13, borderRadius: 80, backgroundColor: "#FFE8B57D" },
  person: { position: "absolute", width: 103, height: 155, bottom: 17 },
  sender: { left: "2%" }, recipient: { right: "2%" },
  note: { position: "absolute", top: 56, maxWidth: 110, borderRadius: 11, backgroundColor: uiTheme.colors.surfaceRaised, paddingHorizontal: 9, paddingVertical: 6, ...uiTheme.shadow.soft },
  noteText: { ...uiTheme.font.micro, color: uiTheme.colors.brandPlum },
  pendingNote: { left: 10 },
  acceptedNote: { right: 10, top: 32 },
  pendingNoteTail: { left: 12 },
  acceptedNoteTail: { right: 32 },
  noteTail: { position: "absolute", bottom: -3, width: 6, height: 6, backgroundColor: uiTheme.colors.surfaceRaised, transform: [{ rotate: "45deg" }] },
  check: { position: "absolute", top: 64, right: 21, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: uiTheme.colors.successInk, borderWidth: 2, borderColor: uiTheme.colors.surfaceRaised }
})
