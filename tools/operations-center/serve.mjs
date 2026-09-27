import { spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const directory = dirname(fileURLToPath(import.meta.url))
const repository = resolve(directory, "../..")
const builderPath = resolve(directory, "build.mjs")
const dashboardPath = resolve(directory, "dist/index.html")
const requestedPort = process.env.BLUMI_OPS_CENTER_PORT
const hasRequestedPort = requestedPort !== undefined && requestedPort !== ""

if (hasRequestedPort && (!/^\d+$/.test(requestedPort) || Number(requestedPort) > 65535)) {
  throw new Error("BLUMI_OPS_CENTER_PORT must be an integer between 0 and 65535.")
}

const initialPort = hasRequestedPort ? Number(requestedPort) : 8765
let currentPort = initialPort

const server = createServer(async (request, response) => {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { ...headers, Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" })
    response.end(request.method === "HEAD" ? undefined : "Method not allowed")
    return
  }

  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname
  if (pathname !== "/" && pathname !== "/index.html") {
    response.writeHead(404, { ...headers, "Content-Type": "text/plain; charset=utf-8" })
    response.end(request.method === "HEAD" ? undefined : "Not found")
    return
  }

  try {
    const build = spawnSync(process.execPath, [builderPath], {
      cwd: repository,
      encoding: "utf8",
      timeout: 10000
    })
    if (build.error || build.status !== 0) throw new Error("Dashboard snapshot could not be refreshed.")
    const html = await readFile(dashboardPath)
    response.writeHead(200, { ...headers, "Content-Type": "text/html; charset=utf-8" })
    response.end(request.method === "HEAD" ? undefined : html)
  } catch {
    response.writeHead(503, { ...headers, "Content-Type": "text/plain; charset=utf-8" })
    response.end(request.method === "HEAD" ? undefined : "Build the Operations Center before opening it.")
  }
})

server.on("error", (error) => {
  if (!hasRequestedPort && error.code === "EADDRINUSE" && currentPort < initialPort + 20) {
    currentPort += 1
    server.listen(currentPort, "127.0.0.1")
    return
  }

  process.stderr.write(`Blumi Operasyon Merkezi başlatılamadı: ${error.message}\n`)
  process.exitCode = 1
})

server.on("listening", () => {
  const address = server.address()
  if (!address || typeof address === "string") return
  process.stdout.write(`Blumi Operasyon Merkezi: http://127.0.0.1:${address.port}/\n`)
  process.stdout.write("Yalnızca bu bilgisayarda erişilebilir. Kapatmak için Ctrl+C.\n")
})

server.listen(initialPort, "127.0.0.1")
