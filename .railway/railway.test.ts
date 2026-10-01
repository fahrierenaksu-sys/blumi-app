import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createRailwayContext, type ServiceNode } from "railway/iac"
import { GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "../apps/server/src/operations/serviceLifecycle"
import configuration from "./railway"

for (const environment of ["staging", "production"] as const) {
  test(`${environment} keeps the API awake and gates deployment on CI and readiness`, async () => {
    const graph = await configuration(createRailwayContext({
      environment,
      projectName: "blumi",
    }), () => { throw new Error("Project helper should not be called") })
    const api = graph.resources?.find((resource): resource is ServiceNode =>
      "type" in resource && resource.type === "service" && resource.name === "blumi-api")
    assert.ok(api)
    assert.equal(api.source?.repo, "fahrierenaksu-sys/blumi-app")
    assert.equal(api.source?.checkSuites, true)
    assert.equal(api.deploy.sleepApplication, false)
    assert.equal(api.deploy.healthcheckPath, "/ready")
    assert.equal(api.deploy.numReplicas, 1)
    // After SIGTERM Railway must wait longer than the server's graceful
    // shutdown deadline, or it kills the process before it drains.
    assert.equal(api.deploy.drainingSeconds, 35)
    assert.ok((api.deploy.drainingSeconds ?? 0) * 1000 > GRACEFUL_SHUTDOWN_TIMEOUT_MS)
    assert.deepEqual(api.variables.NODE_ENV, { type: "literal", value: "production" })
    assert.deepEqual(api.variables.BLUMI_DEPLOY_ENV, { type: "literal", value: environment })
    assert.deepEqual(api.variables.REVENUECAT_PURCHASE_ENVIRONMENT, {
      type: "literal", value: environment === "staging" ? "sandbox" : "production",
    })
    assert.deepEqual(api.variables.BLUMI_TRUST_PROXY, { type: "literal", value: "100.64.0.0/10" })
    assert.equal(api.variables.DATABASE_URL, undefined)
    // Railpack reads RAILPACK_NODE_VERSION before engines and .nvmrc; an
    // exact pin keeps the deployed runtime equal to the verified one.
    assert.deepEqual(api.variables.RAILPACK_NODE_VERSION, { type: "literal", value: pinnedNodeVersion })
  })
}

const repositoryFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const pinnedNodeVersion = repositoryFile(".nvmrc").trim()

test("one Node version is pinned for local, CI, OTA publish and Railway", () => {
  assert.match(pinnedNodeVersion, /^22\.\d+\.\d+$/)
  // Node 22.23.2 (2026-07-28) is the newest 22.x security release; never pin below it.
  const [, minor, patch] = pinnedNodeVersion.split(".").map(Number)
  assert.ok(minor > 23 || (minor === 23 && patch >= 2), `Node ${pinnedNodeVersion} predates the 22.23.2 security release`)
  const engines = JSON.parse(repositoryFile("package.json")).engines.node
  assert.equal(engines, `>=${pinnedNodeVersion} <23`)
  for (const workflow of [".github/workflows/verify.yml", ".github/workflows/develop-ota-publish.yml"]) {
    const source = repositoryFile(workflow)
    assert.match(source, /node-version-file: \.nvmrc/, workflow)
    assert.doesNotMatch(source, /node-version: /, workflow)
  }
})
