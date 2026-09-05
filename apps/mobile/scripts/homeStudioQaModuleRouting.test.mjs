import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import test from "node:test"

const require = createRequire(import.meta.url)
const {
  resolveHomeStudioQaModuleDirectory,
  resolveHomeStudioQaModulePath
} = require("./homeStudioQaModuleRouting.cjs")
const projectRoot = resolve(import.meta.dirname, "..")

test("production and preview builds resolve Home Studio to a no-op stub", () => {
  for (const buildProfile of ["production", "preview"]) {
    assert.equal(
      resolveHomeStudioQaModulePath({
        projectRoot,
        rawQaFlag: "1",
        buildProfile
      }),
      resolve(projectRoot, "src/features/roomStudio/homeStudioQaStub.tsx")
    )
    assert.equal(
      resolveHomeStudioQaModuleDirectory({
        projectRoot,
        rawQaFlag: "1",
        buildProfile
      }),
      resolve(projectRoot, "src/features/roomStudio/homeStudioQaStubModule")
    )
  }
})

test("development and native-ui-test builds resolve the QA screen only with the exact flag", () => {
  for (const buildProfile of ["development", "native-ui-test"]) {
    assert.equal(
      resolveHomeStudioQaModulePath({
        projectRoot,
        rawQaFlag: "1",
        buildProfile
      }),
      resolve(projectRoot, "src/screens/HomeStudioScreen.tsx")
    )
    assert.equal(
      resolveHomeStudioQaModuleDirectory({
        projectRoot,
        rawQaFlag: "1",
        buildProfile
      }),
      resolve(projectRoot, "src/features/roomStudio/homeStudioQaLiveModule")
    )
    assert.equal(
      resolveHomeStudioQaModulePath({
        projectRoot,
        rawQaFlag: "0",
        buildProfile
      }),
      resolve(projectRoot, "src/features/roomStudio/homeStudioQaStub.tsx")
    )
    assert.equal(
      resolveHomeStudioQaModuleDirectory({
        projectRoot,
        rawQaFlag: "0",
        buildProfile
      }),
      resolve(projectRoot, "src/features/roomStudio/homeStudioQaStubModule")
    )
  }
})
