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
    },
    env: {
      NODE_ENV: "production",
      BLUMI_DEPLOY_ENV: ctx.environment,
      BLUMI_AUTH_REPOSITORY: "postgres",
      BLUMI_PUSH_PROVIDER: "expo",
      REVENUECAT_PURCHASE_ENVIRONMENT:
        ctx.environment === "staging" ? "sandbox" : "production",
    },
  })

  return project("blumi", { resources: [api] })
})
