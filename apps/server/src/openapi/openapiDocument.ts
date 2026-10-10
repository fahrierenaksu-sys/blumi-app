export const OPENAPI_DOCUMENT_PATH = "/v1/docs/openapi.json"

export type OpenApiAudience = "mobile" | "admin" | "infrastructure" | "legacy"
export type OpenApiScope = "active" | "all" | OpenApiAudience

export interface OpenApiRouteSnapshot {
  method: string | string[]
  url: string
  schema?: unknown
  config?: unknown
}

export interface OpenApiDocument {
  openapi: "3.1.0"
  info: {
    title: string
    version: string
    description: string
  }
  servers: Array<{ url: string }>
  paths: Record<string, Record<string, Record<string, unknown>>>
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http"
        scheme: "bearer"
      }
      adminAuth: {
        type: "http"
        scheme: "bearer"
        bearerFormat: "JWT"
        description: string
      }
      revenueCatWebhookSignature: {
        type: "apiKey"
        in: "header"
        name: "x-revenuecat-webhook-signature"
        description: "RevenueCat HMAC-SHA256 signature in t=<unix-seconds>,v1=<hex-hmac> format."
      }
    }
  }
}

export function createOpenApiDocument(
  routes: readonly OpenApiRouteSnapshot[],
  options: { scope?: OpenApiScope } = {}
): OpenApiDocument {
  const scope = options.scope ?? "active"
  const paths: OpenApiDocument["paths"] = {}

  for (const route of routes) {
    const path = normalizeOpenApiPath(route.url)
    if (path === OPENAPI_DOCUMENT_PATH) continue
    const audience = routeAudience(path, route.config)
    if (scope === "active" ? audience === "legacy" : scope !== "all" && scope !== audience) continue
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    for (const methodValue of methods) {
      const method = methodValue.toLowerCase()
      if (method === "head" || !isOpenApiMethod(method)) continue
      const operation = createOperation(path, method, route.schema, route.config)
      paths[path] ??= {}
      paths[path][method] = operation
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Blumi API",
      version: "1.0.0",
      description: `Blumi runtime API catalog (${scope}). Select scope=mobile, admin, infrastructure, legacy or all to inspect each audience. Legacy OTP routes are retained for compatibility and excluded from the default active catalog.`
    },
    servers: [{ url: "/" }],
    paths: Object.fromEntries(
      Object.entries(paths).sort(([left], [right]) => left.localeCompare(right))
    ),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer"
        },
        adminAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Separate, short-lived operator JWT. Member session tokens do not grant admin access."
        },
        revenueCatWebhookSignature: {
          type: "apiKey",
          in: "header",
          name: "x-revenuecat-webhook-signature",
          description: "RevenueCat HMAC-SHA256 signature in t=<unix-seconds>,v1=<hex-hmac> format."
        }
      }
    }
  }
}

export function normalizeOpenApiPath(url: string): string {
  return url
    .split("?")[0]
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
}

function createOperation(
  path: string,
  method: string,
  routeSchema: unknown,
  routeConfig: unknown
): Record<string, unknown> {
  const schema = asRecord(routeSchema)
  const responseSchemas = asRecord(schema?.response)
  const operation: Record<string, unknown> = {
    operationId: `${method}_${path
      .replace(/[{}]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`,
    tags: [tagForPath(path)],
    summary: `${method.toUpperCase()} ${path}`,
    responses: responseSchemas
      ? createSchemaResponses(responseSchemas)
      : createDefaultResponses()
  }

  const audience = routeAudience(path, routeConfig)
  operation["x-api-audience"] = audience
  if (audience === "legacy") {
    operation.deprecated = true
    operation.description = "Legacy OTP compatibility route. Firebase-enabled servers return 410 FIREBASE_PHONE_AUTH_REQUIRED; use the current Firebase flow."
    operation["x-replaced-by"] = legacyReplacements(path)
    const responses = operation.responses as Record<string, unknown>
    responses["410"] = {
      description: "Legacy OTP flow retired on Firebase-enabled servers. Update Blumi to use Firebase phone verification.",
      content: { "application/json": { schema: {
        type: "object", required: ["code", "error"],
        properties: {
          code: { type: "string", const: "FIREBASE_PHONE_AUTH_REQUIRED" },
          error: { type: "string" }
        }
      } } }
    }
  }

  const authPolicy = resolveRouteAuthPolicy(routeConfig, path)
  if (authPolicy === "bearer") {
    operation.security = [{ bearerAuth: [] }]
  } else if (authPolicy === "admin") {
    operation.security = [{ adminAuth: [] }]
  } else if (authPolicy === "revenuecat-webhook") {
    operation.security = [{ revenueCatWebhookSignature: [] }]
  }

  const paramsSchema = asRecord(schema?.params)
  const paramsProperties = asRecord(paramsSchema?.properties)
  const parameters: Array<Record<string, unknown>> = path
    .match(/\{[^}]+\}/g)
    ?.map((name) => ({
      name: name.slice(1, -1),
      in: "path",
      required: true,
      schema: paramsProperties?.[name.slice(1, -1)] ?? { type: "string" }
    })) ?? []
  const querySchema = asRecord(schema?.querystring)
  const queryProperties = asRecord(querySchema?.properties)
  for (const [name, value] of Object.entries(queryProperties ?? {})) {
    parameters.push({
      name,
      in: "query",
      required: asStringArray(querySchema?.required).includes(name),
      schema: value
    })
  }
  const headersSchema = asRecord(schema?.headers)
  const headerProperties = asRecord(headersSchema?.properties)
  const requiredHeaders = asStringArray(headersSchema?.required)
  for (const [name, value] of Object.entries(headerProperties ?? {})) {
    parameters.push({
      name,
      in: "header",
      required: requiredHeaders.includes(name),
      schema: value
    })
  }
  if (parameters.length > 0) operation.parameters = parameters

  const bodySchema = schema?.body
  if (bodySchema) {
    operation.requestBody = {
      required: true,
      content: {
        "application/json": { schema: bodySchema }
      }
    }
  }

  const config = asRecord(routeConfig)
  const rateLimit = asRecord(config?.rateLimit)
  if (typeof rateLimit?.max === "number" && typeof rateLimit.timeWindow === "string") {
    operation["x-rate-limit"] = {
      max: rateLimit.max,
      timeWindow: rateLimit.timeWindow
    }
  }

  return operation
}

function createDefaultResponses(): Record<string, { description: string }> {
  return {
    "200": { description: "Successful response." },
    "400": { description: "Invalid request." },
    "401": { description: "Authentication required." },
    "500": { description: "Unexpected server error." }
  }
}

function createSchemaResponses(
  responseSchemas: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(responseSchemas).map(([statusCode, responseSchema]) => [
      statusCode,
      {
        description: responseDescription(statusCode),
        content: asRecord(responseSchema)?.content ?? {
          "application/json": { schema: responseSchema }
        }
      }
    ])
  )
}

function responseDescription(statusCode: string): string {
  if (statusCode === "204") return "No content."
  if (statusCode.startsWith("2")) return "Successful response."
  if (statusCode === "400") return "Invalid request."
  if (statusCode === "401") return "Authentication required."
  if (statusCode === "403") return "Not authorized."
  if (statusCode === "404") return "Not found."
  if (statusCode === "409") return "Request conflicts with current state."
  if (statusCode === "429") return "Rate limit exceeded."
  return "Unexpected server error."
}

function resolveRouteAuthPolicy(
  routeConfig: unknown,
  path: string
): "bearer" | "admin" | "public" | "revenuecat-webhook" {
  const configuredPolicy = asRecord(routeConfig)?.apiAuth
  if (
    configuredPolicy === "public" ||
    configuredPolicy === "revenuecat-webhook"
  ) {
    return configuredPolicy
  }
  if (path.startsWith("/v1/admin/")) return "admin"
  if (configuredPolicy === "bearer") return "bearer"
  return path.startsWith("/v1/") ? "bearer" : "public"
}

function routeAudience(path: string, config: unknown): OpenApiAudience {
  if (asRecord(config)?.apiLifecycle === "legacy-otp") return "legacy"
  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/v1/admin/")) return "admin"
  if (!path.startsWith("/v1/") || path.startsWith("/v1/webhooks/")) return "infrastructure"
  return "mobile"
}

function legacyReplacements(path: string): string[] {
  if (path.startsWith("/v1/auth/") || path === "/v1/accounts/register") {
    return ["POST /v1/auth/firebase/complete"]
  }
  if (path === "/v1/account/recovery/challenge") return ["POST /v1/account/recovery/requests"]
  return ["POST /v1/account/firebase/challenge", "POST /v1/account/firebase/reauth"]
}

function tagForPath(path: string): string {
  if (path === "/health") return "system"
  const segments = path.split("/").filter(Boolean)
  return segments[1] ?? "system"
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function isOpenApiMethod(value: string): value is
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options" {
  return ["get", "post", "put", "patch", "delete", "options"].includes(value)
}
