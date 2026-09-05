import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import {
  MALE_WARDROBE_REDESIGN_ITEMS,
  MALE_WARDROBE_REDESIGN_PLAN,
} from "./male-wardrobe-redesign-plan.mjs"

const repo = resolve(import.meta.dirname, "../../..")
const evidenceRoot = resolve(
  repo,
  "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27",
)

const manifest = {
  ...MALE_WARDROBE_REDESIGN_PLAN,
  createdAt: "2026-07-27",
  approvalPolicy: {
    staticProducer: "required",
    independentReviewer: "required",
    userApproval: "required-before-runtime-promotion",
  },
  items: MALE_WARDROBE_REDESIGN_ITEMS,
}

const continuityBible = {
  schemaVersion: 1,
  projectId: MALE_WARDROBE_REDESIGN_PLAN.projectId,
  canonicalCharacter: {
    id: "blumi-male-room-base-light-v1",
    source: MALE_WARDROBE_REDESIGN_PLAN.canonicalBase,
    invariants: [
      "front-facing 2.5D perspective",
      "head face skin arms hands legs and feet remain canonical",
      "256x384 centerline and baseline",
      "premium soft painterly Blumi game-art finish",
    ],
    forbiddenVariations: [
      "adult garment photo pasted or texture-mapped onto the avatar",
      "body proportion or identity drift",
      "rear collar visible in the front view",
      "single fused skirt mass for trousers",
      "pant hem covering shoe tongue laces or toe",
    ],
  },
  proofContract: {
    static: ["full-body", "light-background", "dark-background"],
    closeups: ["neck-shoulder", "waist", "crotch-inner-gap", "hem-shoe"],
    motion: [
      "walking_front_f01",
      "walking_front_f02",
      "walking_front_f03",
      "walking_front_f04",
      "sitting_front_f01",
    ],
  },
}

const sourceLedger = {
  schemaVersion: 1,
  projectId: MALE_WARDROBE_REDESIGN_PLAN.projectId,
  sources: [
    {
      sourceId: "canonical-male-base-v1",
      origin: "project-canonical",
      path: MALE_WARDROBE_REDESIGN_PLAN.canonicalBase,
      purpose: "identity geometry pose perspective and anchor lock",
    },
    {
      sourceId: "approved-male-wardrobe-user-references",
      origin: "user-provided-conversation-references",
      path: "conversation-evidence",
      purpose: "silhouette drape material waist and hem-shoe art direction only",
      restrictions: "never paste shrink warp or texture-map onto the avatar",
    },
  ],
}

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

writeJson(resolve(evidenceRoot, "asset-manifest.json"), manifest)
writeJson(resolve(evidenceRoot, "continuity-bible.json"), continuityBible)
writeJson(resolve(evidenceRoot, "source-reference-ledger.json"), sourceLedger)

console.log(evidenceRoot)
