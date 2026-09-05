import type { JoinRoomRequest } from "../rooms/JoinRoom";
import type { LeaveRoomRequest } from "../rooms/LeaveRoom";
import type { MoveToSpotCommand } from "../presence/MoveToSpotCommand";
import type { MiniRoomLeaveCommand } from "../miniRooms/MiniRoomEnd";
import type { MiniRoomInviteDecisionStatus } from "../miniRooms/MiniRoomInviteDecision";
import type { ConnectionDecisionCommand } from "../connections/ConnectionDecision";
import type {
  ChatListMessagesCommand,
  ChatListThreadsCommand,
  ChatSendMessageCommand,
} from "../chat/ChatThread";
import type { ReactionType } from "../reactions/ReactionEvent";
import type { ReportReason } from "../safety/ReportReason";

export type ClientEvent =
  | { type: "room.join"; payload: JoinRoomRequest }
  | { type: "room.leave"; payload: LeaveRoomRequest }
  | { type: "presence.move_to_spot"; payload: MoveToSpotCommand }
  | {
      type: "mini_room.invite";
      payload: {
        roomId: string;
        recipientUserId: string;
      };
    }
  | { type: "mini_room.leave"; payload: MiniRoomLeaveCommand }
  | {
      type: "mini_room.invite_decision";
      payload: {
        inviteId: string;
        status: Exclude<MiniRoomInviteDecisionStatus, "cancelled">;
      };
    }
  | { type: "connection.decide"; payload: ConnectionDecisionCommand }
  | { type: "chat.list_threads"; payload: ChatListThreadsCommand }
  | { type: "chat.list_messages"; payload: ChatListMessagesCommand }
  | { type: "chat.send_message"; payload: ChatSendMessageCommand }
  | {
      type: "reaction.send";
      payload: {
        roomId: string;
        reaction: ReactionType;
        targetUserId?: string;
      };
    }
  | {
      type: "safety.block";
      payload: {
        blockedUserId: string;
      };
    }
  | {
      type: "safety.report";
      payload: {
        reportedUserId: string;
        reason: ReportReason;
        note?: string;
      };
    };
