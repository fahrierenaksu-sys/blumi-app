import { useEffect, useState } from "react"

/**
 * How long a pushed screen may wait for its data before a skeleton appears.
 * A load that beats it never flashes a placeholder; the screen's own
 * background shows meanwhile.
 */
export const SKELETON_DELAY_MS = 300

/**
 * `showsSkeleton` turns on once `loading` has lasted SKELETON_DELAY_MS.
 * `skeletonWasShown` stays on afterwards, so what replaces the skeleton can
 * fade in (a load that beat the delay appears at once, at full opacity).
 */
export function useDelayedSkeleton(loading: boolean, delayMs: number = SKELETON_DELAY_MS): {
  showsSkeleton: boolean
  skeletonWasShown: boolean
} {
  const [due, setDue] = useState(false)
  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setDue(true), delayMs)
    return () => {
      clearTimeout(timer)
      setDue(false)
    }
  }, [delayMs, loading])
  const showsSkeleton = loading && due
  const [wasShown, setWasShown] = useState(false)
  if (showsSkeleton && !wasShown) setWasShown(true)
  return { showsSkeleton, skeletonWasShown: wasShown || showsSkeleton }
}
