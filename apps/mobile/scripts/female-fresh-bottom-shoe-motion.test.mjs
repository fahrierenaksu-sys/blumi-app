import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repo = resolve(workspace, "../..")
const evidenceRoot = resolve(
  repo,
  "docs/avatar-motion-pipeline/female-fresh-bottom-shoe-capsule/2026-07-16"
)
const manifestPath = resolve(evidenceRoot, "capsule-manifest.json")
const states = [
  "static",
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01"
]

assert.equal(existsSync(manifestPath), true, "4W+1S capsule manifest is missing")

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
assert.equal(manifest.rigId, "blumi_2_5d_layered_v1")
assert.equal(manifest.fitProfileId, "blumi_female_room_avatar_v1")
assert.deepEqual(manifest.states, states)
assert.equal(manifest.frameDurationMs, 120)
assert.equal(manifest.items.length, 8)
assert.equal(existsSync(resolve(repo, manifest.motionContactSheet)), true)
assert.equal(typeof manifest.motionCloseups, "string", "motion seam close-up evidence is missing")
assert.equal(existsSync(resolve(repo, manifest.motionCloseups)), true, "motion seam close-up evidence is missing")

const rigCheck = spawnSync(
  "python3",
  [resolve(workspace, "scripts/produce_female_fresh_bottom_shoe_capsule.py"), "--check"],
  { cwd: repo, encoding: "utf8" }
)
assert.equal(
  rigCheck.status,
  0,
  `female bottom/shoe rig gate failed:\n${rigCheck.stdout}${rigCheck.stderr}`
)

const expectedRoles = new Map([
  ["midnight_ribbon_wide_leg_pants", "trouser"],
  ["buttercream_pearl_tailored_pants", "trouser"],
  ["rose_picnic_pleated_shorts", "short"],
  ["lavender_bow_twill_shorts", "short"],
  ["rose_satin_bow_heels", "heel"],
  ["ivory_pearl_slingback_heels", "heel"],
  ["lilac_star_platform_sneakers", "sneaker"],
  ["mint_ribbon_court_sneakers", "sneaker"]
])

for (const item of manifest.items) {
  assert.equal(expectedRoles.get(item.slug), item.role, `unexpected role for ${item.slug}`)
  assert.equal(existsSync(resolve(repo, item.runtimeStaticPath)), true, `${item.slug} runtime static is missing`)
  assert.equal(existsSync(resolve(repo, item.profilePath)), true, `${item.slug} profile asset is missing`)
  assert.equal(existsSync(resolve(repo, item.thumbnailPath)), true, `${item.slug} shop thumbnail is missing`)
  assert.equal(item.states.length, states.length, `${item.slug} lacks full 4W+1S coverage`)
  assert.deepEqual(item.states.map((frame) => frame.state), states)
  assert.equal(new Set(item.states.map((frame) => frame.sha256)).size >= 4, true, `${item.slug} motion is not pose-specific`)
  for (const frame of item.states) {
    assert.equal(existsSync(resolve(repo, frame.runtimePath)), true, `${item.slug}/${frame.state} runtime frame is missing`)
    assert.equal(existsSync(resolve(repo, frame.compositePath)), true, `${item.slug}/${frame.state} composite proof is missing`)
    assert.equal(frame.transparentRgbResidue, 0, `${item.slug}/${frame.state} has transparent RGB residue`)
  }
}
