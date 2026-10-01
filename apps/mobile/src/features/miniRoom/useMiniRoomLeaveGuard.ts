import { usePreventRemove, type NavigationProp, type ParamListBase } from "@react-navigation/native"
import { useCallback, type RefObject } from "react"
import { Alert } from "react-native"
import type { MiniRoomCopy } from "./miniRoomCopy"
import { getMiniRoomLeaveConfirmation, resolveMiniRoomRemoval } from "./miniRoomLeaveModel"

/**
 * Asks before the shared room ends for both people (UX audit ROOM-08). The
 * HUD arrow and the menu call the returned `confirmLeave`; any other removal
 * of the room screen (Android back, a gesture, a reset) is held by
 * usePreventRemove, the only guard native-stack forwards to the native
 * dismissal, until the room has ended (`exitedRef`).
 */
export function useMiniRoomLeaveGuard({
  copy,
  exitedRef,
  requestLeave,
  navigation
}: {
  copy: MiniRoomCopy
  exitedRef: RefObject<boolean>
  requestLeave: () => void
  navigation: Pick<NavigationProp<ParamListBase>, "dispatch">
}): () => void {
  const confirmLeave = useCallback((): void => {
    const confirmation = getMiniRoomLeaveConfirmation(copy)
    Alert.alert(
      confirmation.title,
      confirmation.message,
      confirmation.buttons.map((button) => ({
        text: button.text,
        style: button.style,
        ...(button.action === "leave" ? { onPress: requestLeave } : {})
      }))
    )
  }, [copy, requestLeave])

  // The room's own exit sets exitedRef before returning to chat or Inbox,
  // so that removal passes once without another confirmation.
  usePreventRemove(true, ({ data }) => {
    if (resolveMiniRoomRemoval({ exited: exitedRef.current }) === "allow") {
      navigation.dispatch(data.action)
      return
    }
    confirmLeave()
  })

  return confirmLeave
}
