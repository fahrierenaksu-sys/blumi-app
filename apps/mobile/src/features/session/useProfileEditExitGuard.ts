import { usePreventRemove, type NavigationAction } from "@react-navigation/native"
import { Alert } from "react-native"

interface ExitGuardNavigation {
  dispatch: (action: NavigationAction) => void
}

/**
 * Back, the iOS edge swipe or a replace with unsaved profile edits asks before
 * discarding them (DSC-9). usePreventRemove (not a bare `beforeRemove`
 * listener) lets native-stack cancel the swipe natively, as the room editor does.
 */
export function useProfileEditExitGuard(input: {
  enabled: boolean
  navigation: ExitGuardNavigation
  copy: { discardTitle: string; discardBody: string; keepEditing: string; discard: string }
}): void {
  const { enabled, navigation, copy } = input
  usePreventRemove(enabled, ({ data }) => {
    Alert.alert(copy.discardTitle, copy.discardBody, [
      { text: copy.keepEditing, style: "cancel" },
      { text: copy.discard, style: "destructive", onPress: () => navigation.dispatch(data.action) }
    ])
  })
}
