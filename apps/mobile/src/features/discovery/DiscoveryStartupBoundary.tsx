import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import Animated, { withTiming } from "react-native-reanimated"
import { PreparedDiscoveryLoadingScreen } from "../../ui/BlumiLoadingScreen"
import { useReducedMotion } from "../../ui/animations"
import type { DiscoveryStartupStatus } from "./discoveryStartupModel"

const StartupContext = createContext<{
  deadlineExpired: boolean
  report: (status: DiscoveryStartupStatus) => void
} | null>(null)

/** The cover lifts off Discover (220 ms fade, slight zoom) instead of vanishing. */
export const STARTUP_COVER_EXIT_MS = 220

function startupCoverExit() {
  "worklet"
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: STARTUP_COVER_EXIT_MS }),
      transform: [{ scale: withTiming(1.03, { duration: STARTUP_COVER_EXIT_MS }) }]
    }
  }
}

/** Mount content while covered: returning a splash instead would deadlock its effects. */
export function DiscoveryStartupBoundary({ children, active }: { children: ReactNode; active: boolean }) {
  const reduceMotion = useReducedMotion()
  const [released, setReleased] = useState(!active)
  const [deadlineExpired, setDeadlineExpired] = useState(false)
  const [discoveryReady, setDiscoveryReady] = useState(false)
  const [scanFinished, setScanFinished] = useState(false)
  useEffect(() => {
    if (discoveryReady && scanFinished) setReleased(true)
  }, [discoveryReady, scanFinished])
  useEffect(() => {
    if (!active || released) return
    const timer = setTimeout(() => {
      setDeadlineExpired(true)
      setReleased(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [active, released])
  const report = useCallback((status: DiscoveryStartupStatus) => {
    setDiscoveryReady(status === "ready")
    if (status === "error") setReleased(true)
  }, [])
  const onScanFinished = useCallback(() => setScanFinished(true), [])
  const onScanError = useCallback(() => {
    setDeadlineExpired(true)
    setReleased(true)
  }, [])
  const value = useMemo(() => ({ deadlineExpired, report }), [deadlineExpired, report])
  const covered = active && !released
  return (
    <StartupContext.Provider value={value}>
      <View style={styles.root}>
        <View style={styles.root} pointerEvents={covered ? "none" : "auto"}
          accessibilityElementsHidden={covered} importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
          {children}
        </View>
        {covered ? (
          <Animated.View exiting={reduceMotion ? undefined : startupCoverExit} pointerEvents="none" style={StyleSheet.absoluteFill}>
            <PreparedDiscoveryLoadingScreen onFinished={onScanFinished} onError={onScanError} />
          </Animated.View>
        ) : null}
      </View>
    </StartupContext.Provider>
  )
}

export function useDiscoveryStartupBoundary() { return useContext(StartupContext) }
const styles = StyleSheet.create({ root: { flex: 1 } })
