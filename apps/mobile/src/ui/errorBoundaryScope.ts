/**
 * Pure rules for where an error boundary sits (the app root or one navigator
 * route) and what it may report or offer. Kept free of React so the privacy
 * and recovery rules are testable on their own.
 */

const REPORTABLE_ROUTE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

/** Route names are code identifiers; anything else is withheld as "unknown". */
export function toReportableRouteName(routeName: string): string {
  return REPORTABLE_ROUTE_NAME.test(routeName) ? routeName : "unknown"
}

export interface ErrorBoundaryReportInput {
  componentStack: string | undefined
  /** Set only by a route boundary. Route params are never passed here. */
  routeName?: string
}

export function createErrorBoundaryReportContext(
  input: ErrorBoundaryReportInput
): Record<string, string | undefined> {
  if (input.routeName === undefined) {
    return { componentStack: input.componentStack }
  }
  return {
    componentStack: input.componentStack,
    boundary: "route",
    route: toReportableRouteName(input.routeName)
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
