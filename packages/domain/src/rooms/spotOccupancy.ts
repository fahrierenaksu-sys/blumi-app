import type { PresenceUser, RoomLayout } from "@blumi/contracts";

function hasSpot(layout: RoomLayout, spotId: string): boolean {
  return layout.spots.some((spot) => spot.spotId === spotId);
}

export function isSpotOccupied(
  users: PresenceUser[],
  spotId: string,
  excludeUserId?: string
): boolean {
  return users.some((user) => user.spotId === spotId && user.userId !== excludeUserId);
}

export function canOccupySpot(
  layout: RoomLayout,
  users: PresenceUser[],
  spotId: string,
  userId?: string
): boolean {
  return hasSpot(layout, spotId) && !isSpotOccupied(users, spotId, userId);
}

export function getFirstAvailableSpot(
  layout: RoomLayout,
  users: PresenceUser[]
): string | undefined {
  return layout.spots.find((spot) => !isSpotOccupied(users, spot.spotId))?.spotId;
}
