import type { AvatarLoadoutCoercionHints, AvatarShowcaseCrop } from "@blumi/domain"
import { Image } from "expo-image"
import { memo, useCallback, useMemo, useState } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"
import { avatarShowcaseFallbackCrop, createAvatarShowcasePlanCache, type AvatarShowcaseFrontPlan } from "../model/avatarShowcaseModel"
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
  /** Required: the figure is one accessible image (who it is, for screen readers). */
  accessibilityLabel: string
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
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const onFrontError = props.onError
  const onLayerError = useCallback((cacheKey: string) => {
    setFailedKey(cacheKey)
    onFrontError?.()
  }, [onFrontError])

  if (plan.kind === "showcase" && failedKey !== plan.cacheKey) {
    return <ShowcaseFront {...props} plan={plan} onLayerError={onLayerError} />
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={props.accessibilityLabel}
      pointerEvents="none"
      style={[{ width, height }, props.style]}
    >
      <AvatarStill
        loadout={loadout}
        hints={hints}
        crop={avatarShowcaseFallbackCrop(crop)}
        width={width}
        height={height}
        onDisplay={props.onDisplay}
        onError={props.onError}
      />
    </View>
  )
})

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
      accessible
      accessibilityRole="image"
      accessibilityLabel={props.accessibilityLabel}
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
