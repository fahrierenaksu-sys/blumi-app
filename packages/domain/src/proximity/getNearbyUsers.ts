import type {
  NearbyUser,
  PresenceUser,
  RoomLayout,
  RoomSpot,
} from "@blumi/contracts";

function getSpot(layout: RoomLayout, spotId: string): RoomSpot | undefined {
  return layout.spots.find((spot) => spot.spotId === spotId);
}

function getDistance(a: RoomSpot, b: RoomSpot): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getNearbyUsers(
  layout: RoomLayout,
  users: readonly PresenceUser[],
  currentUserId: string,
  blockedInteractionUserIds: readonly string[] = []
): NearbyUser[] {
  const currentUser = users.find((user) => user.userId === currentUserId);
  if (!currentUser) {
    return [];
  }

  const currentSpot = getSpot(layout, currentUser.spotId);
  if (!currentSpot) {
    return [];
  }

  return users
    .filter((user) => user.userId !== currentUserId)
    .map((user) => {
      const otherSpot = getSpot(layout, user.spotId);
      if (!otherSpot) {
        return undefined;
      }

      const distance = getDistance(currentSpot, otherSpot);
      const blocked = blockedInteractionUserIds.includes(user.userId);

      return {
        userId: user.userId,
        spotId: user.spotId,
        distance,
        blocked,
        canInvite: !blocked && !user.inMiniRoom && distance <= layout.proximityRadius,
      } satisfies NearbyUser;
    })
    .filter((user): user is NearbyUser => user !== undefined)
    .filter((user) => user.distance <= layout.proximityRadius);
}
