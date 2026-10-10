// Guards the release workflows. The app has no OTA updates (owner decision 2026-10-08,
// ported to develop 2026-10-10): every JavaScript change ships in a new binary.
//   main   -> a production build, uploaded to TestFlight (started by hand).
//   manual -> the preview binary to TestFlight.
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(join(mobileRoot, "package.json"))
let yaml
try {
  yaml = require("js-yaml")
} catch {
  throw new Error("js-yaml (installed with ESLint) is required to read the EAS workflows")
}

const readJson = (path) => JSON.parse(readFileSync(join(mobileRoot, path), "utf8"))
const readWorkflow = (name) => yaml.load(readFileSync(join(mobileRoot, ".eas/workflows", name), "utf8"))
const appConfig = readJson("app.json").expo
const easJson = readJson("eas.json")
const mainWorkflow = readWorkflow("testflight.yml")
const previewBuildWorkflow = readWorkflow("preview-testflight-build.yml")

const jobsOfType = (workflow, type) => Object.values(workflow.jobs).filter((job) => job.type === type)

test("the app has no OTA updates: no expo-updates, no update config, no update jobs", () => {
  const pkg = readJson("package.json")
  assert.equal(pkg.dependencies["expo-updates"], undefined)
  assert.equal(appConfig.updates, undefined)
  assert.equal(appConfig.runtimeVersion, undefined)
  for (const [profile, build] of Object.entries(easJson.build)) {
    assert.equal(build.channel, undefined, `eas.json build.${profile} sets an update channel`)
  }
  for (const name of readdirSync(join(mobileRoot, ".eas/workflows")).filter((file) => file.endsWith(".yml"))) {
    const workflow = readWorkflow(name)
    assert.equal(jobsOfType(workflow, "update").length, 0, `${name} publishes an update`)
  }
})

test("preview and production binaries are store builds that behave the same", () => {
  const { preview, production } = easJson.build
  assert.equal(preview.distribution, "store")
  assert.notEqual(production.distribution, "internal")
  assert.equal(preview.environment, "production")
  assert.equal(production.environment, "production")
  const withoutProfile = ({ EAS_BUILD_PROFILE, EXPO_PUBLIC_BLUMI_BUILD_PROFILE, ...rest }) => rest
  assert.deepEqual(withoutProfile(preview.env), withoutProfile(production.env), "preview must behave like production apart from its profile name")
})

test("main builds a production binary by hand only and uploads that build", () => {
  // Manual only: a push to main must not start a build or an upload.
  assert.equal(mainWorkflow.on.push, undefined)
  assert.deepEqual(Object.keys(mainWorkflow.on), ["workflow_dispatch"])
  const builds = jobsOfType(mainWorkflow, "build")
  assert.equal(builds.length, 1)
  assert.equal(builds[0].params.profile, "production")
  const upload = jobsOfType(mainWorkflow, "submit")
  assert.equal(upload.length, 1)
  assert.equal(upload[0].params.profile, "production")
  assert.deepEqual(upload[0].needs, ["build_ios"])
})

test("the preview binary is built only on demand and uploaded with the preview profile", () => {
  assert.equal(previewBuildWorkflow.on.push, undefined)
  assert.ok("workflow_dispatch" in previewBuildWorkflow.on)
  assert.equal(jobsOfType(previewBuildWorkflow, "build")[0].params.profile, "preview")
  const upload = jobsOfType(previewBuildWorkflow, "submit")
  assert.equal(upload.length, 1)
  assert.equal(upload[0].params.profile, "preview")
  assert.equal(easJson.submit.preview.extends, "production")
  assert.ok(easJson.submit.production.ios.ascAppId, "submit.production needs the App Store Connect app id")
})

test("no workflow builds on pushes to the working branch", () => {
  for (const workflow of [mainWorkflow, previewBuildWorkflow]) {
    for (const branch of workflow.on.push?.branches ?? []) {
      assert.ok(["main", "develop"].includes(branch), `unexpected push trigger ${branch}`)
    }
  }
})

test("production and preview builds run the release checks first", () => {
  for (const workflow of [mainWorkflow, previewBuildWorkflow]) {
    const script = workflow.jobs.checks.steps.at(-1).run
    for (const command of ["verify:source-hygiene", "typecheck", "lint", "npm test", "audit:release"]) {
      assert.ok(script.includes(command), `checks must run ${command}`)
    }
    const first = workflow.jobs.build_ios ?? workflow.jobs.build_preview_ios
    assert.deepEqual(first.needs, ["checks"])
  }
})
