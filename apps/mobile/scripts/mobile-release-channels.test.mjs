// Guards the OTA/TestFlight channel split:
//   develop -> OTA to the `preview` channel only, never builds.
//   main    -> OTA to `production` when the native runtime matches an existing
//              production build, otherwise a new production build to TestFlight.
//   manual  -> the preview binary (channel `preview`) to TestFlight.
// It also pins the environment parity that keeps fingerprints (runtime
// versions) identical between a build and the updates published for it.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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
const developWorkflow = readWorkflow("develop-preview-update.yml")
const previewBuildWorkflow = readWorkflow("preview-testflight-build.yml")

const jobsOfType = (workflow, type) => Object.values(workflow.jobs).filter((job) => job.type === type)

test("the app ships expo-updates with a fingerprint runtime and the project's update URL", () => {
  assert.match(readJson("package.json").dependencies["expo-updates"], /^~57\./)
  assert.deepEqual(appConfig.runtimeVersion, { policy: "fingerprint" })
  assert.equal(appConfig.updates.url, `https://u.expo.dev/${appConfig.extra.eas.projectId}`)
})

test("preview and production binaries are store builds on separate channels", () => {
  const { preview, production } = easJson.build
  assert.equal(preview.distribution, "store")
  assert.equal(preview.channel, "preview")
  assert.equal(production.channel, "production")
  assert.notEqual(production.distribution, "internal")
  assert.equal(preview.environment, "production")
  assert.equal(production.environment, "production")
  const withoutProfile = ({ EAS_BUILD_PROFILE, EXPO_PUBLIC_BLUMI_BUILD_PROFILE, ...rest }) => rest
  assert.deepEqual(withoutProfile(preview.env), withoutProfile(production.env), "preview must behave like production apart from its profile name")
})

test("develop publishes only to the preview channel and never builds", () => {
  assert.equal(developWorkflow.on.push, undefined, "develop pushes publish from GitHub Actions")
  assert.ok("workflow_dispatch" in developWorkflow.on)
  assert.equal(jobsOfType(developWorkflow, "build").length, 0)
  assert.equal(jobsOfType(developWorkflow, "testflight").length, 0)
  assert.equal(jobsOfType(developWorkflow, "submit").length, 0)
  const updates = jobsOfType(developWorkflow, "update")
  assert.equal(updates.length, 1)
  assert.equal(updates[0].params.channel, "preview")
  assert.equal(updates[0].params.branch, undefined)
  const lookup = developWorkflow.jobs.get_preview_build
  assert.equal(lookup.params.profile, "preview")
  assert.equal(lookup.params.channel, "preview")
  assert.match(lookup.params.fingerprint_hash, /needs\.fingerprint\.outputs\.ios_fingerprint_hash/)
  assert.match(updates[0].if, /needs\.get_preview_build\.outputs\.build_id/)
  const stop = developWorkflow.jobs.native_build_required
  assert.match(stop.if, /!needs\.get_preview_build\.outputs\.build_id/)
  assert.match(stop.steps.at(-1).run, /exit 1/)
})

test("main builds only on a native change and otherwise updates the production channel", () => {
  assert.deepEqual(mainWorkflow.on.push.branches, ["main"])
  const updates = jobsOfType(mainWorkflow, "update")
  assert.equal(updates.length, 1)
  assert.equal(updates[0].params.channel, "production")
  assert.match(updates[0].if, /needs\.get_production_build\.outputs\.build_id/)
  const builds = jobsOfType(mainWorkflow, "build")
  assert.equal(builds.length, 1)
  assert.equal(builds[0].params.profile, "production")
  assert.match(builds[0].if, /!needs\.get_production_build\.outputs\.build_id/)
  assert.equal(mainWorkflow.jobs.get_production_build.params.channel, "production")
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
  const workflows = [mainWorkflow, developWorkflow, previewBuildWorkflow]
  for (const workflow of workflows) {
    for (const branch of workflow.on.push?.branches ?? []) {
      assert.ok(["main", "develop"].includes(branch), `unexpected push trigger ${branch}`)
    }
  }
})

test("fingerprint and update jobs use exactly the build profile's environment", () => {
  for (const [workflow, profile] of [[mainWorkflow, "production"], [developWorkflow, "preview"]]) {
    const expected = easJson.build[profile].env
    for (const job of [...jobsOfType(workflow, "fingerprint"), ...jobsOfType(workflow, "update")]) {
      assert.equal(job.environment, easJson.build[profile].environment)
      assert.deepEqual(job.env, expected, `${job.name} env must equal build.${profile}.env`)
    }
  }
})

test("production and preview builds run the release checks first; develop OTA stays fast", () => {
  for (const workflow of [mainWorkflow, previewBuildWorkflow]) {
    const script = workflow.jobs.checks.steps.at(-1).run
    for (const command of ["verify:source-hygiene", "typecheck", "lint", "npm test", "audit:release"]) {
      assert.ok(script.includes(command), `checks must run ${command}`)
    }
    const first = workflow.jobs.fingerprint ?? workflow.jobs.build_preview_ios
    assert.deepEqual(first.needs, ["checks"])
  }
  assert.equal(developWorkflow.jobs.checks, undefined, "develop OTA relies on local and GitHub checks")
  assert.equal(developWorkflow.jobs.fingerprint.needs, undefined)
})

test("GitHub Actions publishes develop to the preview channel with the preview build's runtime", () => {
  const workflow = yaml.load(readFileSync(join(mobileRoot, "../../.github/workflows/develop-ota-publish.yml"), "utf8"))
  assert.deepEqual(workflow.on.push.branches, ["develop"])
  const job = workflow.jobs.publish
  assert.deepEqual(job.env, easJson.build.preview.env, "env must equal build.preview.env")
  const script = job.steps.map((step) => step.run ?? "").join("\n").replace(/\\\n\s*/g, "")
  assert.match(script, /eas fingerprint:generate\s+--platform ios\s+--build-profile preview/)
  assert.match(script, /eas build:list\s+--platform ios\s+--channel preview\s+--build-profile preview/)
  assert.match(script, /--fingerprint-hash/)
  assert.match(script, /eas update --channel preview --platform ios --environment production/)
  assert.doesNotMatch(script, /--channel production|eas build(?!:list)|eas submit/)
})
