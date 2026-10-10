import { isIP } from "node:net"
import type { IncomingMessage } from "node:http"
import proxyAddr from "@fastify/proxy-addr"

/** Opt-in bridge for ingress that supplies X-Real-IP instead of X-Forwarded-For.
 * The immediate TCP peer must be trusted; direct callers cannot choose an IP.
 * The ingress must overwrite this header, verified at deployment. */
export function createTrustedRealIpBridge(addresses: string[]) {
  const trust = proxyAddr.compile(addresses)
  return (request: IncomingMessage): "accepted" | "direct" | "invalid" => {
    const peer = request.socket.remoteAddress
    if (!peer || !trust(peer, 0)) return "direct"
    const real = request.headers["x-real-ip"]
    if (typeof real !== "string" || isIP(real) === 0) return "invalid"
    // Use the ingress's one validated value. A supplied XFF prefix must not
    // override it, and missing metadata must not buy a different identity.
    request.headers["x-forwarded-for"] = real
    return "accepted"
  }
}
