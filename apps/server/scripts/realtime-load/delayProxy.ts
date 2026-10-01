/**
 * Local TCP proxy that adds a fixed one-way delay in each direction, so a
 * loopback PostgreSQL behaves like a database `2 × delay` milliseconds away.
 * Chunk order is preserved because equal-delay timers fire in order. Runs in
 * a worker thread so its timers do not share the measured server's loop.
 */
import { createConnection, createServer, type Socket } from "node:net"
import { parentPort, workerData } from "node:worker_threads"

interface DelayProxyOptions {
  listenPort: number
  targetHost: string
  targetPort: number
  oneWayDelayMs: number
}

const options = workerData as DelayProxyOptions

function pipeWithDelay(from: Socket, to: Socket, delayMs: number): void {
  from.on("data", (chunk) => {
    if (delayMs <= 0) {
      to.write(chunk)
      return
    }
    setTimeout(() => { if (!to.destroyed) to.write(chunk) }, delayMs)
  })
  from.on("end", () => setTimeout(() => to.end(), delayMs))
  from.on("error", () => to.destroy())
}

const server = createServer((client) => {
  client.setNoDelay(true)
  const upstream = createConnection({ host: options.targetHost, port: options.targetPort })
  upstream.setNoDelay(true)
  pipeWithDelay(client, upstream, options.oneWayDelayMs)
  pipeWithDelay(upstream, client, options.oneWayDelayMs)
  client.on("close", () => upstream.destroy())
  upstream.on("close", () => client.destroy())
})

server.listen(options.listenPort, "127.0.0.1", () => {
  parentPort?.postMessage({ type: "ready" })
})

parentPort?.on("message", (message: { type: string }) => {
  if (message.type === "stop") server.close(() => process.exit(0))
})
