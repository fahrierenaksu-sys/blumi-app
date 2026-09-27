import assert from "node:assert/strict"
import test from "node:test"
import { createRailwayContext, type ServiceNode } from "railway/iac"
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
    assert.deepEqual(api.variables.NODE_ENV, { type: "literal", value: "production" })
    assert.deepEqual(api.variables.BLUMI_DEPLOY_ENV, { type: "literal", value: environment })
    assert.deepEqual(api.variables.REVENUECAT_PURCHASE_ENVIRONMENT, {
      type: "literal", value: environment === "staging" ? "sandbox" : "production",
    })
    assert.equal(api.variables.DATABASE_URL, undefined)
  })
}
