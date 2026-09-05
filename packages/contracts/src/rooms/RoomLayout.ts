import type { RoomSpot } from "./RoomSpot";

export interface RoomLayout {
  roomId: string;
  spots: RoomSpot[];
  proximityRadius: number;
}
