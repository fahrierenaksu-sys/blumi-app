export interface NearbyUser {
  userId: string;
  spotId: string;
  distance: number;
  canInvite: boolean;
  blocked: boolean;
}
