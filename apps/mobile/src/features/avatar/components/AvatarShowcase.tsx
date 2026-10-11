import type { AvatarLoadoutCoercionHints, AvatarShowcaseCrop, AvatarStillRect } from "@blumi/domain"
import { Image } from "expo-image"
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { avatarShowcaseFallbackCrop, createAvatarShowcasePlanCache, type AvatarShowcaseFrontPlan } from "../model/avatarShowcaseModel"
import type { AvatarStillCrop } from "../model/avatarStillLayout"
import { AVATAR_STILL_ASSETS } from "../stills/stillAssets"
import { AvatarStill } from "./AvatarStill"
import { useStillDisplayReceipts } from "./useStillDisplayReceipts"

export interface AvatarShowcaseProps {
  /** Anyone's loadout as stored or received: resolved by the domain showcase resolver (total). */
  loadout: unknown
  hints?: AvatarLoadoutCoercionHints
  /** `card` the whole front figure, `head` the chat head, `push` the push picture's window. */
  crop: AvatarShowcaseCrop
  width: number
  height: number
  /**
   * The 3/4 crop drawn while the look has no front art (the whole-figure fallback): defaults to `full` for `card` and
   * `bust` otherwise. A surface that showed a half-body still passes `half`, so it looks exactly as before.
   */
  fallbackCrop?: AvatarStillCrop
  /** An explicit window of the 3/4 fallback still (overrides `fallbackCrop`'s own window; the tiny face-tight chip crop). */
  fallbackWindow?: AvatarStillRect
  /** Turns the 3/4 fallback the other way (the partner facing the person); the front view always faces the viewer. */
  mirror?: boolean
  /**
   * The figure is one accessible image (who it is, for screen readers). Left out, it is decorative: a parent that
   * already carries the label (a round chip, a list row) owns the accessibility, and nothing here is focusable.
   */
  accessibilityLabel?: string
  /** Shown behind the figure until every layer has drawn (loading state); transparent by default. */
  placeholderColor?: string
  style?: StyleProp<ViewStyle>
  /** Once, when the whole figure is on screen. */
  onDisplay?: () => void
  /** A layer failed to draw (front layers then fall back to the 3/4 still). */
  onError?: () => void
}

/** Shared by every showcase on screen: equal looks in the same crop and box reuse one plan. */
const planShowcase = createAvatarShowcasePlanCache()

/**
 * The front (SHOWCASE) avatar outside the room: a static stack of baked images, no canvas and no animation. When the
 * front art is not there for the whole look (no base, an item without a front layer, a layer not bundled, a layer that
 * fails to load), the whole figure is today's 3/4 still of the same loadout, never a mix.
 */
export const AvatarShowcase = memo(function AvatarShowcase(props: AvatarShowcaseProps) {
  const { loadout, hints, crop, width, height } = props
  const plan = useMemo(
    () => planShowcase(loadout, crop, { width, height }, { hints, assets: AVATAR_STILL_ASSETS }),
    [crop, height, hints, loadout, width]
  )
  // Parents often pass inline callbacks: a new identity each render must not report the drawn figure again.
  const onDisplay = useStableListener(props.onDisplay)
  const onError = useStableListener(props.onError)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const onLayerError = useCallback((cacheKey: string) => {
    setFailedKey(cacheKey)
    onError?.()
  }, [onError])

  if (plan.kind === "showcase" && failedKey !== plan.cacheKey) {
    return <ShowcaseFront {...props} plan={plan} onDisplay={onDisplay} onError={onError} onLayerError={onLayerError} />
  }
  return (
    <View
      {...figureAccessibility(props.accessibilityLabel)}
      pointerEvents="none"
      style={[{ width, height }, props.style]}
    >
      <AvatarStill
        loadout={loadout}
        hints={hints}
        crop={props.fallbackCrop ?? avatarShowcaseFallbackCrop(crop)}
        window={props.fallbackWindow}
        width={width}
        height={height}
        mirror={props.mirror}
        onDisplay={onDisplay}
        onError={onError}
      />
    </View>
  )
})

/** One labelled image for screen readers, or nothing at all when the parent owns the label. */
function figureAccessibility(label: string | undefined) {
  return label === undefined
    ? ({ accessible: false } as const)
    : ({ accessible: true, accessibilityRole: "image", accessibilityLabel: label } as const)
}

/**
 * The listener's latest closure behind one identity that changes only when a listener is added or removed, so a
 * listener that arrives later (a card promoted to the top) still gets its report and an inline one never re-fires.
 */
function useStableListener(listener: (() => void) | undefined): (() => void) | undefined {
  const latest = useRef(listener)
  useLayoutEffect(() => {
    latest.current = listener
  })
  const hasListener = listener !== undefined
  return useMemo(() => (hasListener ? () => latest.current?.() : undefined), [hasListener])
}

interface ShowcaseFrontProps extends AvatarShowcaseProps {
  plan: AvatarShowcaseFrontPlan
  onLayerError: (cacheKey: string) => void
}

/** The front stack itself; the placeholder stays behind it until every layer has displayed. */
const ShowcaseFront = memo(function ShowcaseFront(props: ShowcaseFrontProps) {
  const { plan, width, height, onDisplay } = props
  const assets = useMemo(() => plan.frames.map((frame) => frame.asset), [plan.frames])
  const [displayedKey, setDisplayedKey] = useState<string | null>(null)
  const onAllDisplayed = useCallback(() => {
    setDisplayedKey(plan.cacheKey)
    onDisplay?.()
  }, [onDisplay, plan.cacheKey])
  const onLayerDisplay = useStillDisplayReceipts(plan.cacheKey, assets, onAllDisplayed)
  const isLoading = displayedKey !== plan.cacheKey
  return (
    <View
      {...figureAccessibility(props.accessibilityLabel)}
      accessibilityState={{ busy: isLoading }}
      pointerEvents="none"
      style={[
        { width, height },
        styles.box,
        isLoading && props.placeholderColor ? { backgroundColor: props.placeholderColor } : null,
        props.style
      ]}
    >
      {plan.frames.map((frame) => (
        <Image
          key={frame.asset}
          source={AVATAR_STILL_ASSETS[frame.asset]}
          style={{ position: "absolute", left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
          contentFit="fill"
          cachePolicy="memory"
          transition={0}
          onDisplay={() => onLayerDisplay(frame.asset)}
          onError={() => props.onLayerError(plan.cacheKey)}
        />
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  box: { overflow: "hidden" }
})
