import "fastify"

declare module "fastify" {
  interface FastifyContextConfig {
    apiAuth?: "bearer" | "public" | "revenuecat-webhook"
    /** Compatibility route excluded from the active API documentation. */
    apiLifecycle?: "legacy-otp"
    /**
     * Required on every route that sets `attachValidation: true`.
     * "enforced": the handler rejects requests whose JSON Schema validation
     * failed (see `schemaValidationFailed`) with its existing input error.
     * "advisory": the schema documents the contract only; the handler's own
     * parser stays authoritative (reason recorded next to the route).
     */
    requestValidation?: "enforced" | "advisory"
  }
}
