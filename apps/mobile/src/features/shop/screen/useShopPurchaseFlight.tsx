import { Image as ExpoImage } from "expo-image"
import { useCallback, useEffect, useRef, useState } from "react"
import { Dimensions, StyleSheet, type View } from "react-native"
import { claimFlight, launchFlight } from "../../../ui/flight/FlightLayer"
import { isFlightFrameVisible } from "../../../ui/flight/flightModel"
import { getAvatarItemPreviewSource, getShopProductThumbnailSource } from "../shopAssets"
import type { ShopCatalogItem } from "../shopCatalog"
import type { ShopCheckout } from "../shopCheckoutModel"
import {
  getShopCheckoutFlightProductIds,
  SHOP_PURCHASE_FLIGHT_CHANNEL
} from "./shopPurchaseFlightModel"

const CLEAR_SURFACE = { backgroundColor: "transparent", radius: 14 } as const
/** The landing spot stays mounted this long after touchdown so the clone can fade on it. */
const LANDING_SPOT_LINGER_MS = 400

/**
 * Flies purchased pieces from their shelf thumbnails onto the shop avatar,
 * only after the server confirmed the purchase. A single unlock flies at
 * once and plays the success haptic when the first piece lands (or at once
 * if nothing can fly); a checkout flies its purchased pieces when its sheet
 * closes (its success haptic already played on "applied"). A thumbnail that
 * is not on screen simply does not fly.
 */
export function useShopPurchaseFlight(input: {
  avatarProducts: readonly ShopCatalogItem[]
}) {
  const { avatarProducts } = input
  const thumbnailsRef = useRef(new Map<string, View>())
  const sequenceRef = useRef(0)
  const [landingFlightIds, setLandingFlightIds] = useState<readonly string[]>([])

  const registerThumbnail = useCallback((sourceItemId: string, view: View | null) => {
    if (view) thumbnailsRef.current.set(sourceItemId, view)
    else thumbnailsRef.current.delete(sourceItemId)
  }, [])

  const flyPurchasedPieces = useCallback((sourceItemIds: readonly string[], onFirstLanding?: () => void) => {
    let landed = false
    const settleOne = () => {
      if (!landed) {
        landed = true
        onFirstLanding?.()
      }
    }
    if (sourceItemIds.length === 0) {
      onFirstLanding?.()
      return
    }
    for (const sourceItemId of sourceItemIds) {
      const view = thumbnailsRef.current.get(sourceItemId)
      const product = avatarProducts.find((entry) => entry.sourceItemId === sourceItemId)
      const image = getShopProductThumbnailSource(sourceItemId) ??
        (product?.avatarItem ? getAvatarItemPreviewSource(product.avatarItem) : undefined)
      if (!view || !image) {
        settleOne()
        continue
      }
      view.measureInWindow((x, y, width, height) => {
        const source = { x, y, width, height }
        const window = Dimensions.get("window")
        if (!isFlightFrameVisible(source, { width: window.width, height: window.height })) {
          settleOne()
          return
        }
        sequenceRef.current += 1
        const match = `${sourceItemId}#${sequenceRef.current}`
        let flightId: string | null = null
        const onSettle = () => {
          settleOne()
          const settledId = flightId
          if (settledId) {
            setTimeout(() => {
              setLandingFlightIds((current) => current.filter((id) => id !== settledId))
            }, LANDING_SPOT_LINGER_MS)
          }
        }
        flightId = launchFlight({
          channel: SHOP_PURCHASE_FLIGHT_CHANNEL,
          match,
          source,
          sourceSurface: CLEAR_SURFACE,
          targetSurface: CLEAR_SURFACE,
          contentMode: "scale",
          onSettled: onSettle,
          content: (
            <ExpoImage
              source={image}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={0}
              style={[styles.thumbnail, { width, height }]}
            />
          )
        })
        if (!flightId) {
          settleOne()
          return
        }
        const claimed = claimFlight(SHOP_PURCHASE_FLIGHT_CHANNEL, match)
        if (claimed) setLandingFlightIds((current) => [...current, claimed])
      })
    }
  }, [avatarProducts])

  return { registerThumbnail, flyPurchasedPieces, landingFlightIds }
}

/** A checkout's purchased pieces fly once its sheet is gone and the avatar is in view. */
export function useShopCheckoutFlight(
  checkout: ShopCheckout | null,
  flyPurchasedPieces: (sourceItemIds: readonly string[]) => void
): void {
  const previousCheckoutRef = useRef<ShopCheckout | null>(checkout)
  useEffect(() => {
    const previous = previousCheckoutRef.current
    previousCheckoutRef.current = checkout
    const productIds = getShopCheckoutFlightProductIds(previous, checkout)
    if (productIds.length > 0) flyPurchasedPieces(productIds)
  }, [checkout, flyPurchasedPieces])
}

const styles = StyleSheet.create({
  thumbnail: {
    position: "absolute",
    left: 0,
    top: 0
  }
})
