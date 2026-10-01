import { defineRailway, github, project, service } from "railway/iac"

// Supabase is managed outside Railway. Keep DATABASE_URL and every provider
// credential in separate Railway environment variables, never in this file.
export default defineRailway((ctx) => {
  if (ctx.environment !== "staging" && ctx.environment !== "production") {
    throw new Error(`Unsupported Railway environment: ${ctx.environment}`)
  }

  const api = service("blumi-api", {
    source: github("fahrierenaksu-sys/blumi-app", {
      branch: "main",
      checkSuites: true,
    }),
    build: "npm ci --include=dev && npm run build:server",
    start: "npm --workspace @blumi/server run start",
    healthcheck: "/ready",
    healthcheckTimeout: 300,
    deploy: {
      numReplicas: 1,
      sleepApplication: false,
      restartPolicyType: "ALWAYS",
      // Seconds between SIGTERM and SIGKILL. Railway's default of 0 killed
      // the process before the graceful shutdown (30 s deadline in
      // apps/server/src/operations/serviceLifecycle.ts) could close sockets,
      // stop workers and flush the pool. Keep it a little above that deadline.
      drainingSeconds: 35,
    },
    env: {
      NODE_ENV: "production",
      BLUMI_DEPLOY_ENV: ctx.environment,
      BLUMI_AUTH_REPOSITORY: "postgres",
      BLUMI_PUSH_PROVIDER: "expo",
      // Railway's edge reaches the app from rotating internal peers in the
      // CGNAT range; trust only that range so request.ip is the edge-appended
      // client address used by rate limits (verified in staging logs).
      BLUMI_TRUST_PROXY: "100.64.0.0/10",
      REVENUECAT_PURCHASE_ENVIRONMENT:
        ctx.environment === "staging" ? "sandbox" : "production",
    },
  })

  return project("blumi", { resources: [api] })
})
