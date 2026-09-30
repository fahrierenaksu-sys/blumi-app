import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native"
import {
  getWardrobeCarouselProgress,
  type WardrobeCategoryId
} from "../wardrobeCategoryModel"

/** Horizontal item carousel: animated thumb offset, settled progress and viewport metrics. */
export function useWardrobeCarousel(activeCategory: WardrobeCategoryId) {
  const [carouselProgress, setCarouselProgress] = useState(0)
  const [carouselContentWidth, setCarouselContentWidth] = useState(0)
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0)
  const carouselOffsetX = useRef(new Animated.Value(0)).current
  const carouselOffsetXRef = useRef(0)

  useEffect(() => {
    setCarouselProgress(0)
    carouselOffsetXRef.current = 0
    carouselOffsetX.setValue(0)
  }, [activeCategory, carouselOffsetX])

  // Drag-only and momentum scroll interactions both finish here, keeping the
  // progressbar's accessibility `now` value in parity with the animated thumb.
  const handleCarouselSettled = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>
  ): void => {
    carouselOffsetXRef.current = event.nativeEvent.contentOffset.x
    setCarouselProgress(getWardrobeCarouselProgress(
      event.nativeEvent.contentOffset.x,
      event.nativeEvent.contentSize.width,
      event.nativeEvent.layoutMeasurement.width
    ))
  }, [])

  const handleCarouselMetrics = useCallback((
    contentWidth: number,
    viewportWidth: number
  ): void => {
    if (contentWidth <= 0 || viewportWidth <= 0) return
    setCarouselProgress(getWardrobeCarouselProgress(
      carouselOffsetXRef.current,
      contentWidth,
      viewportWidth
    ))
  }, [])

  const handleCarouselContentSizeChange = useCallback((width: number): void => {
    setCarouselContentWidth(width)
  }, [])

  const handleAnimatedCarouselScroll = useMemo(
    () => Animated.event(
      [{ nativeEvent: { contentOffset: { x: carouselOffsetX } } }],
      {
        useNativeDriver: false,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          carouselOffsetXRef.current = event.nativeEvent.contentOffset.x
        }
      }
    ),
    [carouselOffsetX]
  )

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
    handleCarouselSettled,
    handleCarouselContentSizeChange,
    handleCarouselLayout
  }
}
