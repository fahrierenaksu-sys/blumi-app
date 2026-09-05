import type { RoomShell, RoomV2AssetRef } from "./roomV2.types"
import { ROOM_V3_QA_SHELL_IDS } from "./roomV3QaShellCatalogRuntime"

interface RoomV3QaShellDefinition {
  id: (typeof ROOM_V3_QA_SHELL_IDS)[number]
  name: string
  asset: RoomV2AssetRef
}

const image = (key: string, source: RoomV2AssetRef["source"]): RoomV2AssetRef => ({
  key,
  source
})

const ROOM_V3_QA_SHELL_DEFINITIONS: readonly RoomV3QaShellDefinition[] = [
  {
    id: "room_v3_shell_apricot_sky_social_loft",
    name: "Apricot Sky",
    asset: image(
      "room_v3_shell_apricot_sky_social_loft_candidate_v6",
      require("./assets/runtime/candidates/room_v3_shell_apricot_sky_social_loft_candidate_v6.png")
    )
  },
  {
    id: "room_v3_shell_blush_petal_cottage",
    name: "Blush Petal",
    asset: image(
      "room_v3_shell_blush_petal_cottage_candidate_v6",
      require("./assets/runtime/candidates/room_v3_shell_blush_petal_cottage_candidate_v6.png")
    )
  },
  {
    id: "room_v3_shell_cocoa_navy_modern_studio",
    name: "Cocoa Navy",
    asset: image(
      "room_v3_shell_cocoa_navy_modern_studio_candidate_v6",
      require("./assets/runtime/candidates/room_v3_shell_cocoa_navy_modern_studio_candidate_v6.png")
    )
  },
  {
    id: "room_v3_shell_sage_cloud_scandinavian",
    name: "Sage Cloud",
    asset: image(
      "room_v3_shell_sage_cloud_scandinavian_candidate_v6",
      require("./assets/runtime/candidates/room_v3_shell_sage_cloud_scandinavian_candidate_v6.png")
    )
  },
  {
    id: "room_v3_shell_forest_terracotta_creative_loft",
    name: "Forest Terracotta",
    asset: image(
      "room_v3_shell_forest_terracotta_creative_loft_candidate_v10",
      require("./assets/runtime/candidates/room_v3_shell_forest_terracotta_creative_loft_candidate_v10.png")
    )
  },
  {
    id: "room_v3_shell_lavender_moon_atelier",
    name: "Lavender Moon",
    asset: image(
      "room_v3_shell_lavender_moon_atelier_candidate_v10",
      require("./assets/runtime/candidates/room_v3_shell_lavender_moon_atelier_candidate_v10.png")
    )
  }
]

export function createRoomV3QaShellCandidates(baseShell: RoomShell): RoomShell[] {
  return ROOM_V3_QA_SHELL_DEFINITIONS.map((definition) => ({
    ...baseShell,
    id: definition.id,
    name: definition.name,
    asset: { ...definition.asset },
    canvasSize: { ...baseShell.canvasSize },
    sourceStatus: "candidate",
    qaStatus: "pending"
  }))
}
