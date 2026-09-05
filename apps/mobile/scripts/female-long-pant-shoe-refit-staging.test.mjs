import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const producer = resolve("apps/mobile/scripts/prepare_female_long_pant_shoe_refit_staging.py")
const metricsPath = resolve(
  "docs/avatar-motion-pipeline/female-long-pant-shoe-refit-staging/2026-07-15/metrics.json"
)

test("three female long pants are staged as complete Static + 4W + 1S authored-source candidates", () => {
  assert.equal(existsSync(producer), true, "long-pant refit producer is required")
  const result = spawnSync("python3", [producer, "--check"], { encoding: "utf8" })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const metrics = JSON.parse(readFileSync(metricsPath, "utf8"))
  assert.equal(metrics.itemCount, 3)
  assert.equal(metrics.liveAssetsUntouched, true)
  assert.equal(metrics.states.length, 6)
  assert.equal(metrics.method, "authored-static-source-plus-bounded-per-leg-pose-layout")
  for (const item of metrics.items) {
    assert.equal(item.frames.length, 6)
    assert.equal(item.allFramesSingleComponent, true, `${item.slug} detached component`)
    assert.equal(item.maxCenterlineDeviation <= 4, true, `${item.slug} centerline`)
    assert.equal(item.minHemY >= 337, true, `${item.slug} short hem`)
    for (const frame of item.frames) {
      const image = PNG.sync.read(readFileSync(resolve(frame.path)))
      for (let offset = 0; offset < image.data.length; offset += 4) {
        const [red, green, blue, alpha] = image.data.subarray(offset, offset + 4)
        assert.equal(
          alpha > 0 && green > red + 48 && green > blue + 48,
          false,
          `${item.slug}/${frame.state} has green chroma fringe`
        )
      }
    }
  }
})

test("candidate manifest and evidence check chain is explicit and stale-sensitive", () => {
  const packageJson = JSON.parse(readFileSync(resolve("apps/mobile/package.json"), "utf8"))
  assert.match(
    packageJson.scripts["test:avatar:promotion:candidate"],
    /--check.*--candidate-manifest|--candidate-manifest.*--check/
  )
  assert.match(packageJson.scripts["test:avatar:promotion:candidate"], /candidate-evidence/)
})
