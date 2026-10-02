import { NavigationContext, NavigationRouteContext } from "@react-navigation/native"
import {
  memo,
  startTransition,
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
  FadeIn,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated"
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets"
import type { BottomNavKey } from "../../ui/bottomNav"
import { useReducedMotion } from "../../ui/animations"
import { ErrorBoundary } from "../../ui/errorBoundary"
import {
  publishMainTabPagerIndicator,
  resolveMainTabPagerIndicatorSample
} from "../../ui/layout/bottomNavIndicatorModel"
import { mainTabPagerIndicator } from "../../ui/mainTabPagerIndicator"
import { uiTheme } from "../../ui/theme"
import {
  MAIN_TAB_PAGE_FADE_IN_MS,
  MAIN_TAB_PAGER_ACTIVE_OFFSET_X,
  MAIN_TAB_PAGER_FAIL_OFFSET_Y,
  MAIN_TAB_PAGER_IDLE_MOUNT_DELAY_MS,
  MAIN_TAB_PAGER_SETTLE_COMMIT_FALLBACK_MS,
  MAIN_TAB_PAGER_SPRING,
  MAIN_TAB_PAGES,
  MAIN_TAB_SWIPE_MAX_INDEX,
  MAIN_TAB_SWIPE_MIN_INDEX,
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
  clampMainTabPagerPosition,
  createMainTabPagerUiState,
  getMainTabPageAccessibility,
  getMainTabPageIndex,
  getMainTabPageOpacity,
  getMainTabPagerMountedMask,
  isMainTabPageInMountedMask,
  reduceMainTabPagerCommitRejected,
  reduceMainTabPagerRouteSync,
  reduceMainTabPagerSettleEnd,
  reduceMainTabPagerSettleStart,
  reduceMainTabPagerSettleToCommitted,
  reduceMainTabPagerTap,
  resolveMainTabPagerBaseIndex,
  resolveMainTabPagerCommitRoute,
  resolveMainTabPagerDragPosition,
  resolveMainTabPagerMountedPages,
  resolveMainTabPagerNextIdleMount,
  resolveMainTabPagerSettleIndex,
  resolveMainTabPagerSettleVelocity,
  resolveMainTabPagerSpringEnergyThreshold,
  shouldMainTabPagerTouchCatchSettle,
  withMainTabPageMounted,
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
  /**
   * The bottom bar, drawn inside this slot screen above the pages. A detail
   * route pushed above the slot covers it, and an interactive back swipe
   * reveals it already in place under the finger.
   */
  bottomBar?: ReactNode
}

function scheduleIdle(work: () => void): () => void {
  let idleId: number | null = null
  const timeoutId = setTimeout(() => {
    if (typeof globalThis.requestIdleCallback === "function") {
      idleId = globalThis.requestIdleCallback(() => work())
    } else {
      work()
    }
  }, MAIN_TAB_PAGER_IDLE_MOUNT_DELAY_MS)
  return () => {
    clearTimeout(timeoutId)
    if (idleId !== null && typeof globalThis.cancelIdleCallback === "function") {
      globalThis.cancelIdleCallback(idleId)
    }
  }
}

/** Runs `work` after the next frame, in an idle slot. Returns a cancel. */
function scheduleAfterNextFrame(work: () => void): () => void {
  let cancelled = false
  let frameId: number | null = null
  let idleId: number | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const run = () => {
    if (!cancelled) work()
  }
  const afterFrame = () => {
    frameId = null
    if (cancelled) return
    if (typeof globalThis.requestIdleCallback === "function") {
      idleId = globalThis.requestIdleCallback(run, { timeout: 120 })
    } else {
      timeoutId = setTimeout(run, 0)
    }
  }
  if (typeof globalThis.requestAnimationFrame === "function") {
    frameId = globalThis.requestAnimationFrame(afterFrame)
  } else {
    timeoutId = setTimeout(afterFrame, 16)
  }
  return () => {
    cancelled = true
    if (frameId !== null && typeof globalThis.cancelAnimationFrame === "function") globalThis.cancelAnimationFrame(frameId)
    if (idleId !== null && typeof globalThis.cancelIdleCallback === "function") globalThis.cancelIdleCallback(idleId)
    if (timeoutId !== null) clearTimeout(timeoutId)
  }
}

/**
 * Hosts the four main pages in one native-stack slot route and moves between
 * them with the finger. The slot route name is the only selected-page state:
 * bottom-bar taps and swipes both commit through the router's select action,
 * the UI thread follows the route, and the route changes once per release,
 * when the settle ends, so its renders and the pages' focus work never run
 * during the settle. Pages take touches regardless of the route, so the
 * swiped-to page is interactive the moment it lands.
 * Every frame of a drag or settle runs on the UI thread with shared values.
 */
export function MainTabPager({ navigation: rawNavigation, route, renderPage, bottomBar }: MainTabPagerProps) {
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
  const mountedStateRef = useRef(mountedState)
  mountedStateRef.current = mountedState
  // Whether a drag or settle moves the pages (set from the UI thread when it
  // starts and stops; never read per frame).
  const pagerMovingRef = useRef(false)
  const setPagerMoving = useCallback((moving: boolean) => {
    pagerMovingRef.current = moving
  }, [])
  // Pages first mounted while a drag shows them fade their content in.
  const fadeInPagesRef = useRef(new Set<number>())
  const reduceMotionRef = useRef(reduceMotion)
  reduceMotionRef.current = reduceMotion

  useEffect(() => {
    // Record the selected page as visited.
    setMountedState((current) => {
      const next = resolveMainTabPagerMountedPages({ mounted: current, selectedIndex, includeNeighbours: false })
      return areMainTabPagerMountedPagesEqual(current, next) ? current : next
    })
  }, [selectedIndex])
  useEffect(() => {
    // Once the shown page is up, warm every other page, one per idle slot,
    // nearest first, so a swipe never has to mount a page. A slot that finds
    // the pages moving waits for the next one.
    if (resolveMainTabPagerNextIdleMount(mountedState, selectedIndex) < 0) return
    let active = true
    let cancel = () => undefined as void
    const slot = () => {
      if (!active) return
      if (pagerMovingRef.current) {
        cancel = scheduleIdle(slot)
        return
      }
      startTransition(() => {
        setMountedState((current) => {
          const page = resolveMainTabPagerNextIdleMount(current, selectedIndex)
          return page < 0 ? current : withMainTabPageMounted(current, page)
        })
      })
    }
    cancel = scheduleIdle(slot)
    return () => {
      active = false
      cancel()
    }
  }, [mountedState, selectedIndex])
  // Fallback: a drag that starts before its neighbours were warmed mounts
  // them as a transition, so it never blocks the drag; they fade in.
  const mountNeighboursForDrag = useCallback((index: number) => {
    const next = resolveMainTabPagerMountedPages({
      mounted: mountedStateRef.current,
      selectedIndex: index,
      includeNeighbours: true
    })
    if (areMainTabPagerMountedPagesEqual(mountedStateRef.current, next)) return
    if (!reduceMotionRef.current) {
      next.forEach((isMounted, page) => {
        if (isMounted && mountedStateRef.current[page] !== true) fadeInPagesRef.current.add(page)
      })
    }
    startTransition(() => {
      setMountedState((current) => {
        const merged = current.map((isMounted, page) => isMounted || next[page] === true)
        return areMainTabPagerMountedPagesEqual(current, merged) ? current : merged
      })
    })
  }, [])

  // ── Per-page focus ──────────────────────────────────────────────────
  const focusHub = useMemo<MainTabPageFocusHub>(
    () => createMainTabPageFocusHub((page) => `${slotKeyRef.current}:${page}`),
    []
  )
  const focusInitializedRef = useRef(false)
  useEffect(() => {
    const update = () => focusHub.update({
      selectedPage: selectedRouteNameRef.current,
      slotFocused: navigation.isFocused()
    })
    if (!focusInitializedRef.current) {
      focusInitializedRef.current = true
      update()
      return
    }
    // Page blur/focus work (refreshes, loops, state resets) runs after the
    // commit render has reached the screen, in the next idle slot, never in
    // the frames of a settle or of the commit itself.
    return scheduleAfterNextFrame(update)
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
  const rejectCommitRef = useRef<(index: number) => void>(() => undefined)
  const commitPage = useCallback((index: number) => {
    const state = navigation.getState()
    const slot = state.routes.find((candidate) => candidate.key === slotKeyRef.current)
    const routeName = resolveMainTabPagerCommitRoute(slot?.name, index)
    if (routeName === null) {
      // Navigation already shows another answer (or this page); make the UI follow it.
      rejectCommitRef.current(getMainTabPageIndex(slot?.name))
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
  // Mounted pages as a bitmask the UI thread reads: a tap snaps at once only
  // to a page that is already rendered.
  const mountedMask = getMainTabPagerMountedMask(mounted)
  const mountedMaskValue = useSharedValue(mountedMask)

  useEffect(() => {
    reduceMotionValue.value = reduceMotion
  }, [reduceMotion, reduceMotionValue])
  useEffect(() => {
    mountedMaskValue.value = mountedMask
  }, [mountedMask, mountedMaskValue])

  // The bottom-bar indicator follows the pages in the same UI-thread frame
  // while a drag or settle moves them (no JS per frame).
  useAnimatedReaction(
    () => resolveMainTabPagerIndicatorSample({
      position: position.value,
      width: width.value,
      dragging: dragging.value,
      animating: animating.value
    }),
    (sample) => publishMainTabPagerIndicator(mainTabPagerIndicator, sample)
  )
  // JS learns when the pages start and stop moving (twice per swipe), so idle
  // page mounts never land inside a drag or settle.
  useAnimatedReaction(
    () => dragging.value || animating.value,
    (moving, previous) => {
      if (moving !== previous) scheduleOnRN(setPagerMoving, moving)
    }
  )
  useEffect(() => {
    // The bar's selection follows the page the UI thread shows (tap, settle,
    // route sync), so a tap moves the pill without waiting for JS.
    mainTabPagerIndicator.selection.value = ui.value.committedIndex
    return () => {
      mainTabPagerIndicator.tracking.value = false
      mainTabPagerIndicator.selection.value = -1
    }
  }, [ui])

  const applyTransition = useCallback((transition: MainTabPagerUiTransition) => {
    "worklet"
    ui.value = transition.state
    if (mainTabPagerIndicator.selection.value !== transition.state.committedIndex) {
      mainTabPagerIndicator.selection.value = transition.state.committedIndex
    }
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
  const rejectCommit = useCallback((index: number) => {
    scheduleOnUI((routeIndex: number) => {
      "worklet"
      applyTransition(reduceMainTabPagerCommitRejected(ui.value, routeIndex))
    }, index)
  }, [applyTransition, ui])
  rejectCommitRef.current = rejectCommit

  // Navigation is the source of truth: follow every route change. A change
  // produced by this pager's own settle is already committed on the UI
  // thread and is a no-op there.
  useLayoutEffect(() => {
    syncFromRoute(selectedIndex)
  }, [selectedIndex, syncFromRoute])

  // The settle's end (or a touch that lands it) commits the page the release
  // chose. If the spring's end is ever lost, commit anyway shortly after.
  const commitSettledPage = useCallback(() => {
    "worklet"
    applyTransition(reduceMainTabPagerSettleEnd(ui.value))
  }, [applyTransition, ui])
  const settleFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armSettleCommitFallback = useCallback((epoch: number) => {
    if (settleFallbackRef.current !== null) clearTimeout(settleFallbackRef.current)
    settleFallbackRef.current = setTimeout(() => {
      settleFallbackRef.current = null
      scheduleOnUI((epochAtStart: number) => {
        "worklet"
        if (ui.value.epoch !== epochAtStart || dragging.value || caught.value) return
        commitSettledPage()
      }, epoch)
    }, MAIN_TAB_PAGER_SETTLE_COMMIT_FALLBACK_MS)
  }, [caught, commitSettledPage, dragging, ui])
  useEffect(() => () => {
    if (settleFallbackRef.current !== null) clearTimeout(settleFallbackRef.current)
  }, [])

  const settleTo = useCallback((target: number, velocity: number) => {
    "worklet"
    settleTarget.value = target
    const targetPosition = target * width.value
    // The page is decided now and the UI thread shows it, but navigation is
    // asked only when the pages rest: the commit's renders and the pages'
    // focus work must not compete with the settle's frames. Touch never
    // waits for the commit (getMainTabPageAccessibility).
    applyTransition(reduceMainTabPagerSettleStart(ui.value, target))
    if (reduceMotionValue.value) {
      animating.value = false
      position.value = targetPosition
      commitSettledPage()
      return
    }
    const epochAtStart = ui.value.epoch
    if (ui.value.deferredCommitIndex >= 0) scheduleOnRN(armSettleCommitFallback, epochAtStart)
    const startVelocity = resolveMainTabPagerSettleVelocity({
      position: position.value,
      targetPosition,
      velocity,
      width: width.value
    })
    animating.value = true
    position.value = withSpring(
      targetPosition,
      {
        stiffness: MAIN_TAB_PAGER_SPRING.stiffness,
        damping: MAIN_TAB_PAGER_SPRING.damping,
        mass: MAIN_TAB_PAGER_SPRING.mass,
        velocity: startVelocity,
        // End when the page looks still, not ~0.4 s later.
        energyThreshold: resolveMainTabPagerSpringEnergyThreshold({
          displacement: position.value - targetPosition,
          velocity: startVelocity
        })
      },
      (finished) => {
        "worklet"
        if (!finished || ui.value.epoch !== epochAtStart) return
        animating.value = false
        commitSettledPage()
      }
    )
  }, [
    animating,
    applyTransition,
    armSettleCommitFallback,
    commitSettledPage,
    position,
    reduceMotionValue,
    settleTarget,
    ui,
    width
  ])

  // ── Bottom-bar taps use the same commit path ──────────────────────────
  useEffect(() => registerMainTabPagerController({
    selectPage: (key: BottomNavKey) => {
      if (!navigation.isFocused()) return false
      const index = MAIN_TAB_PAGES.findIndex((page) => page.key === key)
      if (index < 0) return false
      scheduleOnUI((tappedIndex: number) => {
        "worklet"
        applyTransition(reduceMainTabPagerTap(
          ui.value,
          tappedIndex,
          isMainTabPageInMountedMask(mountedMaskValue.value, tappedIndex)
        ))
      }, index)
      return true
    }
  }), [applyTransition, mountedMaskValue, navigation, ui])

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
        applyTransition(reduceMainTabPagerTap(
          ui.value,
          index,
          isMainTabPageInMountedMask(mountedMaskValue.value, index)
        ))
      }, discoverIndex)
      return true
    })
    return () => subscription.remove()
  }, [applyTransition, mountedMaskValue, navigation, ui])

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
      gestureEpoch.value = ui.value.epoch
      caught.value = false
      if (!animating.value) return
      animating.value = false
      cancelAnimation(position)
      const targetPosition = settleTarget.value * width.value
      if (shouldMainTabPagerTouchCatchSettle({ position: position.value, targetPosition })) {
        // Touching a settling pager catches it where it is.
        caught.value = true
      } else {
        // In its last pixels the page lands now; the touch is meant for it.
        position.value = targetPosition
        commitSettledPage()
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
      const base = baseIndex.value
      const mask = mountedMaskValue.value
      const neighboursWarm =
        (base <= MAIN_TAB_SWIPE_MIN_INDEX || isMainTabPageInMountedMask(mask, base - 1)) &&
        (base >= MAIN_TAB_SWIPE_MAX_INDEX || isMainTabPageInMountedMask(mask, base + 1))
      if (!neighboursWarm) scheduleOnRN(mountNeighboursForDrag, base)
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
    commitSettledPage,
    dragging,
    gestureEpoch,
    mountNeighboursForDrag,
    mountedMaskValue,
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
    <View style={styles.slot}>
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
                fadeIn={fadeInPagesRef.current.has(index)}
                isSelected={index === selectedIndex}
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
      {bottomBar}
    </View>
  )
}

interface MainTabPagerPageProps {
  index: number
  routeName: MainTabRouteName
  slotKey: string
  params: object | undefined
  mounted: boolean
  /** The page first mounts while a drag shows it: its content fades in once. */
  fadeIn: boolean
  /** A boolean, not the selected index: a tab change re-renders only the two pages that flip. */
  isSelected: boolean
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
  fadeIn,
  isSelected,
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
  const accessibility = getMainTabPageAccessibility(isSelected)
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: getMainTabPageOpacity(index, ui.value.committedIndex),
    transform: [{ translateX: index * width.value - clampMainTabPagerPosition(position.value, width.value) }]
  }))

  // A page crash replaces only that page, as when each tab was its own
  // route; the pager, bottom bar and other pages stay usable.
  const content = mounted ? (
    <ErrorBoundary routeName={routeName}>
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={pageRoute}>
          {renderPage(routeName, { navigation, route: pageRoute })}
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    </ErrorBoundary>
  ) : null

  return (
    <Animated.View
      pointerEvents={accessibility.pointerEvents}
      accessibilityElementsHidden={accessibility.accessibilityElementsHidden}
      importantForAccessibility={accessibility.importantForAccessibility}
      style={[styles.page, animatedStyle]}
    >
      {fadeIn && content !== null ? (
        // Mounted by a drag that already shows it: fade in instead of popping.
        <Animated.View entering={FadeIn.duration(MAIN_TAB_PAGE_FADE_IN_MS)} style={styles.fill}>
          {content}
        </Animated.View>
      ) : content}
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  slot: {
    flex: 1
  },
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: uiTheme.colors.background
  },
  page: {
    ...StyleSheet.absoluteFill,
    backgroundColor: uiTheme.colors.background
  },
  fill: {
    flex: 1
  }
})
