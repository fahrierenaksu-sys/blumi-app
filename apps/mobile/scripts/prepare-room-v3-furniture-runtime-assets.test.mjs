import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const testPath = fileURLToPath(import.meta.url)
const scriptDirectory = dirname(testPath)
const prepareScriptPath = join(
  scriptDirectory,
  "prepare-room-v3-furniture-runtime-assets.mjs"
)
const fixturePath = resolve(
  scriptDirectory,
  "../src/features/roomV2/assets/runtime/candidates/universal_table_lamp_a/universal_table_lamp_a_front_pilot_v1.png"
)

function runNode(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(process.execPath, args, (error, stdout, stderr) => {
      if (error) {
        rejectPromise(new Error(`${error.message}\n${stdout}\n${stderr}`))
        return
      }
      resolvePromise({ stdout, stderr })
    })
  })
}

test("runtime preparation can target one surface asset direction", async () => {
  const tempDirectory = await mkdtemp(join("/tmp", "blumi-runtime-prep-"))
  try {
    const candidateId = basename(tempDirectory)
    await copyFile(
      fixturePath,
      join(tempDirectory, `${candidateId}_front_pilot_v1.png`)
    )

    await runNode([prepareScriptPath, tempDirectory, "front"])
    await stat(join(tempDirectory, `${candidateId}_front_runtime_v2.png`))
    await assert.rejects(
      () => runNode([prepareScriptPath, tempDirectory, "diagonal"]),
      /Unknown direction: diagonal/
    )
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
})
