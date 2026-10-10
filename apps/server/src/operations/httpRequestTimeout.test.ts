import assert from "node:assert/strict"
import { createConnection, type Socket } from "node:net"
import test from "node:test"
import { createServer } from "../server"

test("an incomplete HTTP body cannot retain an idle connection indefinitely", { timeout: 40_000 }, async () => {
  const app = createServer()
  let socket: Socket | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    assert.ok(app.server.requestTimeout > 0 && app.server.requestTimeout <= 30_000,
      "receiving a request has a finite deadline even when the client keeps trickling bytes")
    assert.ok(app.server.timeout > 0 && app.server.timeout <= 10_000,
      "an idle request socket is bounded")
    await app.listen({ port: 0, host: "127.0.0.1" })
    const address = app.server.address()
    assert.ok(address && typeof address !== "string")
    socket = createConnection({ host: "127.0.0.1", port: address.port })
    const peer = socket
    const closed = new Promise<void>((resolve) => peer.once("close", () => resolve()))
    // Reset and close both mean the server released the incomplete request.
    peer.on("error", () => undefined)
    await new Promise<void>((resolve, reject) => {
      peer.once("connect", resolve)
      peer.once("error", reject)
    })
    peer.write("POST /v1/auth/firebase HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 128\r\n\r\n{")
    await Promise.race([
      closed,
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("Incomplete HTTP request retained its socket beyond the idle deadline")),
          app.server.timeout + 2_000)
      })
    ])
    assert.equal(peer.destroyed, true)
  } finally {
    if (deadline) clearTimeout(deadline)
    socket?.destroy()
    await app.close()
  }
})
