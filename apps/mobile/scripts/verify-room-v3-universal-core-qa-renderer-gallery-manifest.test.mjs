import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { test } from "node:test"

const repositoryRoot = path.resolve(import.meta.dirname, "../../..")
const sourceManifest = path.resolve(
  repositoryRoot,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/live-gallery/manifest.json"
)
const generator = path.resolve(
  repositoryRoot,
  "apps/mobile/scripts/create-room-v3-universal-core-qa-renderer-gallery.mjs"
)

test("renderer gallery generator accepts the canonical 45-row manifest", async () => {
  const tempRoot = await mkdtemp(path.join(repositoryRoot, ".tmp-room-v3-gallery-test-"))
  try {
    const validManifest = path.join(tempRoot, "manifest.json")
    const outputPath = path.join(tempRoot, "contact-sheet.png")
    await writeFile(validManifest, await readFile(sourceManifest, "utf8"))
    const result = spawnSync(process.execPath, [generator, validManifest, outputPath], {
      cwd: repositoryRoot,
      encoding: "utf8"
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("renderer gallery generator rejects machine-specific absolute paths", async () => {
  const tempRoot = await mkdtemp(path.join(repositoryRoot, ".tmp-room-v3-gallery-test-"))
  try {
    const manifest = JSON.parse(await readFile(sourceManifest, "utf8"))
    manifest.rows[0].path = path.resolve(repositoryRoot, manifest.rows[0].path)
    const invalidManifest = path.join(tempRoot, "manifest.json")
    const outputPath = path.join(tempRoot, "contact-sheet.png")
    await writeFile(invalidManifest, JSON.stringify(manifest))
    const result = spawnSync(process.execPath, [generator, invalidManifest, outputPath], {
      cwd: repositoryRoot,
      encoding: "utf8"
    })
    assert.notEqual(result.status, 0)
    assert.match(`${result.stderr}${result.stdout}`, /repo-relative path/)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("renderer gallery generator rejects duplicate candidate images", async () => {
  const tempRoot = await mkdtemp(path.join(repositoryRoot, ".tmp-room-v3-gallery-test-"))
  try {
    const manifest = JSON.parse(await readFile(sourceManifest, "utf8"))
    manifest.rows[1].path = manifest.rows[0].path
    const invalidManifest = path.join(tempRoot, "manifest.json")
    const outputPath = path.join(tempRoot, "contact-sheet.png")
    await writeFile(invalidManifest, JSON.stringify(manifest))
    const result = spawnSync(process.execPath, [generator, invalidManifest, outputPath], {
      cwd: repositoryRoot,
      encoding: "utf8"
    })
    assert.notEqual(result.status, 0)
    assert.match(`${result.stderr}${result.stdout}`, /Duplicate renderer image hash/)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
