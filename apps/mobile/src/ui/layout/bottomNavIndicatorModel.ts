// Pure rules that let the bottom-bar indicator follow the main-page pager on
// the UI thread. Functions marked 'worklet' run inside Reanimated reactions;
// they are plain functions under node:test.

/**
 * Bottom-bar order. It must equal the main-page pager order (MAIN_TAB_PAGES),
 * because the pager's fractional page index drives the bar's indicator.
 */
export const BOTTOM_NAV_KEY_ORDER = Object.freeze(["discover", "chats", "myroom", "shop"] as const)

/** Shared values the pager writes and the bottom bar reads (see ui/mainTabPagerIndicator.ts). */
export interface MainTabPagerIndicatorValues {
  /** Fractional page index (0 = Discover ... 3 = Shop) last shown while tracking. */
  progress: { value: number }
  /** True while a finger drag or a settle animation moves the pages. */
  tracking: { value: boolean }
  /**
   * Page the pager shows on the UI thread (a tap snaps it before navigation
   * answers), or -1 while no pager is mounted. The bar animates its pill to
   * it in a UI-thread reaction, so a tap never waits for a JS render.
   */
  selection: { value: number }
}

/**
 * Whether the bar's own JS-driven selection motion should run for a newly
 * committed `activeIndex`: not when the pager already moved the pill there
 * on the UI thread.
 */
export function shouldAnimateBottomNavSelectionFromJs(pagerSelection: number, activeIndex: number): boolean {
  return pagerSelection !== activeIndex
}

export interface MainTabPagerIndicatorSample {
  progress: number
  tracking: boolean
}

/**
 * The pager's contribution to the bottom bar for one frame. It tracks only
 * while a drag or settle animation moves the pages; instant changes (a tap,
 * a route sync, Reduce Motion) are left to the bar's own selection motion,
 * which runs when the selected route changes.
 */
export function resolveMainTabPagerIndicatorSample(input: {
  position: number
  width: number
  dragging: boolean
  animating: boolean
}): MainTabPagerIndicatorSample {
  "worklet"
  const progress = input.width > 0 ? input.position / input.width : Number.NaN
  return {
    progress,
    tracking: (input.dragging || input.animating) && Number.isFinite(progress)
  }
}

export function publishMainTabPagerIndicator(
  indicator: MainTabPagerIndicatorValues,
  sample: MainTabPagerIndicatorSample
): void {
  "worklet"
  if (sample.tracking) indicator.progress.value = sample.progress
  indicator.tracking.value = sample.tracking
}

/** The pager's fractional page while it is tracking, otherwise null. */
export function readMainTabPagerIndicatorProgress(indicator: MainTabPagerIndicatorValues): number | null {
  "worklet"
  return indicator.tracking.value ? indicator.progress.value : null
}

/** Indicator position in tab units, kept on the bar through edge rubber bands. */
export function resolveBottomNavIndicatorIndex(progress: number, itemCount: number): number {
  "worklet"
  if (!Number.isFinite(progress) || itemCount <= 0) return 0
  return Math.min(itemCount - 1, Math.max(0, progress))
}

/** The liquid pill stretches at most this much (scaleX 1.26) at full speed. */
export const BOTTOM_NAV_LIQUID_MAX_STRETCH = 0.26
/** Stretch gained per tab per second of indicator speed. */
export const BOTTOM_NAV_LIQUID_STRETCH_PER_SPEED = 0.05
/** Frames closer together than this give no usable speed. */
const BOTTOM_NAV_LIQUID_MIN_FRAME_MS = 4

/**
 * The indicator's speed in tabs per second between two samples, or null when
 * the samples are too close (or out of order) to say.
 */
export function getBottomNavIndicatorSpeed(deltaTabs: number, deltaMs: number): number | null {
  "worklet"
  if (!Number.isFinite(deltaTabs) || !(deltaMs >= BOTTOM_NAV_LIQUID_MIN_FRAME_MS)) return null
  return (deltaTabs / deltaMs) * 1000
}

/**
 * "Liquid" pill: it stretches along the bar with the speed it moves at
 * (either direction), 1 at rest, capped so it never covers a neighbour. The
 * pill eases toward this each frame and springs back (snappy) when it stops.
 */
export function getBottomNavLiquidStretch(speedTabsPerSecond: number): number {
  "worklet"
  if (!Number.isFinite(speedTabsPerSecond)) return 1
  return 1 + Math.min(BOTTOM_NAV_LIQUID_MAX_STRETCH, Math.abs(speedTabsPerSecond) * BOTTOM_NAV_LIQUID_STRETCH_PER_SPEED)
}

/** Share of the gap to the speed's stretch the pill closes per frame. */
export const BOTTOM_NAV_LIQUID_EASE = 0.45

/** The pill's stretch for this frame, eased from the last frame's. */
export function easeBottomNavLiquidStretch(current: number, speedTabsPerSecond: number): number {
  "worklet"
  const from = Number.isFinite(current) ? current : 1
  return from + (getBottomNavLiquidStretch(speedTabsPerSecond) - from) * BOTTOM_NAV_LIQUID_EASE
}

/**
 * The indicator's latest position and frame timestamp (ms; -1 for none yet),
 * and the last one from an earlier frame.
 */
export interface BottomNavLiquidSample {
  index: number
  time: number
  fromIndex: number
  fromTime: number
}

export function createBottomNavLiquidSample(index: number): BottomNavLiquidSample {
  "worklet"
  return { index, time: -1, fromIndex: index, fromTime: -1 }
}

/**
 * Advances the indicator's speed sampling by one change. Times are UI frame
 * timestamps (readUiFrameTimestamp), never wall-clock reads, so the speed
 * does not wobble with when a reaction happened to run. A second change in
 * the same frame is measured again from the earlier frame, not across a
 * near-zero interval.
 */
export function stepBottomNavLiquidSample(
  last: BottomNavLiquidSample,
  index: number,
  now: number
): { next: BottomNavLiquidSample; speed: number | null } {
  "worklet"
  if (!(last.time >= 0) || !Number.isFinite(now)) {
    return { next: { index, time: now, fromIndex: index, fromTime: -1 }, speed: null }
  }
  const deltaMs = now - last.time
  if (deltaMs >= 0 && deltaMs < BOTTOM_NAV_LIQUID_MIN_FRAME_MS) {
    const next = { index, time: last.time, fromIndex: last.fromIndex, fromTime: last.fromTime }
    return {
      next,
      speed: last.fromTime >= 0 ? getBottomNavIndicatorSpeed(index - last.fromIndex, last.time - last.fromTime) : null
    }
  }
  return {
    next: { index, time: now, fromIndex: last.index, fromTime: last.time },
    speed: getBottomNavIndicatorSpeed(index - last.index, deltaMs)
  }
}

/** The timestamp of the UI frame being computed (Reanimated's frame clock). */
export function readUiFrameTimestamp(): number {
  "worklet"
  const frame = (globalThis as { __frameTimestamp?: number }).__frameTimestamp
  return typeof frame === "number" ? frame : performance.now()
}

/** How strongly a tab shows its selected icon and label (0..1) for an indicator position. */
export function getBottomNavItemEmphasis(itemIndex: number, indicatorIndex: number): number {
  "worklet"
  return Math.max(0, 1 - Math.abs(indicatorIndex - itemIndex))
}
