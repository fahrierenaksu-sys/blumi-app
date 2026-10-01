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
  ChatMessageReceived,
  ChatReceiptUpdated,
  ChatThread,
  ChatThreadList,
  ChatThreadRead,
} from "../chat/ChatThread";
import type { ReactionEvent } from "../reactions/ReactionEvent";

export type ServerEvent =
  | { type: "mini_room.motion_snapshot"; payload: import("../miniRooms/MiniRoomMotion").MiniRoomMotionSnapshot }
  | { type: "mini_room.avatar_moved"; payload: { miniRoomId: string; epoch: string; participantUserIds: [string, string]; avatar: import("../miniRooms/MiniRoomMotion").MiniRoomAvatarMotion } }
  /** 2026-10-01; sent only to the replaced socket. Clients that predate it ignore it as unknown. */
  | { type: "mini_room.scene_superseded"; payload: import("../miniRooms/MiniRoomMotion").MiniRoomSceneSuperseded }
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
  | { type: "chat.message_received"; payload: ChatMessageReceived }
  /** 2026-10-01; clients that predate it report it as unknown and ignore it. */
  | { type: "chat.receipt_updated"; payload: ChatReceiptUpdated }
  | { type: "reaction.received"; payload: ReactionEvent }
  | { type: "safety.user_blocked"; payload: { blockedUserId: string } }
  | { type: "realtime.error"; payload: RealtimeErrorPayload };

/**
 * Sent only to the requesting connection when the server rejects a client
 * event it can describe safely. It never carries data about another user.
 *
 * `PRESENCE_ROOM_UNAVAILABLE` (owner decision 2026-09-30): the legacy shared
 * public lobby is retired, so `room.join`, `presence.move_to_spot`, legacy
 * `mini_room.invite` / `mini_room.invite_decision`, and presence-room
 * `reaction.send` are refused. The related `room.joined`, `presence.snapshot`,
 * `presence.nearby`, and `mini_room.invite_received` event types stay in this
 * union for compatibility with older clients and future authorized presence
 * rooms; authenticated sessions no longer receive them for the public lobby.
 */
export type RealtimeErrorCode = "PRESENCE_ROOM_UNAVAILABLE" | "CHAT_MESSAGE_NOT_SENT";

export interface RealtimeErrorPayload {
  code: RealtimeErrorCode;
  requestType: string;
  message: string;
  /**
   * `CHAT_MESSAGE_NOT_SENT` (2026-09-30): an in-room `chat.send_message`
   * carrying this id failed. Sent only to the requesting socket, and only
   * for sends that carried a clientMessageId (clients that know the code).
   */
  clientMessageId?: string;
}
