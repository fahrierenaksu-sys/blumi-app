import assert from "node:assert/strict"
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
  })
}
