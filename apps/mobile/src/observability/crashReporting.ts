import * as Sentry from "@sentry/react-native"
import { sanitizeCrashEvent, toReportableRouteName, type CrashReportTags } from "./crashPrivacy"
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

/**
 * `context` stays local diagnostics only: `sanitizeCrashEvent` strips all
 * contexts before send. `tags` is the one reportable channel, limited to the
 * boundary scope and an allowlisted root route name.
 */
export function captureAppException(
  error: unknown,
  context?: Record<string, string | undefined>,
  tags?: CrashReportTags
): void {
  if (!BLUMI_SENTRY_DSN) return
  Sentry.withScope((scope) => {
    if (context) scope.setContext("app_error", context)
    if (tags) {
      scope.setTag("boundary", tags.boundary)
      if (tags.route !== undefined) scope.setTag("route", toReportableRouteName(tags.route))
    }
    Sentry.captureException(error)
  })
}

export { Sentry }
