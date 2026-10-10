import type { UserRoomDecor } from "../roomV2.types"

/**
 * Test fixture only (imported by the layered furniture tests, never by app code): a furnished Blumi Home room
 * with the armchair, the Japon sofa, a rug and the coffee table in front of the sofa. Ownership is the server's;
 * this is just a valid arrangement to check placement, seats and walking against.
 */
export function createLayeredFurnitureTestRoom(): UserRoomDecor {
  return {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [
      { instanceId: "test-room-chair-blush", itemId: "room_v2_chair_blush", x: 0.479, y: 0.693, rotation: "front" },
      { instanceId: "test-room-sofa-japon-cream", itemId: "room_v3_sofa_japon_cream", x: 0.286, y: 0.639, rotation: "front" },
      { instanceId: "test-room-rug-japon-botanic", itemId: "room_v3_rug_japon_botanic", x: 0.341, y: 0.747, rotation: "front" },
      { instanceId: "test-room-coffeetable-japon-round", itemId: "room_v3_coffeetable_japon_round", x: 0.396, y: 0.711, rotation: "front" }
    ]
  }
}
