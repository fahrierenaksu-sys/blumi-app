import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  createRoomV3CollectionCoverageMatrix,
  summarizeRoomV3CollectionCoverage
} from "../src/features/roomV2/roomV3CollectionCoverage"

const rows = createRoomV3CollectionCoverageMatrix()
const outputPath = resolve(
  import.meta.dirname,
  "../../../docs/room-v3-qa/2026-07-18-universal-core-wave/collection_coverage_matrix.json"
)

writeFileSync(
  outputPath,
  `${JSON.stringify({
    schemaVersion: "blumi-room-v3-collection-coverage-v1",
    status: "evidence_only",
    promotionEligible: false,
    summary: summarizeRoomV3CollectionCoverage(rows),
    rows
  }, null, 2)}\n`,
  "utf8"
)

console.log(`Wrote ${rows.length} collection coverage rows to ${outputPath}`)
