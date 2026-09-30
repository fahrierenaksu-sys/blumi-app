import { NavigationContext, NavigationRouteContext } from "@react-navigation/native"
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"
import {
  AppState,
  BackHandler,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent
} from "react-native"
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler"
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated"
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets"
import type { BottomNavKey } from "../../ui/bottomNav"
import { useReducedMotion } from "../../ui/animations"
import { ErrorBoundary } from "../../ui/errorBoundary"
import { uiTheme } from "../../ui/theme"
import {
  MAIN_TAB_PAGER_ACTIVE_OFFSET_X,
  MAIN_TAB_PAGER_FAIL_OFFSET_Y,
  MAIN_TAB_PAGER_NEIGHBOUR_MOUNT_DELAY_MS,
  MAIN_TAB_PAGER_SPRING,
  MAIN_TAB_PAGES,
  type MainTabRouteName
} from "./mainTabPagerConfig"
import { registerMainTabPagerController } from "./mainTabPagerController"
import { MainTabPagerGestureProvider } from "../../ui/MainTabPagerGestureOwnership"
import {
  createMainTabPageFocusHub,
  createMainTabPageNavigation,
  type MainTabPageFocusHub
} from "./mainTabPageFocus"
import {
  areMainTabPagerMountedPagesEqual,
  createMainTabPagerUiState,
  getMainTabPageAccessibility,
  getMainTabPageIndex,
  getMainTabPageOpacity,
  isMainTabPageSwipeable,
  reduceMainTabPagerRouteSync,
  reduceMainTabPagerSettled,
  reduceMainTabPagerSettleToCommitted,
  reduceMainTabPagerTap,
  resolveMainTabPagerBaseIndex,
  resolveMainTabPagerCommitRoute,
  resolveMainTabPagerDragPosition,
  resolveMainTabPagerMountedPages,
  resolveMainTabPagerSettleIndex,
  resolveMainTabPagerSettleVelocity,
  type MainTabPagerUiTransition
} from "./mainTabPagerModel"
import { createMainTabPagerSelectAction } from "./mainTabPagerRouter"

interface SlotRoute {
  key: string
  name: string
  params?: object
}

interface SlotNavigation {
  isFocused: () => boolean
  addListener: (type: never, listener: never) => () => void
  setParams: (params: never) => void
  dispatch: (action: never) => void
  getState: () => { key: string; routes: readonly { key: string; name: string }[] }
}

/** The page receives the shapes a native-stack screen receives, scoped to that page. */
export interface MainTabPageProps {
  navigation: unknown
  route: unknown
}

export interface MainTabPagerProps {
  navigation: unknown
  route: SlotRoute
  renderPage: (routeName: MainTabRouteName, props: MainTabPageProps) => ReactNode
}

function scheduleIdle(work: () => void): () => void {
  let idleId: number | null = null
  const timeoutId = setTimeout(() => {
    if (typeof globalThis.requestIdleCallback === "function") {
      idleId = globalThis.requestIdleCallback(() => work())
    } else {
      work()
    }
  }, MAIN_TAB_PAGER_NEIGHBOUR_MOUNT_DELAY_MS)
  return () => {
    clearTimeout(timeoutId)
    if (idleId !== null && typeof globalThis.cancelIdleCallback === "function") {
      globalThis.cancelIdleCallback(idleId)
    }
  }
}

/**
 * Hosts the four main pages in one native-stack slot route and moves between
 * them with the finger. The slot route name is the only selected-page state:
 * bottom-bar taps and swipes both commit through the router's select action,
 * the UI thread follows the route, and the route changes once per settle.
 * Every frame of a drag or settle runs on the UI thread with shared values.
 */
export function MainTabPager({ navigation: rawNavigation, route, renderPage }: MainTabPagerProps) {
  const navigation = rawNavigation as SlotNavigation
  const selectedIndex = Math.max(0, getMainTabPageIndex(route.name))
  const selectedPage = MAIN_TAB_PAGES[selectedIndex]!
  const swipeEnabled = selectedPage.swipeable
  const reduceMotion = useReducedMotion()
  const { width: windowWidth } = useWindowDimensions()

  // Remembered params per page: the slot route carries the selected page's
  // params; the others keep the params they had when last selected.
  const pageParamsRef = useRef<Partial<Record<MainTabRouteName, object | undefined>>>({})
  pageParamsRef.current[selectedPage.routeName] = route.params
  const selectedRouteNameRef = useRef(selectedPage.routeName)
  selectedRouteNameRef.current = selectedPage.routeName
  const slotKeyRef = useRef(route.key)
  slotKeyRef.current = route.key
  const [, setLocalParamsVersion] = useState(0)

  // ── Mount policy ────────────────────────────────────────────────────
  const [mountedState, setMountedState] = useState<boolean[]>(() =>
    resolveMainTabPagerMountedPages({ mounted: [], selectedIndex, includeNeighbours: false })
  )
  const mounted = resolveMainTabPagerMountedPages({
    mounted: mountedState,
    selectedIndex,
    includeNeighbours: false
  })
  const mountNeighbours = useCallback((index: number) => {
    setMountedState((current) => {
      const next = resolveMainTabPagerMountedPages({ mounted: current, selectedIndex: index, includeNeighbours: true })
      return areMainTabPagerMountedPagesEqual(current, next) ? current : next
    })
  }, [])
  useEffect(() => {
    // Record the selected page as visited, then warm never-visited swipe
    // neighbours only after this page settled and the JS thread is idle.
    setMountedState((current) => {
      const next = resolveMainTabPagerMountedPages({ mounted: current, selectedIndex, includeNeighbours: false })
      return areMainTabPagerMountedPagesEqual(current, next) ? current : next
    })
    if (!isMainTabPageSwipeable(selectedIndex)) return
    return scheduleIdle(() => mountNeighbours(selectedIndex))
  }, [mountNeighbours, selectedIndex])

  // ── Per-page focus ──────────────────────────────────────────────────
  const focusHub = useMemo<MainTabPageFocusHub>(
    () => createMainTabPageFocusHub((page) => `${slotKeyRef.current}:${page}`),
    []
  )
  useEffect(() => {
    focusHub.update({ selectedPage: selectedPage.routeName, slotFocused: navigation.isFocused() })
  }, [focusHub, navigation, selectedPage.routeName])
  useEffect(() => {
    const sync = () => focusHub.update({
      selectedPage: selectedRouteNameRef.current,
      slotFocused: navigation.isFocused()
    })
    const addListener = navigation.addListener as unknown as (type: string, listener: () => void) => () => void
    const unsubscribeFocus = addListener("focus", sync)
    const unsubscribeBlur = addListener("blur", sync)
    return () => {
      unsubscribeFocus()
      unsubscribeBlur()
    }
  }, [focusHub, navigation])

  const setUnselectedPageParams = useCallback((page: string, params: object) => {
    const routeName = page as MainTabRouteName
    pageParamsRef.current[routeName] = { ...(pageParamsRef.current[routeName] ?? {}), ...params }
    setLocalParamsVersion((version) => version + 1)
  }, [])
  const pageNavigations = useMemo(
    () => MAIN_TAB_PAGES.map((page) => createMainTabPageNavigation({
      slotNavigation: navigation,
      page: page.routeName,
      hub: focusHub,
      getSelectedPage: () => selectedRouteNameRef.current,
      setUnselectedPageParams
    })),
    [focusHub, navigation, setUnselectedPageParams]
  )

  // ── Commit (JS): the only place a page change reaches navigation ──────
  const syncFromRouteRef = useRef<(index: number) => void>(() => undefined)
  const commitPage = useCallback((index: number) => {
    const state = navigation.getState()
    const slot = state.routes.find((candidate) => candidate.key === slotKeyRef.current)
    const routeName = resolveMainTabPagerCommitRoute(slot?.name, index)
    if (routeName === null) {
      // Navigation already shows another answer (or this page); make the UI follow it.
      syncFromRouteRef.current(getMainTabPageIndex(slot?.name))
      return
    }
    ;(navigation.dispatch as unknown as (action: unknown) => void)(
      createMainTabPagerSelectAction(routeName, pageParamsRef.current[routeName], state.key)
    )
  }, [navigation])

  // ── UI thread state ─────────────────────────────────────────────────
  const width = useSharedValue(windowWidth)
  const position = useSharedValue(selectedIndex * windowWidth)
  const ui = useSharedValue(createMainTabPagerUiState(selectedIndex))
  const settleTarget = useSharedValue(selectedIndex)
  const animating = useSharedValue(false)
  const dragging = useSharedValue(false)
  const caught = useSharedValue(false)
  const gestureEpoch = useSharedValue(0)
  const baseIndex = useSharedValue(selectedIndex)
  const startPosition = useSharedValue(0)
  const startTranslation = useSharedValue(0)
  const reduceMotionValue = useSharedValue(reduceMotion)

  useEffect(() => {
    reduceMotionValue.value = reduceMotion
  }, [reduceMotion, reduceMotionValue])

  const applyTransition = useCallback((transition: MainTabPagerUiTransition) => {
    "worklet"
    ui.value = transition.state
    if (transition.interrupt) {
      dragging.value = false
      caught.value = false
      if (animating.value) {
        animating.value = false
        cancelAnimation(position)
      }
    }
    if (transition.snap) {
      settleTarget.value = transition.state.committedIndex
      position.value = transition.state.committedIndex * width.value
    }
    if (transition.commitIndex !== null) scheduleOnRN(commitPage, transition.commitIndex)
  }, [animating, caught, commitPage, dragging, position, settleTarget, ui, width])

  const syncFromRoute = useCallback((index: number) => {
    scheduleOnUI((routeIndex: number) => {
      "worklet"
      applyTransition(reduceMainTabPagerRouteSync(ui.value, routeIndex))
    }, index)
  }, [applyTransition, ui])
  syncFromRouteRef.current = syncFromRoute

  // Navigation is the source of truth: follow every route change. A change
  // produced by this pager's own settle is already committed on the UI
  // thread and is a no-op there.
  useLayoutEffect(() => {
    syncFromRoute(selectedIndex)
  }, [selectedIndex, syncFromRoute])

  const settleTo = useCallback((target: number, velocity: number) => {
    "worklet"
    settleTarget.value = target
    const targetPosition = target * width.value
    const finish = () => {
      "worklet"
      applyTransition(reduceMainTabPagerSettled(ui.value, target))
    }
    if (reduceMotionValue.value) {
      animating.value = false
      position.value = targetPosition
      finish()
      return
    }
    const epochAtStart = ui.value.epoch
    animating.value = true
    position.value = withSpring(
      targetPosition,
      {
        stiffness: MAIN_TAB_PAGER_SPRING.stiffness,
        damping: MAIN_TAB_PAGER_SPRING.damping,
        mass: MAIN_TAB_PAGER_SPRING.mass,
        velocity: resolveMainTabPagerSettleVelocity({
          position: position.value,
          targetPosition,
          velocity,
          width: width.value
        })
      },
      (finished) => {
        "worklet"
        if (!finished || ui.value.epoch !== epochAtStart) return
        animating.value = false
        finish()
      }
    )
  }, [animating, applyTransition, position, reduceMotionValue, settleTarget, ui, width])

  // ── Bottom-bar taps use the same commit path ──────────────────────────
  useEffect(() => registerMainTabPagerController({
    selectPage: (key: BottomNavKey) => {
      if (!navigation.isFocused()) return false
      const index = MAIN_TAB_PAGES.findIndex((page) => page.key === key)
      if (index < 0) return false
      scheduleOnUI((tappedIndex: number) => {
        "worklet"
        applyTransition(reduceMainTabPagerTap(ui.value, tappedIndex))
      }, index)
      return true
    }
  }), [applyTransition, navigation, ui])

  // ── Interruptions ───────────────────────────────────────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") return
      // Never leave the pager between pages while the app is not visible.
      scheduleOnUI(() => {
        "worklet"
        applyTransition(reduceMainTabPagerSettleToCommitted(ui.value))
      })
    })
    return () => subscription.remove()
  }, [applyTransition, ui])

  useEffect(() => {
    if (Platform.OS !== "android") return
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      // Android back from another main page returns to Discover, as the
      // previous stack of tab routes did.
      if (!navigation.isFocused() || selectedRouteNameRef.current === "Lobby") return false
      const discoverIndex = getMainTabPageIndex("Lobby")
      scheduleOnUI((index: number) => {
        "worklet"
        applyTransition(reduceMainTabPagerTap(ui.value, index))
      }, discoverIndex)
      return true
    })
    return () => subscription.remove()
  }, [applyTransition, navigation, ui])

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    if (!(nextWidth > 0)) return
    scheduleOnUI((measuredWidth: number) => {
      "worklet"
      if (measuredWidth === width.value) return
      width.value = measuredWidth
      applyTransition(reduceMainTabPagerSettleToCommitted(ui.value))
    }, nextWidth)
  }, [applyTransition, ui, width])

  // ── Gesture ─────────────────────────────────────────────────────────
  const pagerGestureRef = useRef<GestureType | undefined>(undefined)
  const pagerGesture = useMemo(() => Gesture.Pan()
    .withRef(pagerGestureRef)
    .enabled(swipeEnabled)
    .activeOffsetX([-MAIN_TAB_PAGER_ACTIVE_OFFSET_X, MAIN_TAB_PAGER_ACTIVE_OFFSET_X])
    .failOffsetY([-MAIN_TAB_PAGER_FAIL_OFFSET_Y, MAIN_TAB_PAGER_FAIL_OFFSET_Y])
    .onBegin(() => {
      "worklet"
      // Touching a settling pager catches it where it is.
      gestureEpoch.value = ui.value.epoch
      caught.value = false
      if (animating.value) {
        animating.value = false
        cancelAnimation(position)
        caught.value = true
      }
    })
    .onStart((event) => {
      "worklet"
      if (gestureEpoch.value !== ui.value.epoch) return
      dragging.value = true
      caught.value = false
      baseIndex.value = resolveMainTabPagerBaseIndex(position.value, width.value)
      startPosition.value = position.value
      startTranslation.value = event.translationX
      scheduleOnRN(mountNeighbours, baseIndex.value)
    })
    .onUpdate((event) => {
      "worklet"
      if (!dragging.value || gestureEpoch.value !== ui.value.epoch) return
      // Reduce Motion: no finger-follow; the release decides an instant switch.
      if (reduceMotionValue.value) return
      position.value = resolveMainTabPagerDragPosition({
        rawPosition: startPosition.value - (event.translationX - startTranslation.value),
        width: width.value,
        baseIndex: baseIndex.value
      })
    })
    .onEnd((event, success) => {
      "worklet"
      if (!dragging.value || gestureEpoch.value !== ui.value.epoch) return
      dragging.value = false
      const velocity = -event.velocityX
      if (!success) {
        settleTo(ui.value.committedIndex, velocity)
        return
      }
      const releasedPosition = reduceMotionValue.value
        ? resolveMainTabPagerDragPosition({
          rawPosition: startPosition.value - (event.translationX - startTranslation.value),
          width: width.value,
          baseIndex: baseIndex.value
        })
        : position.value
      settleTo(resolveMainTabPagerSettleIndex({
        position: releasedPosition,
        velocity,
        width: width.value,
        baseIndex: baseIndex.value
      }), velocity)
    })
    .onFinalize(() => {
      "worklet"
      dragging.value = false
      if (caught.value) {
        // A touch that caught a settle but never became a drag (a tap or a
        // vertical scroll) lets the settle finish.
        caught.value = false
        if (gestureEpoch.value === ui.value.epoch) settleTo(settleTarget.value, 0)
      }
    }), [
    animating,
    baseIndex,
    caught,
    dragging,
    gestureEpoch,
    mountNeighbours,
    position,
    reduceMotionValue,
    settleTarget,
    settleTo,
    startPosition,
    startTranslation,
    swipeEnabled,
    ui,
    width
  ])

  const pageParams = pageParamsRef.current
  return (
    <MainTabPagerGestureProvider value={pagerGestureRef}>
      <GestureDetector gesture={pagerGesture}>
        <View style={styles.container} onLayout={handleLayout}>
          {MAIN_TAB_PAGES.map((page, index) => (
            <MainTabPagerPage
              key={page.routeName}
              index={index}
              routeName={page.routeName}
              slotKey={route.key}
              params={pageParams[page.routeName]}
              mounted={mounted[index] === true}
              selectedIndex={selectedIndex}
              navigation={pageNavigations[index]}
              renderPage={renderPage}
              position={position}
              width={width}
              ui={ui}
            />
          ))}
        </View>
      </GestureDetector>
    </MainTabPagerGestureProvider>
  )
}

interface MainTabPagerPageProps {
  index: number
  routeName: MainTabRouteName
  slotKey: string
  params: object | undefined
  mounted: boolean
  selectedIndex: number
  navigation: unknown
  renderPage: MainTabPagerProps["renderPage"]
  position: { value: number }
  width: { value: number }
  ui: { value: { committedIndex: number } }
}

const MainTabPagerPage = memo(function MainTabPagerPage({
  index,
  routeName,
  slotKey,
  params,
  mounted,
  selectedIndex,
  navigation,
  renderPage,
  position,
  width,
  ui
}: MainTabPagerPageProps) {
  const pageRoute = useMemo(
    () => ({ key: `${slotKey}:${routeName}`, name: routeName, params }),
    [params, routeName, slotKey]
  )
  const accessibility = getMainTabPageAccessibility(index, selectedIndex)
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: getMainTabPageOpacity(index, ui.value.committedIndex),
    transform: [{ translateX: index * width.value - position.value }]
  }))

  return (
    <Animated.View
      pointerEvents={accessibility.pointerEvents}
      accessibilityElementsHidden={accessibility.accessibilityElementsHidden}
      importantForAccessibility={accessibility.importantForAccessibility}
      style={[styles.page, animatedStyle]}
    >
      {mounted ? (
        // A page crash replaces only that page, as when each tab was its own
        // route; the pager, bottom bar and other pages stay usable.
        <ErrorBoundary routeName={routeName}>
          <NavigationContext.Provider value={navigation as never}>
            <NavigationRouteContext.Provider value={pageRoute}>
              {renderPage(routeName, { navigation, route: pageRoute })}
            </NavigationRouteContext.Provider>
          </NavigationContext.Provider>
        </ErrorBoundary>
      ) : null}
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: uiTheme.colors.background
  },
  page: {
    ...StyleSheet.absoluteFill,
    backgroundColor: uiTheme.colors.background
  }
})
