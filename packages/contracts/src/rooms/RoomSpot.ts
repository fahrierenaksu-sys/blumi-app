export const ROOM_SPOT_KINDS = ["seat", "hotspot"] as const;

export type RoomSpotKind = (typeof ROOM_SPOT_KINDS)[number];

export interface RoomSpot {
  spotId: string;
  kind: RoomSpotKind;
  x: number;
  y: number;
  label?: string;
}
