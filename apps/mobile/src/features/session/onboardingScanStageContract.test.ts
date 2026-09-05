import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath, URL } from "node:url"

test("the native handoff and React scan share visible empty cells before characters reveal", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./OnboardingScanStage.tsx", import.meta.url)),
    "utf8"
  )

  assert.match(source, /<View key=\{index\} style=\{styles\.scanCell\}>/)
  assert.match(source, /style=\{\[styles\.scanCharacter, \{ opacity: cellOpacity \}\]\}/)
})

test("the scan sweep uses a crisp layered scanner beam instead of a brush asset", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./OnboardingScanStage.tsx", import.meta.url)),
    "utf8"
  )

  assert.doesNotMatch(source, /blumi_scan_beam_v2\.png/)
  assert.match(source, /blumi_scan_laser_v3\.png/)
  assert.match(source, /const laserPulse = scanSweep\.interpolate/)
  assert.match(source, /<Animated\.Image[\s\S]*style=\{\[styles\.scanLaserImage, \{ opacity: laserPulse \}\]\}/)
  assert.match(source, /style=\{styles\.scanTrail\}/)
  assert.match(source, /style=\{styles\.scanGlow\}/)
  assert.match(source, /style=\{styles\.scanCore\}/)
  assert.match(source, /style=\{styles\.scanSpecular\}/)
  assert.match(source, /style=\{styles\.scanEdgeLeft\}/)
  assert.match(source, /style=\{styles\.scanEdgeRight\}/)
})
