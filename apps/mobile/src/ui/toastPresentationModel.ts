/**
 * Pure decisions for the global toast: which toast is on screen while it
 * enters and exits, where it sits above the safe area, bottom bar and
 * keyboard, and what it announces or plays.
 */

export type ToastType = "info" | "success" | "warning"

export interface ToastData {
  id: string
  title: string
  body?: string
  type: ToastType
  durationMs?: number
  /** Plays the type's haptic when shown. Off by default: most callers play their own. */
  haptic?: boolean
  /** An actionable toast (for example "Ayşe is in the room · Join"): runs after dismissing. */
  onPress?: () => void
  /** Spoken label of an actionable toast; a plain toast reads its dismiss label. */
  accessibilityLabel?: string
}

export type ToastPresentationPhase = "hidden" | "visible" | "exiting"

export interface ToastPresentationState {
  /** The toast on screen; kept while it exits so the exit can be seen. */
  toast: ToastData | null
  phase: ToastPresentationPhase
}

export type ToastPresentationEvent =
  | { type: "show"; toast: ToastData }
  | { type: "hide" }
  | { type: "exitFinished"; id: string }

export const TOAST_PRESENTATION_HIDDEN: ToastPresentationState = Object.freeze({
  toast: null,
  phase: "hidden"
})

export function reduceToastPresentation(
  state: ToastPresentationState,
  event: ToastPresentationEvent
): ToastPresentationState {
  switch (event.type) {
    case "show":
      return { toast: event.toast, phase: "visible" }
    case "hide":
      return state.phase === "visible" && state.toast
        ? { toast: state.toast, phase: "exiting" }
        : state
    case "exitFinished":
      // An exit interrupted by a newer toast must not unmount that toast.
      return state.phase === "exiting" && state.toast?.id === event.id
        ? TOAST_PRESENTATION_HIDDEN
        : state
  }
}

/** Gap between the toast and the top of a visible bottom bar. */
export const TOAST_BAR_GAP = 8
/** Gap between the toast and the safe area when no bar is visible. */
export const TOAST_EDGE_GAP = 16
/** Gap between the toast and the top of an open keyboard. */
export const TOAST_KEYBOARD_GAP = 8

export interface ToastKeyboardState {
  visible: boolean
  /** Height the keyboard covers from the window bottom; 0 when the window resizes (Android). */
  inset: number
}

export interface ToastBottomOffsetInput {
  safeAreaBottom: number
  /** Distance from the screen bottom to the top of the visible bottom bar, or null. */
  bottomBarInset: number | null
  keyboard: ToastKeyboardState
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

/** Distance from the screen bottom to the toast's bottom edge. */
export function getToastBottomOffset(input: ToastBottomOffsetInput): number {
  const barOffset = input.bottomBarInset === null
    ? null
    : nonNegative(input.bottomBarInset) + TOAST_BAR_GAP
  if (!input.keyboard.visible) {
    return barOffset ?? nonNegative(input.safeAreaBottom) + TOAST_EDGE_GAP
  }
  // The keyboard covers the safe area; a bar still visible rides with a
  // resized window, so the toast stays above whichever is higher.
  const keyboardOffset = nonNegative(input.keyboard.inset) + TOAST_KEYBOARD_GAP
  return barOffset === null ? keyboardOffset : Math.max(keyboardOffset, barOffset)
}

export function resolveToastKeyboardInset(input: {
  windowHeight: number
  keyboardScreenY: number
}): number {
  return nonNegative(nonNegative(input.windowHeight) - input.keyboardScreenY)
}

export type ToastHapticKind = "success" | "error"

export function getToastHapticKind(type: ToastType): ToastHapticKind | null {
  if (type === "success") return "success"
  if (type === "warning") return "error"
  return null
}

/** A press always dismisses; an actionable toast then runs its action once. */
export function handleToastPress(toast: ToastData | null, dismiss: () => void): void {
  dismiss()
  toast?.onPress?.()
}

export function getToastPressLabel(
  toast: Pick<ToastData, "title" | "accessibilityLabel" | "onPress">,
  labels: { dismissLabel: (title: string) => string; openLabel: (title: string) => string }
): string {
  if (!toast.onPress) return labels.dismissLabel(toast.title)
  return toast.accessibilityLabel ?? labels.openLabel(toast.title)
}

/** Spoken text for screen readers without live regions (iOS VoiceOver). */
export function getToastAnnouncement(toast: Pick<ToastData, "title" | "body">): string {
  return toast.body ? `${toast.title}. ${toast.body}` : toast.title
}
