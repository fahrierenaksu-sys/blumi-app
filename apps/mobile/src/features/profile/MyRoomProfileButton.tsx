import { StyleSheet, Text } from "react-native"
import { PressableScale } from "../../ui/PressableScale"
import { MyAvatar } from "../../ui/myAvatar"
import { uiTheme } from "../../ui/theme"
import { getAppLocale } from "../session/appLocale"
import { getOwnProfileCopy } from "./profileCopy"

/**
 * My Room's top-right entry to the own profile, the only one in the app: the
 * user's mini chibi with a "Profile" label, so it reads as "me" at a glance.
 */
export function MyRoomProfileButton(props: {
  displayName: string
  userId: string
  onPress: () => void
}) {
  const copy = getOwnProfileCopy(getAppLocale())
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={copy.myRoomEntryAccessibilityLabel}
      onPress={props.onPress}
      hitSlop={4}
      style={styles.button}
      testID="my-room-profile-button"
    >
      <MyAvatar name={props.displayName} seed={props.userId} size={34} ring="soft" />
      <Text style={styles.label} numberOfLines={1}>{copy.myRoomEntryLabel}</Text>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    maxWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 5,
    paddingRight: 14,
    borderRadius: uiTheme.radius.full,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F2DDEA",
    ...uiTheme.shadow.soft
  },
  label: {
    ...uiTheme.font.label,
    color: uiTheme.colors.textPrimary,
    flexShrink: 1
  }
})
