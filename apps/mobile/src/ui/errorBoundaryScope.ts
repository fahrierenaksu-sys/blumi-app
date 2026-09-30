/**
 * Pure rules for where an error boundary sits (the app root or one navigator
 * route) and what it may report or offer. Kept free of React so the privacy
 * and recovery rules are testable on their own.
 */

import {
  toReportableRouteName,
  type CrashReportTags
} from "../observability/crashPrivacy"

export { toReportableRouteName }

export interface ErrorBoundaryReportInput {
  componentStack: string | undefined
  /** Set only by a route boundary. Route params are never passed here. */
  routeName?: string
}

export interface ErrorBoundaryReport {
  /** Local diagnostics only; crash privacy strips contexts before send. */
  context: Record<string, string | undefined>
  /** The only reported scope data: boundary kind and an allowlisted route. */
  tags: CrashReportTags
}

export function createErrorBoundaryReport(input: ErrorBoundaryReportInput): ErrorBoundaryReport {
  const context = { componentStack: input.componentStack }
  if (input.routeName === undefined) {
    return { context, tags: { boundary: "root" } }
  }
  return {
    context,
    tags: { boundary: "route", route: toReportableRouteName(input.routeName) }
  }
}

export interface ErrorBoundaryActions {
  retry: boolean
  back: boolean
}

export function getErrorBoundaryActions(input: {
  recoveryAttempts: number
  canGoBack: boolean
}): ErrorBoundaryActions {
  return {
    retry: input.recoveryAttempts === 0,
    back: input.canGoBack
  }
}
