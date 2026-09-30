import type { ReactElement } from "react"
import { ErrorBoundary } from "../ui/errorBoundary"

interface RouteLayoutArgs {
  route: { name: string }
  navigation: { canGoBack: () => boolean; goBack: () => void }
  children: ReactElement
}

/**
 * `screenLayout` for the root stack: every route renders inside its own
 * ErrorBoundary, so a render crash replaces only that screen with the
 * localized recovery card. The session, navigator, bottom navigation and
 * global overlays stay mounted, and the app-root boundary remains the last
 * resort. Only `route.name` is handed over; params stay out of reports.
 */
export function renderRouteErrorBoundary({ route, navigation, children }: RouteLayoutArgs): ReactElement {
  return (
    <ErrorBoundary
      routeName={route.name}
      canGoBack={() => navigation.canGoBack()}
      onBack={() => {
        if (navigation.canGoBack()) navigation.goBack()
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
