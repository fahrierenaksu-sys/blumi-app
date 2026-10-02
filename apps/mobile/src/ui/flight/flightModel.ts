/**
 * Frame math for the FlightLayer (ui/flight). Plain worklets with no imports,
 * so the UI thread can call them and node tests can run them.
 */

export interface FlightFrame {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** The window the clone flies in. */
export interface FlightViewport {
  readonly width: number
  readonly height: number
}

/** A frame that cannot be measured or drawn ends the flight (the target simply appears). */
export function isFlightFrameUsable(frame: FlightFrame | null | undefined): frame is FlightFrame {
  "worklet"
  return frame != null &&
    Number.isFinite(frame.x) && Number.isFinite(frame.y) &&
    Number.isFinite(frame.width) && Number.isFinite(frame.height) &&
    frame.width >= 1 && frame.height >= 1
}

/** True when at least part of `frame` is inside the viewport. */
export function isFlightFrameVisible(frame: FlightFrame | null | undefined, viewport: FlightViewport): boolean {
  "worklet"
  if (!isFlightFrameUsable(frame)) return false
  return frame.x + frame.width > 0 && frame.y + frame.height > 0 &&
    frame.x < viewport.width && frame.y < viewport.height
}

/** The clone's frame at `progress` (0 = source, 1 = target; springs may overshoot). */
export function mixFlightFrame(source: FlightFrame, target: FlightFrame, progress: number): FlightFrame {
  "worklet"
  return {
    x: source.x + (target.x - source.x) * progress,
    y: source.y + (target.y - source.y) * progress,
    width: Math.max(1, source.width + (target.width - source.width) * progress),
    height: Math.max(1, source.height + (target.height - source.height) * progress)
  }
}

/**
 * Scale that makes a layer laid out at `base` size cover `frame`. The clone
 * keeps two surfaces (the source look and the target look) at their own
 * sizes and only scales them, so the flight animates transform and opacity
 * only; crossfading them morphs the corner radius.
 */
export function flightLayerScale(frame: FlightFrame, base: { width: number; height: number }): { scaleX: number; scaleY: number } {
  "worklet"
  return {
    scaleX: frame.width / Math.max(1, base.width),
    scaleY: frame.height / Math.max(1, base.height)
  }
}

/** The riding content fades out over the last part of the flight, as the target appears. */
export function flightContentOpacity(progress: number): number {
  "worklet"
  const start = 0.7
  if (progress <= start) return 1
  if (progress >= 1) return 0
  return 1 - (progress - start) / (1 - start)
}

/** The source surface hands over to the target surface across the flight. */
export function flightTargetSurfaceOpacity(progress: number): number {
  "worklet"
  return Math.min(1, Math.max(0, progress * 1.6))
}
