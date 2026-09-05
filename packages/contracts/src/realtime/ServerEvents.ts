import type { JoinRoomResponse } from "../rooms/JoinRoom";
import type { RoomPresenceSnapshot } from "../presence/RoomPresenceSnapshot";
import type { NearbyUser } from "../presence/NearbyUser";
import type {
  MiniRoomInvite,
  MiniRoomInviteStatus
} from "../miniRooms/MiniRoomInvite";
import type { MiniRoomInviteDecision } from "../miniRooms/MiniRoomInviteDecision";
import type { MiniRoom } from "../miniRooms/MiniRoom";
import type { MiniRoomEnded } from "../miniRooms/MiniRoomEnd";
import type { MediaSessionToken } from "../miniRooms/MediaSessionToken";
import type { MiniRoomParticipant } from "../miniRooms/MiniRoomParticipant";
import type {
  ConnectionDecisionRecord,
  ConnectionMatch,
} from "../connections/ConnectionDecision";
import type {
  ChatMessageList,
  ChatMessage,
  ChatThread,
  ChatThreadList,
  ChatThreadRead,
} from "../chat/ChatThread";
import type { ReactionEvent } from "../reactions/ReactionEvent";

export type ServerEvent =
  | { type: "room.joined"; payload: JoinRoomResponse }
  | { type: "room.left"; payload: { roomId: string } }
  | { type: "presence.snapshot"; payload: RoomPresenceSnapshot }
  | {
      type: "presence.nearby";
      payload: {
        roomId: string;
        userId: string;
        nearbyUsers: NearbyUser[];
      };
    }
  | { type: "mini_room.invite_received"; payload: MiniRoomInvite }
  | { type: "mini_room.invite_decided"; payload: MiniRoomInviteDecision }
  | { type: "chat.room_invite_updated"; payload: MiniRoomInvite & { status: MiniRoomInviteStatus; decidedAt?: string } }
  | {
      type: "mini_room.ready";
      payload: {
        miniRoom: MiniRoom;
        mediaSession: MediaSessionToken;
        participants: [MiniRoomParticipant, MiniRoomParticipant];
      };
    }
  | { type: "mini_room.ended"; payload: MiniRoomEnded }
  | { type: "connection.decision_recorded"; payload: ConnectionDecisionRecord }
  | { type: "connection.matched"; payload: ConnectionMatch }
  | { type: "chat.thread_created"; payload: ChatThread }
  | { type: "chat.thread_listed"; payload: ChatThreadList }
  | { type: "chat.thread_read"; payload: ChatThreadRead }
  | { type: "chat.message_listed"; payload: ChatMessageList }
  | { type: "chat.message_received"; payload: ChatMessage }
  | { type: "reaction.received"; payload: ReactionEvent }
  | { type: "safety.user_blocked"; payload: { blockedUserId: string } };
