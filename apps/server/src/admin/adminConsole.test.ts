import assert from "node:assert/strict"
import test from "node:test"
import Fastify from "fastify"
import { Script } from "node:vm"
import { registerAdminConsoleRoutes } from "./adminConsole"

test("admin console provides a scoped safety queue without unsafe HTML sinks", async () => {
  const app = Fastify()
  await registerAdminConsoleRoutes(app)
  try {
    const page = await app.inject({ method: "GET", url: "/admin" })
    assert.equal(page.statusCode, 200)
    assert.match(page.body, /id="reports-tab"/)
    assert.match(page.body, /id="report-results"/)
    assert.match(page.body, /reports\.css/)
    assert.match(page.body, /id="overview-workspace"/)
    assert.match(page.body, /id="analysis-workspace"/)
    assert.match(page.body, /--scopes=metrics:read --ttl=600/)
    assert.doesNotMatch(page.body, /--scopes=metrics:read,users:read,users:manage/)
    assert.match(page.headers["content-security-policy"] ?? "", /frame-ancestors 'none'/)
    assert.equal(page.headers["cache-control"], "no-store")

    const script = await app.inject({ method: "GET", url: "/admin/console.js" })
    assert.equal(script.statusCode, 200)
    assert.match(script.body, /reports:read/)
    assert.match(script.body, /metrics:read/)
    new Script(script.body, { filename: "admin-console.js" })
    assert.match(script.body, /reports:resolve/)
    assert.match(script.body, /\/v1\/admin\/reports\?status=/)
    assert.match(script.body, /if \(currentArea === "reports"\) void loadReports\(\)/)
    assert.match(script.body, /activityUpdatedAt/)
    assert.match(script.body, /safetyUpdatedAt/)
    assert.match(script.body, /önceki sayılar güncel kabul edilmemeli/)
    assert.match(script.body, /\/v1\/admin\/reports\/" \+ encodeURIComponent\(report\.reportId\) \+ "\/resolve/)
    assert.match(script.body, /\.textContent/)
    assert.doesNotMatch(script.body, /\.innerHTML|insertAdjacentHTML|document\.write/)

    const styles = await app.inject({ method: "GET", url: "/admin/reports.css" })
    assert.equal(styles.statusCode, 200)
    assert.match(styles.body, /@media\(max-width:820px\)/)
    assert.equal(styles.headers["cache-control"], "no-store")
    const analyticsStyles = await app.inject({ method: "GET", url: "/admin/analytics.css" })
    assert.equal(analyticsStyles.statusCode, 200)
    assert.match(analyticsStyles.body, /analytics-kpis/)
  } finally {
    await app.close()
  }
})
