import {
  LogController,
  type FastifyReply,
  type FastifyRequest
} from "fastify"

/**
 * Request logging without private data (2026-10-01). Fastify's default lines
 * wrote the raw URL (user, thread and room ids, cursors), the host and the
 * client IP on every request. These lines carry the route template, method,
 * status and response time only. Request ids stay (random per request).
 */
export class PrivateRequestLogController extends LogController {
  override incomingRequest(): void {
    // One line per request is enough; it is written on completion.
  }

  override requestCompleted(
    error: Error | null | undefined,
    request: FastifyRequest,
    reply: FastifyReply
  ): void {
    if (this.isLogDisabled(request)) return
    const line = {
      method: request.method,
      route: routeTemplate(request),
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(reply.elapsedTime)
    }
    if (error) reply.log.error({ ...line, errorKind: error.name }, "request completed")
    else reply.log.info(line, "request completed")
  }

  override defaultErrorLog(_error: Error, request: FastifyRequest, reply: FastifyReply): void {
    if (this.isLogDisabled(request) || reply.statusCode < 500) return
    reply.log.error({ method: request.method, route: routeTemplate(request) }, "request failed")
  }

  override routeNotFound(): void {
    // The completion line records the 404 under the "unmatched" route.
  }

  override writeHeadError(error: Error, request: FastifyRequest, reply: FastifyReply): void {
    if (this.isLogDisabled(request)) return
    reply.log.warn({ route: routeTemplate(request), errorKind: error.name }, "response head failed")
  }
}

/** Defense in depth for any log call that passes `req` or `res`. */
export const privateLogSerializers = {
  req: (request: LoggedRequest) => ({ method: request.method, route: routeTemplate(request) }),
  res: (reply: { statusCode?: number }) => ({ statusCode: reply.statusCode })
}

interface LoggedRequest { method?: string; routeOptions?: { url?: string } }

function routeTemplate(request: LoggedRequest): string {
  return request.routeOptions?.url ?? "unmatched"
}
