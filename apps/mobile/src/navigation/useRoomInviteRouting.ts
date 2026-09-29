import type { MiniRoomParticipant, ServerEvent } from "@blumi/contracts"
import { useCallback, useRef, useState, type RefObject } from "react"
import { createCandidateAvatarSnapshot } from "../features/avatarV2/candidateAvatarSnapshot"
import type {
  ChatRoomInviteAction,
  ChatRoomInviteTimelineItem
} from "../features/chat/chatRoomInviteModel"
import { demoRoomInviteAction } from "../features/demo/demoStore"
import { DUMMY_PROFILES } from "../features/demo/dummyProfiles"
import type { SessionActor } from "../features/session/sessionModel"
import { navigationRef } from "./rootNavigationRef"

export type ReadyMiniRoomEvent = Extract<ServerEvent, { type: "mini_room.ready" }>

function createLocalDemoMediaSessionToken(): string {
  return "demo-session"
}

interface RoomInviteRoutingInput {
  latestSessionActorRef: RefObject<SessionActor | null>
  sessionMode: SessionActor["session"]["mode"] | undefined
  demoRoomInvites: readonly ChatRoomInviteTimelineItem[]
}

/**
 * Owns chat-initiated room invitations on the root: the production invite
 * timeline (written by the chat coordinator and realtime events), the demo
 * invite actions, and opening a ready MiniRoom exactly once per room.
 */
export function useRoomInviteRouting({
  latestSessionActorRef,
  sessionMode,
  demoRoomInvites
}: RoomInviteRoutingInput) {
  const [roomInvites, setRoomInvites] = useState<ChatRoomInviteTimelineItem[]>([])
  const handledReadyMiniRoomIdsRef = useRef(new Set<string>())
  const visibleRoomInvites = sessionMode === "demo"
    ? demoRoomInvites
    : roomInvites

  const openReadyMiniRoom = useCallback(
    (
      payload: ReadyMiniRoomEvent["payload"],
      options: { allowReopen?: boolean } = {}
    ): void => {
      const actor = latestSessionActorRef.current
      if (!actor || !navigationRef.isReady()) return
      if (!payload.miniRoom.participantUserIds.includes(actor.profile.userId)) {
        return
      }
      if (
        !options.allowReopen &&
        handledReadyMiniRoomIdsRef.current.has(payload.miniRoom.miniRoomId)
      ) {
        return
      }

      const partner = payload.participants.find(
        (participant) => participant.userId !== actor.profile.userId
      )
      if (!partner) return

      handledReadyMiniRoomIdsRef.current = new Set([
        ...handledReadyMiniRoomIdsRef.current,
        payload.miniRoom.miniRoomId
      ])
      navigationRef.navigate("MiniRoom", {
        readyMiniRoom: {
          miniRoom: payload.miniRoom,
          mediaSession: payload.mediaSession
        },
        participants: {
          you: {
            userId: actor.profile.userId,
            displayName: actor.profile.displayName
          },
          partner: {
            userId: partner.userId,
            displayName: partner.displayName,
            avatarSnapshot: createCandidateAvatarSnapshot({
              userId: partner.userId,
              displayName: partner.displayName,
              avatarSelection: partner.avatar
            })
          }
        }
      })
    },
    [latestSessionActorRef]
  )

  const handleDemoRoomInviteAction = useCallback(
    async (action: ChatRoomInviteAction): Promise<void> => {
      const actor = latestSessionActorRef.current
      if (!actor || actor.session.mode !== "demo") {
        throw new Error("Blumi Room invitations are available in demo mode only.")
      }

      const currentUser = {
        userId: actor.profile.userId,
        displayName: actor.profile.displayName
      }
      const invite = demoRoomInviteAction(action, currentUser)
      if (!invite) {
        throw new Error("That demo room invitation is no longer available.")
      }

      if (
        (action.type === "accept" || action.type === "open_room") &&
        invite.status === "accepted" &&
        invite.roomSessionId
      ) {
        const partnerUserId = invite.senderUserId === actor.profile.userId
          ? invite.recipientUserId
          : invite.senderUserId
        const partnerProfile = DUMMY_PROFILES.find(
          (profile) => profile.userId === partnerUserId
        )
        const participants = [
          {
            userId: actor.profile.userId,
            displayName: actor.profile.displayName,
            avatar: {
              presetId: actor.profile.avatar?.presetId ?? "dusk"
            }
          },
          {
            userId: partnerUserId,
            displayName: partnerProfile?.displayName ?? "Blumi friend",
            avatar: {
              presetId: partnerProfile?.avatarPresetId ?? "dusk"
            }
          }
        ] as [MiniRoomParticipant, MiniRoomParticipant]
        const miniRoomId = invite.roomSessionId
        openReadyMiniRoom({
          miniRoom: {
            miniRoomId,
            lobbyRoomId: "demo-lobby",
            sourceThreadId: invite.threadId,
            participantUserIds: [actor.profile.userId, partnerUserId] as [string, string],
            livekitRoomName: miniRoomId
          },
          mediaSession: {
            miniRoomId,
            livekitUrl: "demo://local",
            token: createLocalDemoMediaSessionToken(),
            issuedAt: new Date().toISOString()
          },
          participants
        }, { allowReopen: true })
      }
    },
    [latestSessionActorRef, openReadyMiniRoom]
  )

  /** Forget opened rooms and invites when the authenticated session ends. */
  const resetRoomInviteRouting = useCallback((): void => {
    handledReadyMiniRoomIdsRef.current = new Set()
    setRoomInvites([])
  }, [])

  return {
    visibleRoomInvites,
    setRoomInvites,
    openReadyMiniRoom,
    handleDemoRoomInviteAction,
    resetRoomInviteRouting
  }
}
