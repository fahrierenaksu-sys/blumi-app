import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { PreparedDiscoveryLoadingScreen } from "../../ui/BlumiLoadingScreen"
import type { DiscoveryStartupStatus } from "./discoveryStartupModel"

const StartupContext = createContext<{
  deadlineExpired: boolean
  report: (status: DiscoveryStartupStatus) => void
} | null>(null)

/** Mount content while covered: returning a splash instead would deadlock its effects. */
export function DiscoveryStartupBoundary({ children, active }: { children: ReactNode; active: boolean }) {
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
        {covered ? <View style={StyleSheet.absoluteFill}><PreparedDiscoveryLoadingScreen onFinished={onScanFinished} onError={onScanError} /></View> : null}
      </View>
    </StartupContext.Provider>
  )
}

export function useDiscoveryStartupBoundary() { return useContext(StartupContext) }
const styles = StyleSheet.create({ root: { flex: 1 } })
