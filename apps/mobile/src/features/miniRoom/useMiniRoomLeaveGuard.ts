import {
  StackActions,
  usePreventRemove,
  useRoute,
  type NavigationProp,
  type ParamListBase
} from "@react-navigation/native"
import { useCallback, useMemo, useState, type RefObject } from "react"
import type { MiniRoomCopy } from "./miniRoomCopy"
import {
  CLOSED_MINI_ROOM_LEAVE_PROMPT,
  countScreensAboveRoom,
  getMiniRoomLeaveConfirmation,
  nextMiniRoomLeavePrompt,
  resolveMiniRoomRemoval,
  type MiniRoomLeaveConfirmation,
  type MiniRoomLeavePromptEvent
} from "./miniRoomLeaveModel"

export interface MiniRoomLeavePromptView {
  visible: boolean
  confirmation: MiniRoomLeaveConfirmation
  onStay: () => void
  onLeave: () => void
}

/**
 * Asks before the shared room ends for both people (UX audit ROOM-08). The
 * HUD arrow and the menu call the returned `confirmLeave`; any other removal
 * of the room screen (Android back, a gesture, a reset) is held by
 * usePreventRemove, the only guard native-stack forwards to the native
 * dismissal, until the room has ended (`exitedRef`). The question is drawn
 * inside the room screen (`leavePrompt`), so it goes with the screen and
 * never stays over the next one (Sim QA beta-5). When another screen covers
 * the room (a deep link pushed it), those screens close first so the question
 * is asked where it can be seen (Sim QA beta-6).
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
  navigation: Pick<NavigationProp<ParamListBase>, "dispatch" | "getState" | "isFocused">
}): { confirmLeave: () => void; leavePrompt: MiniRoomLeavePromptView } {
  const [prompt, setPrompt] = useState(CLOSED_MINI_ROOM_LEAVE_PROMPT)
  const roomRouteKey = useRoute().key

  const send = useCallback((event: MiniRoomLeavePromptEvent): void => {
    const next = nextMiniRoomLeavePrompt(prompt, event, exitedRef.current === true)
    setPrompt(next.prompt)
    if (next.requestLeave) requestLeave()
  }, [exitedRef, prompt, requestLeave])

  const confirmLeave = useCallback((): void => send("ask"), [send])

  // The room's own exit sets exitedRef before returning to chat or Inbox,
  // so that removal passes once without another confirmation.
  usePreventRemove(true, ({ data }) => {
    const decision = resolveMiniRoomRemoval({
      exited: exitedRef.current === true,
      roomFocused: navigation.isFocused()
    })
    if (decision === "allow") {
      setPrompt(CLOSED_MINI_ROOM_LEAVE_PROMPT)
      navigation.dispatch(data.action)
      return
    }
    if (decision === "revealAndConfirm") {
      const screensAbove = countScreensAboveRoom(navigation.getState()?.routes ?? [], roomRouteKey)
      if (screensAbove > 0) navigation.dispatch(StackActions.pop(screensAbove))
    }
    confirmLeave()
  })

  const leavePrompt = useMemo<MiniRoomLeavePromptView>(() => ({
    visible: prompt.visible && exitedRef.current !== true,
    confirmation: getMiniRoomLeaveConfirmation(copy),
    onStay: () => send("stay"),
    onLeave: () => send("leave")
  }), [copy, exitedRef, prompt.visible, send])

  return { confirmLeave, leavePrompt }
}
