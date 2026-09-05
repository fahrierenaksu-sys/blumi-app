import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import test from "node:test"

const script = resolve(dirname(fileURLToPath(import.meta.url)), "measure-mobile-bundle.mjs")

test("mobile bundle measurement reports JS, assets, and budget delta", () => {
  const root = mkdtempSync(resolve(tmpdir(), "blumi-bundle-fixture-"))
  const input = resolve(root, "export")
  const baseline = resolve(root, "baseline.json")
  mkdirSync(resolve(input, "_expo/static/js/ios"), { recursive: true })
  mkdirSync(resolve(input, "assets"), { recursive: true })
  writeFileSync(resolve(input, "_expo/static/js/ios/index.hbc"), "12345")
  writeFileSync(resolve(input, "assets/icon"), "12")
  writeFileSync(resolve(input, "metadata.json"), "{}")
  writeFileSync(baseline, JSON.stringify({ totalBytes: 9, maxDeltaBytes: 1 }))

  const result = spawnSync(process.execPath, [script, "--input", input, "--baseline", baseline], {
    encoding: "utf8"
  })

  try {
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.javascriptBytes, 5)
    assert.equal(report.assetBytes, 2)
    assert.equal(report.metadataBytes, 2)
    assert.equal(report.totalBytes, 9)
    assert.equal(report.deltaBytes, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
