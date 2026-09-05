import "fastify"

declare module "fastify" {
  interface FastifyContextConfig {
    apiAuth?: "bearer" | "public" | "revenuecat-webhook"
  }
}
