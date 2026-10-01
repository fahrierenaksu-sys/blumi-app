import Ionicons from "@expo/vector-icons/Ionicons"
import { StyleSheet, View } from "react-native"
import { uiTheme } from "../../../ui/theme"

export function RoomInviteComposerIcon({ ready }: { ready: boolean }) {
  return (
    <View accessible={false} style={styles.icon}>
      <Ionicons name="home-outline" size={23} color={uiTheme.colors.primaryDeep} />
      <View style={styles.heart}><Ionicons name="heart" size={7} color={uiTheme.colors.primaryDeep} /></View>
      {ready ? <View style={styles.ready}><Ionicons name="checkmark" size={9} color={uiTheme.colors.surface} /></View> : null}
    </View>
  )
}
const styles = StyleSheet.create({
  icon: { width: 25, height: 25, alignItems: "center", justifyContent: "center" },
  heart: { position: "absolute", left: 9, top: 11, backgroundColor: uiTheme.colors.primarySoft, width: 8, height: 8, alignItems: "center", justifyContent: "center" },
  ready: { position: "absolute", top: -8, right: -9, width: 15, height: 15, borderRadius: 8, backgroundColor: uiTheme.colors.successInk, borderWidth: 2, borderColor: uiTheme.colors.background, alignItems: "center", justifyContent: "center" }
})
