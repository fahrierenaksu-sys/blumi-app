import type { RoomV2AssetRef } from "./roomV2.types"

const image = (
  key: string,
  source: RoomV2AssetRef["source"]
): RoomV2AssetRef => ({ key, source })

/**
 * Production-only Room V2 asset registry.
 *
 * Historical QA and candidate waves intentionally live outside this module.
 * Keeping this registry closed prevents disabled feature flags from pulling
 * hundreds of rejected candidate sprites into the production Metro graph.
 */
export const roomV2ProductionAssets = {
  shells: {
    blumiWorldShellV1: image(
      "room_v2_shell_blumi_world_v1",
      require("./assets/runtime/room_shell_blumi_world_v1.webp")
    )
  }
} as const
