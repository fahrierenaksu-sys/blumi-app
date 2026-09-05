import type { RoomLayout } from "./RoomLayout";
import type { RoomPresenceSnapshot } from "../presence/RoomPresenceSnapshot";

export interface JoinRoomRequest {
  roomId: string;
  sessionToken: string;
  initialSpotId?: string;
}

export interface JoinRoomResponse {
  roomId: string;
  currentUserId: string;
  assignedSpotId: string;
  layout: RoomLayout;
  snapshot: RoomPresenceSnapshot;
}
