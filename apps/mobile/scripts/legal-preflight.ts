import { getAllLegalContent } from "../src/features/legal/legalCopy"
import { assertLegalReleaseReady } from "../src/features/legal/legalPolicyMetadata"

// Build-time gate supplements (never bypasses) the runtime fail-closed guard.
assertLegalReleaseReady({
  buildProfile: process.env.EAS_BUILD_PROFILE ?? "development",
  serializedDocuments: JSON.stringify(getAllLegalContent())
})
console.log("Legal preflight passed for the selected build profile.")
