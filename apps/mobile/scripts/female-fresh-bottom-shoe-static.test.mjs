import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repo = resolve(workspace, "../..")
const evidenceRoot = resolve(
  repo,
  "docs/avatar-motion-pipeline/female-fresh-bottom-shoe-capsule/2026-07-16"
)
const manifestPath = resolve(evidenceRoot, "static-manifest.json")

const expectedItems = [
  ["bottom", "midnight_ribbon_wide_leg_pants", "trouser"],
  ["bottom", "buttercream_pearl_tailored_pants", "trouser"],
  ["bottom", "rose_picnic_pleated_shorts", "short"],
  ["bottom", "lavender_bow_twill_shorts", "short"],
  ["shoes", "rose_satin_bow_heels", "heel"],
  ["shoes", "ivory_pearl_slingback_heels", "heel"],
  ["shoes", "lilac_star_platform_sneakers", "sneaker"],
  ["shoes", "mint_ribbon_court_sneakers", "sneaker"]
]

assert.equal(existsSync(manifestPath), true, "static capsule manifest is missing")

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
assert.equal(manifest.fitProfileId, "blumi_female_room_avatar_v1")
assert.equal(manifest.rigId, "blumi_2_5d_layered_v1")
assert.deepEqual(manifest.states, ["static"])
assert.equal(manifest.items.length, expectedItems.length)
assert.equal(manifest.staticFitVerdict, "PASS_CANDIDATE")

for (const [category, slug, role] of expectedItems) {
  const item = manifest.items.find((entry) => entry.category === category && entry.slug === slug)
  assert.ok(item, `missing ${category}/${slug}`)
  assert.equal(item.role, role)
  assert.deepEqual(item.canvas, [256, 384])
  assert.equal(item.transparentRgbResidue, 0, `${slug} contains transparent RGB residue`)
  assert.equal(item.detachedAlphaComponents, 0, `${slug} has detached alpha islands`)
  assert.equal(existsSync(resolve(repo, item.staticPath)), true, `${slug} static layer is missing`)
  assert.equal(existsSync(resolve(repo, item.staticCompositePath)), true, `${slug} static composite is missing`)
}

assert.equal(existsSync(resolve(evidenceRoot, "static-fit-contact-sheet.png")), true)
