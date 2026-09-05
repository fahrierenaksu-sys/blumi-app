import type {
  MediaSessionToken,
  MiniRoom,
  MiniRoomParticipant,
  MiniRoomInviteDecision,
  MiniRoomInvite,
  NearbyUser,
  ReactionEvent
} from "@blumi/contracts"

const MAX_RECENT_REACTIONS = 5

export interface ReadyMiniRoom {
  miniRoom: MiniRoom
  mediaSession: MediaSessionToken
  participants: [MiniRoomParticipant, MiniRoomParticipant]
}

export interface LobbyInteractionState {
  nearbyUsers: NearbyUser[]
  incomingInvite: MiniRoomInvite | null
  latestInviteDecision: MiniRoomInviteDecision | null
  readyMiniRoom: ReadyMiniRoom | null
  recentReactions: ReactionEvent[]
}

export function createInitialInteractionState(): LobbyInteractionState {
  return {
    nearbyUsers: [],
    incomingInvite: null,
    latestInviteDecision: null,
    readyMiniRoom: null,
    recentReactions: []
  }
}

export function withRecentReaction(
  state: LobbyInteractionState,
  reaction: ReactionEvent
): LobbyInteractionState {
  return {
    ...state,
    recentReactions: [reaction, ...state.recentReactions].slice(0, MAX_RECENT_REACTIONS)
  }
}
