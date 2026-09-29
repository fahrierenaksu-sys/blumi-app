import { getBottomNavKeyForRoute, getBottomNavRoutePresentation } from "./rootNavigationModel"

export interface BottomNavReturnPreview {
  sourceRouteKey: string
  targetRouteKey: string
  targetRouteName: string
  completed?: boolean
}

export function resolveBottomNavReturnPreview(input: {
  platform: "ios" | "android"
  closing: boolean
  sourceRouteKey: string
  stack: { index: number; routes: readonly { key: string; name: string }[] } | undefined
}): BottomNavReturnPreview | undefined {
  if (input.platform !== "ios" || !input.closing) return undefined
  const { stack } = input
  if (!stack || stack.index < 1) return undefined
  const source = stack.routes[stack.index]
  const target = stack.routes[stack.index - 1]
  if (!source || !target || source.key !== input.sourceRouteKey ||
    getBottomNavKeyForRoute(source.name) !== null || getBottomNavKeyForRoute(target.name) === null) return undefined
  return { sourceRouteKey: source.key, targetRouteKey: target.key, targetRouteName: target.name }
}

export function retainBottomNavReturnPreview(preview: BottomNavReturnPreview | undefined, routeKey: string | undefined): BottomNavReturnPreview | undefined {
  if (preview?.completed && routeKey === preview.targetRouteKey) return undefined
  return preview && (routeKey === preview.sourceRouteKey || routeKey === preview.targetRouteKey) ? preview : undefined
}

export function getBottomNavReturnPresentation(routeName: string | undefined, routeKey: string | undefined, preview: BottomNavReturnPreview | undefined) {
  const currentPreview = retainBottomNavReturnPreview(preview, routeKey)
  const presentation = getBottomNavRoutePresentation(currentPreview?.targetRouteName ?? routeName)
  return { ...presentation, visualOnly: currentPreview !== undefined }
}
