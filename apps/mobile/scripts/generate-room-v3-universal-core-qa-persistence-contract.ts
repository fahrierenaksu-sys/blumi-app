import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  readStoredRoomV2Decor
} from "../src/features/roomV2/roomV2Persistence"
import { resolveRoomV2ProviderRuntimeConfig } from "../src/features/roomV2/roomV2ProviderRuntime"
import { ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS } from "../src/features/roomV2/roomV3UniversalCoreCandidateIds"

const rows = ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((candidateId) => {
  const qaRuntime = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "qa-persistence-contract",
    storageNamespace: "qa",
    isDevelopmentRuntime: true,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: [candidateId]
  })
  const productionRuntime = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "qa-persistence-contract",
    storageNamespace: "production",
    isDevelopmentRuntime: true,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: [candidateId]
  })
  const decor = {
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [{
      instanceId: `qa_persistence_${candidateId}`,
      itemId: candidateId,
      x: 0.5,
      y: 0.72,
      rotation: "front"
    }]
  }
  const roundTrip = readStoredRoomV2Decor(JSON.stringify(decor))
  return {
    candidateId,
    qaStorageKey: qaRuntime.storageKey,
    productionStorageKey: productionRuntime.storageKey,
    qaNamespaceOwnsCandidate: qaRuntime.ownedRoomItemIds.includes(candidateId),
    productionNamespaceOwnsCandidate: productionRuntime.ownedRoomItemIds.includes(candidateId),
    roundTripStatus: roundTrip.status,
    roundTripItemId: roundTrip.status === "ready"
      ? roundTrip.decor.placedItems[0]?.itemId ?? null
      : null
  }
})

const artifact = {
  schemaVersion: "blumi-room-v3-universal-core-qa-persistence-contract-v1",
  status: "contract_only",
  promotionEligible: false,
  simulatorEvidenceIncluded: false,
  summary: {
    candidateCount: rows.length,
    qaNamespaceRows: rows.filter((row) => row.qaNamespaceOwnsCandidate).length,
    productionNamespaceRejectedRows: rows.filter((row) => !row.productionNamespaceOwnsCandidate).length,
    roundTripReadyRows: rows.filter((row) => row.roundTripStatus === "ready").length
  },
  rows
}

const outputPath = resolve(
  import.meta.dirname,
  "../../../docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_qa_persistence_contract.json"
)
writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8")
console.log(`Wrote QA persistence contract for ${rows.length} products to ${outputPath}`)
