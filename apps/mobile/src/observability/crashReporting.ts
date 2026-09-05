import * as Sentry from "@sentry/react-native"
import { sanitizeCrashEvent } from "./crashPrivacy"
import {
  BLUMI_BUILD_PROFILE,
  BLUMI_SENTRY_DSN
} from "../config/env"

let initialized = false

export function initializeCrashReporting(): void {
  if (initialized) return
  initialized = true

  Sentry.init({
    dsn: BLUMI_SENTRY_DSN,
    enabled: Boolean(BLUMI_SENTRY_DSN),
    environment: BLUMI_BUILD_PROFILE,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoSessionTracking: true,
    tracesSampleRate: BLUMI_BUILD_PROFILE === "production" ? 0.05 : 0,
    beforeSend(event) {
      return sanitizeCrashEvent(event) as typeof event
    }
  })
}

export function captureAppException(
  error: unknown,
  context?: Record<string, string | undefined>
): void {
  if (!BLUMI_SENTRY_DSN) return
  Sentry.withScope((scope) => {
    if (context) scope.setContext("app_error", context)
    Sentry.captureException(error)
  })
}

export { Sentry }
