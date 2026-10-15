import { type ComponentType } from "react"

/**
 * A screen whose module loads on its first render (or an earlier preload).
 * `Props` are the real screen's props, so every route that renders the
 * deferred screen is type checked exactly like the screen itself.
 */
export interface DeferredScreenBundle<Props extends object> {
  DeferredScreen: ComponentType<Props>
  preload: () => ComponentType<Props>
}

export function createDeferredScreen<Props extends object>(
  loader: () => ComponentType<Props>
): DeferredScreenBundle<Props> {
  let cachedComponent: ComponentType<Props> | null = null

  const preload = (): ComponentType<Props> => {
    if (!cachedComponent) cachedComponent = loader()
    return cachedComponent
  }

  function DeferredScreen(props: Props) {
    // Resolve synchronously on the route's first render. The previous
    // effect-driven resolution painted a generic fallback for one or more
    // frames, then replaced it with the real screen after the module loaded;
    // that was the visible jump after Whoa -> profile.
    const Component = preload()
    return <Component {...props} />
  }

  return { DeferredScreen, preload }
}
