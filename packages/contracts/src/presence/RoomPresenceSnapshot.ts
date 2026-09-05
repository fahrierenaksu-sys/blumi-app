import type { PresenceUser } from "./PresenceUser";

export interface RoomPresenceSnapshot {
  roomId: string;
  users: PresenceUser[];
  updatedAt: string;
}
