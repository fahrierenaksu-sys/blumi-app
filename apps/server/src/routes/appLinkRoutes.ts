import type { FastifyInstance } from "fastify"

export interface AppLinkConfig {
  appleAppId: string
  androidPackageName: string
  androidSha256CertFingerprints: string[]
}

export async function registerAppLinkRoutes(
  app: FastifyInstance,
  config: AppLinkConfig
): Promise<void> {
  app.get("/.well-known/apple-app-site-association", async (_request, reply) => {
    return reply
      .header("content-type", "application/json")
      .header("cache-control", "public, max-age=3600")
      .send({
        applinks: {
          apps: [],
          details: [{
            appID: config.appleAppId,
            components: [{ "/": "/*" }]
          }]
        }
      })
  })

  app.get("/.well-known/assetlinks.json", async (_request, reply) => {
    return reply
      .header("content-type", "application/json")
      .header("cache-control", "public, max-age=3600")
      .send([{
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: config.androidPackageName,
          sha256_cert_fingerprints: [...config.androidSha256CertFingerprints]
        }
      }])
  })
}
