import type { FastifyInstance } from "fastify"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

const LEGAL_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
const PAGE_PATHS = Object.freeze({
  "/blumi/legal/privacy": "privacy",
  "/blumi/legal/terms": "terms",
  "/blumi/legal/child-safety": "child-safety",
  "/blumi/support": "support",
  "/blumi/legal/delete-account": "delete-account"
})

export async function registerLegalPageRoutes(app: FastifyInstance): Promise<void> {
  for (const [url, name] of Object.entries(PAGE_PATHS)) {
    app.get<{ Querystring: { lang?: string } }>(url, async (request, reply) => {
      const locale = request.query.lang === "en" ? "en" : "tr"
      const file = join(__dirname, "../legal-pages", `${name}-${locale}.html`)
      let html: string
      try {
        html = await readFile(file, "utf8")
      } catch {
        return reply.code(503).send({ error: "Legal page unavailable" })
      }
      return reply
        .header("Content-Security-Policy", LEGAL_PAGE_CSP)
        .header("Cache-Control", "public, max-age=300")
        .header("X-Content-Type-Options", "nosniff")
        .type("text/html; charset=utf-8")
        .send(html)
    })
  }
}
