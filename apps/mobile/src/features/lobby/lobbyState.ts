import type { RoomPresenceSnapshot } from "@blumi/contracts"
import type { ServerEvent } from "@blumi/realtime-client"
import { cloneAvatarSelection } from "../avatarV2/avatarSelectionModel"
import {
  createInitialInteractionState,
  withRecentReaction,
  type LobbyInteractionState
} from "./interactionState"
import { PUBLIC_LOBBY_ROOM_ID } from "./publicLobby"

export interface LobbyState {
  roomId: string
  isJoined: boolean
  currentUserId?: string
  assignedSpotId?: string
  snapshot: RoomPresenceSnapshot | null
  interaction: LobbyInteractionState
}

export function createInitialLobbyState(roomId = PUBLIC_LOBBY_ROOM_ID): LobbyState {
  return {
    roomId,
    isJoined: false,
    currentUserId: undefined,
    assignedSpotId: undefined,
    snapshot: null,
    interaction: createInitialInteractionState()
  }
}

export function applyServerEventToLobbyState(
  state: LobbyState,
  event: ServerEvent,
  actorUserId: string
): LobbyState {
  switch (event.type) {
    case "room.joined": {
      return {
        ...state,
        roomId: event.payload.roomId,
        isJoined: true,
        currentUserId: event.payload.currentUserId,
        assignedSpotId: event.payload.assignedSpotId
      }
    }
    case "room.left": {
      return {
        ...state,
        roomId: event.payload.roomId,
        isJoined: false,
        currentUserId: undefined,
        assignedSpotId: undefined,
        snapshot: null,
        interaction: createInitialInteractionState()
      }
    }
    case "presence.snapshot": {
      if (event.payload.roomId !== state.roomId) {
        return state
      }
      return {
        ...state,
        snapshot: event.payload
      }
    }
    case "presence.nearby": {
      if (event.payload.userId !== actorUserId) {
        return state
      }
      return {
        ...state,
        interaction: {
          ...state.interaction,
          nearbyUsers: event.payload.nearbyUsers
        }
      }
    }
    case "mini_room.invite_received": {
      if (event.payload.roomId !== state.roomId) {
        return state
      }
      return {
        ...state,
        interaction: {
          ...state.interaction,
          incomingInvite: event.payload
        }
      }
    }
    case "mini_room.invite_decided": {
      return {
        ...state,
        interaction: {
          ...state.interaction,
          incomingInvite:
            state.interaction.incomingInvite?.inviteId === event.payload.inviteId
              ? null
              : state.interaction.incomingInvite,
          latestInviteDecision: event.payload
        }
      }
    }
    case "mini_room.ready": {
      return {
        ...state,
        interaction: {
          ...state.interaction,
          readyMiniRoom: {
            miniRoom: event.payload.miniRoom,
            mediaSession: event.payload.mediaSession,
            participants: event.payload.participants.map((participant) => ({
              ...participant,
              avatar: cloneAvatarSelection(participant.avatar)
            })) as typeof event.payload.participants
          }
        }
      }
    }
    case "reaction.received": {
      if (event.payload.roomId !== state.roomId) {
        return state
      }
      return {
        ...state,
        interaction: withRecentReaction(state.interaction, event.payload)
      }
    }
    default:
      return state
  }
}
