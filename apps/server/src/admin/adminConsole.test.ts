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
    assert.match(page.body, /--scopes=metrics:read --ttl=600/)
    assert.doesNotMatch(page.body, /--scopes=metrics:read,users:read,users:manage/)
    assert.match(page.headers["content-security-policy"] ?? "", /frame-ancestors 'none'/)
    assert.equal(page.headers["cache-control"], "no-store")

    const script = await app.inject({ method: "GET", url: "/admin/console.js" })
    assert.equal(script.statusCode, 200)
    new Script(script.body, { filename: "admin-console.js" })
    assert.doesNotMatch(script.body, /\.innerHTML|insertAdjacentHTML|document\.write/)

    const styles = await app.inject({ method: "GET", url: "/admin/reports.css" })
    assert.equal(styles.statusCode, 200)
    assert.equal(styles.headers["cache-control"], "no-store")
    const analyticsStyles = await app.inject({ method: "GET", url: "/admin/analytics.css" })
    assert.equal(analyticsStyles.statusCode, 200)
  } finally {
    await app.close()
  }
})
