import { useCallback, useState } from "react"
import { Alert } from "react-native"
import { hapticLight } from "../../../ui/haptics"
import { RoomInviteApiError } from "../chatRoomInviteApi"
import type {
  ChatRoomInviteAction,
  ChatRoomInviteTimelineItem
} from "../chatRoomInviteModel"
import type { ChatThreadCopy } from "./chatThreadCopy"
import { getRoomInviteActionKey, getRoomInviteComposerState } from "./chatThreadModel"
import type { ChatThreadLifecycleRefs } from "./useChatThreadLifecycle"

/**
 * Chat-initiated room invitations: the composer entry state, card actions,
 * and the "close your previous room, then invite" recovery for SELF_IN_ROOM.
 * One action key is busy at a time; late results for an unmounted screen or
 * another signed-in user are dropped.
 */
export function useChatRoomInviteActions({
  resolvedThreadId,
  isPendingThread,
  threadRoomInvites,
  roomInviteActionHandler,
  closeActiveRoomHandler,
  chatCopy,
  currentUserId,
  screenMountedRef,
  activeUserIdRef
}: {
  resolvedThreadId: string | undefined
  isPendingThread: boolean
  threadRoomInvites: readonly ChatRoomInviteTimelineItem[]
  roomInviteActionHandler: ((action: ChatRoomInviteAction) => Promise<void>) | undefined
  closeActiveRoomHandler: ((expectedRoomSessionId: string) => Promise<void>) | undefined
  chatCopy: ChatThreadCopy
  currentUserId: string
} & ChatThreadLifecycleRefs) {
  const [activeRoomInviteAction, setActiveRoomInviteAction] = useState<string | null>(null)

  const handleRoomInviteAction = useCallback(
    (action: ChatRoomInviteAction, onError?: (error: unknown) => void): void => {
      if (!roomInviteActionHandler) return

      const actionKey = getRoomInviteActionKey(action)
      setActiveRoomInviteAction(actionKey)
      hapticLight()
      void roomInviteActionHandler(action)
        .catch((error: unknown) => { onError?.(error) })
        .finally(() => {
          setActiveRoomInviteAction((current) =>
            current === actionKey ? null : current
          )
        })
    },
    [roomInviteActionHandler]
  )

  const {
    canCreateRoomInvite,
    createRoomInviteAction,
    isCreatingRoomInvite,
    roomInviteDisabledReason
  } = getRoomInviteComposerState({
    resolvedThreadId,
    isPendingThread,
    hasRoomInviteHandler: Boolean(roomInviteActionHandler),
    threadRoomInvites,
    activeRoomInviteAction,
    chatCopy
  })

  const handleRoomInvitePress = (): void => {
    if (isCreatingRoomInvite) return
    if (!canCreateRoomInvite || !createRoomInviteAction) {
      Alert.alert(
        chatCopy.roomInviteUnavailableTitle,
        roomInviteDisabledReason ?? chatCopy.roomInviteUnavailableReason
      )
      return
    }
    const retryInvite = roomInviteActionHandler
    if (!retryInvite) return
    handleRoomInviteAction(createRoomInviteAction, (error) => {
      if (!(error instanceof RoomInviteApiError) || error.code !== "SELF_IN_ROOM") return
      if (!closeActiveRoomHandler || !error.roomSessionId) {
        Alert.alert(chatCopy.roomInviteUnavailableTitle, chatCopy.roomInviteCloseFailed)
        return
      }
      const previousRoomId = error.roomSessionId
      Alert.alert(chatCopy.roomInviteUnavailableTitle, chatCopy.roomInviteClosePreviousBody, [
        { text: chatCopy.cancel, style: "cancel" },
        {
          text: chatCopy.roomInviteClosePreviousAction,
          onPress: () => {
            const action = createRoomInviteAction
            const actionKey = getRoomInviteActionKey(action)
            setActiveRoomInviteAction(actionKey)
            void (async () => {
              try {
                await closeActiveRoomHandler(previousRoomId)
              } catch {
                if (!screenMountedRef.current || activeUserIdRef.current !== currentUserId) return
                Alert.alert(chatCopy.roomInviteUnavailableTitle, chatCopy.roomInviteCloseFailed)
                return
              }
              if (!screenMountedRef.current || activeUserIdRef.current !== currentUserId) return
              try {
                await retryInvite(action)
              } catch {
                if (screenMountedRef.current && activeUserIdRef.current === currentUserId) {
                  Alert.alert(chatCopy.roomInviteUnavailableTitle, chatCopy.roomInviteRetryFailed)
                }
              }
            })().finally(() => {
              if (screenMountedRef.current && activeUserIdRef.current === currentUserId) {
                setActiveRoomInviteAction((current) => current === actionKey ? null : current)
              }
            })
          }
        }
      ])
    })
  }

  return {
    activeRoomInviteAction,
    handleRoomInviteAction,
    canCreateRoomInvite,
    isCreatingRoomInvite,
    roomInviteDisabledReason,
    handleRoomInvitePress
  }
}
