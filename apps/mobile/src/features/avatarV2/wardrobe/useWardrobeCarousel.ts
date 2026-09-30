import { useCallback, useEffect, useRef, useState } from "react"
import { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import {
  getWardrobeCarouselProgress,
  type WardrobeCategoryId
} from "../wardrobeCategoryModel"

/**
 * Horizontal item carousel: the thumb follows the scroll offset on the UI
 * thread (a shared value written by an animated scroll handler, no JS per
 * scroll event); the settled progress (the progressbar's accessibility
 * value) updates on JS once a drag or momentum scroll ends.
 */
export function useWardrobeCarousel(activeCategory: WardrobeCategoryId) {
  const [carouselProgress, setCarouselProgress] = useState(0)
  const [carouselContentWidth, setCarouselContentWidth] = useState(0)
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0)
  const carouselOffsetX = useSharedValue(0)
  const carouselOffsetXRef = useRef(0)

  useEffect(() => {
    setCarouselProgress(0)
    carouselOffsetXRef.current = 0
    carouselOffsetX.value = 0
  }, [activeCategory, carouselOffsetX])

  // Drag-only and momentum scroll interactions both finish here, keeping the
  // progressbar's accessibility `now` value in parity with the animated thumb.
  const handleCarouselSettled = useCallback((
    offsetX: number,
    contentWidth: number,
    viewportWidth: number
  ): void => {
    carouselOffsetXRef.current = offsetX
    setCarouselProgress(getWardrobeCarouselProgress(offsetX, contentWidth, viewportWidth))
  }, [])

  const handleCarouselMetrics = useCallback((
    contentWidth: number,
    viewportWidth: number
  ): void => {
    if (contentWidth <= 0 || viewportWidth <= 0) return
    // The live native offset, read from the UI thread's shared value.
    carouselOffsetXRef.current = carouselOffsetX.value
    setCarouselProgress(getWardrobeCarouselProgress(
      carouselOffsetXRef.current,
      contentWidth,
      viewportWidth
    ))
  }, [carouselOffsetX])

  const handleCarouselContentSizeChange = useCallback((width: number): void => {
    setCarouselContentWidth(width)
  }, [])

  const handleAnimatedCarouselScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      carouselOffsetX.value = event.contentOffset.x
    },
    onEndDrag: (event) => {
      scheduleOnRN(handleCarouselSettled, event.contentOffset.x, event.contentSize.width, event.layoutMeasurement.width)
    },
    onMomentumEnd: (event) => {
      scheduleOnRN(handleCarouselSettled, event.contentOffset.x, event.contentSize.width, event.layoutMeasurement.width)
    }
  }, [carouselOffsetX, handleCarouselSettled])

  const handleCarouselLayout = useCallback((event: {
    nativeEvent: { layout: { width: number } }
  }): void => {
    setCarouselViewportWidth(event.nativeEvent.layout.width)
  }, [])

  useEffect(() => {
    handleCarouselMetrics(carouselContentWidth, carouselViewportWidth)
  }, [carouselContentWidth, carouselViewportWidth, handleCarouselMetrics])

  return {
    carouselOffsetX,
    carouselProgress,
    carouselContentWidth,
    carouselViewportWidth,
    handleAnimatedCarouselScroll,
    handleCarouselContentSizeChange,
    handleCarouselLayout
  }
}
