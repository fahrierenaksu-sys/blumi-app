import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
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

function resolveThroughMetroConfig(env) {
  const script = [
    "const config = require('./metro.config.js')",
    "const fallback = { resolveRequest: () => ({ type: 'fallback' }) }",
    "const resolved = config.resolver.resolveRequest(fallback, '@blumi/home-studio-qa', 'ios')",
    "process.stdout.write(JSON.stringify({ resolved, directory: config.resolver.extraNodeModules['@blumi/home-studio-qa'] }))"
  ].join(";")
  return JSON.parse(execFileSync(process.execPath, ["-e", script], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    encoding: "utf8"
  }))
}

test("the real Metro config routes Home Studio to the stub in release-like builds", () => {
  for (const buildProfile of ["production", "preview"]) {
    const { resolved, directory } = resolveThroughMetroConfig({
      EXPO_PUBLIC_BLUMI_BUILD_PROFILE: buildProfile,
      EXPO_PUBLIC_BLUMI_HOME_STUDIO_QA: "1"
    })
    assert.deepEqual(resolved, {
      type: "sourceFile",
      filePath: resolve(projectRoot, "src/features/roomStudio/homeStudioQaStub.tsx")
    }, buildProfile)
    assert.equal(directory, resolve(projectRoot, "src/features/roomStudio/homeStudioQaStubModule"), buildProfile)
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
