import { useCallback, useEffect, useRef } from "react"
import { useFocusEffect } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import { createCandidateAvatarSnapshot } from "../../components/DiscoverCard"
import type {
  MiniRoomParticipantsRouteParam,
  RootStackParamList
} from "../../navigation/RootNavigator"
import type { UseLobbyFlowResult } from "./useLobbyFlow"

// Legacy lobby invite acceptance opens a MiniRoom. Production Discover never
// uses lobby presence (F-08), so it only clears any ready room.
export function useLegacyMiniRoomNavigation(input: {
  isProductionDiscovery: boolean
  myUserId: string
  myDisplayName: string
  navigation: NativeStackNavigationProp<RootStackParamList>
  lobbyState: UseLobbyFlowResult["lobbyState"]
  nearbyUsers: UseLobbyFlowResult["nearbyUsers"]
  readyMiniRoom: UseLobbyFlowResult["readyMiniRoom"]
  clearReadyMiniRoom: UseLobbyFlowResult["clearReadyMiniRoom"]
  dropPendingInviteFor: (userId: string) => void
}) {
  const {
    isProductionDiscovery,
    myUserId,
    myDisplayName,
    navigation,
    lobbyState,
    nearbyUsers,
    readyMiniRoom,
    clearReadyMiniRoom,
    dropPendingInviteFor
  } = input
  const lastNavigatedMiniRoomIdRef = useRef<string | null>(null)

  // Resolve participant display names then navigate to MiniRoom.
  useEffect(() => {
    if (isProductionDiscovery) {
      clearReadyMiniRoom()
      return
    }
    if (!readyMiniRoom) return

    const nextMiniRoomId = readyMiniRoom.miniRoom.miniRoomId
    if (lastNavigatedMiniRoomIdRef.current === nextMiniRoomId) {
      return
    }
    lastNavigatedMiniRoomIdRef.current = nextMiniRoomId

    const ids = readyMiniRoom.miniRoom.participantUserIds
    const partnerUserId = ids.find((id) => id !== myUserId) ?? ids[0] ?? ""
    dropPendingInviteFor(partnerUserId)
    const presence = lobbyState.snapshot?.users ?? []
    const partnerPresence = presence.find((u) => u.userId === partnerUserId)
    const partnerNearby = nearbyUsers.find((u) => u.userId === partnerUserId)
    const partnerParticipant = readyMiniRoom.participants.find(
      (participant) => participant.userId === partnerUserId
    )
    const partnerDisplayName =
      partnerParticipant?.displayName ??
      partnerPresence?.displayName ??
      partnerNearby?.displayName ??
      "Someone"
    const partnerAvatarPresetId =
      partnerParticipant?.avatar.presetId ?? partnerPresence?.avatar.presetId

    const participants: MiniRoomParticipantsRouteParam = {
      you: { userId: myUserId, displayName: myDisplayName },
      partner: {
        userId: partnerUserId,
        displayName: partnerDisplayName,
        avatarSnapshot: createCandidateAvatarSnapshot({
          userId: partnerUserId,
          displayName: partnerDisplayName,
          avatarPresetId: partnerAvatarPresetId,
          avatarSelection: partnerParticipant?.avatar ?? partnerPresence?.avatar
        })
      }
    }

    navigation.navigate("MiniRoom", { readyMiniRoom, participants })
  }, [
    lobbyState.snapshot?.users,
    myDisplayName,
    myUserId,
    navigation,
    nearbyUsers,
    dropPendingInviteFor,
    readyMiniRoom,
    clearReadyMiniRoom,
    isProductionDiscovery
  ])

  useFocusEffect(
    useCallback(() => {
      const readyMiniRoomId = readyMiniRoom?.miniRoom.miniRoomId
      if (
        readyMiniRoomId &&
        lastNavigatedMiniRoomIdRef.current === readyMiniRoomId
      ) {
        clearReadyMiniRoom()
      }
    }, [clearReadyMiniRoom, readyMiniRoom])
  )

  useEffect(() => {
    if (!lobbyState.isJoined && lobbyState.snapshot === null) {
      lastNavigatedMiniRoomIdRef.current = null
    }
  }, [lobbyState.isJoined, lobbyState.snapshot])
}
