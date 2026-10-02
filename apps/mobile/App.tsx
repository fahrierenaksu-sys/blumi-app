import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { InteractionManager, StyleSheet } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import {
  SafeAreaProvider,
  initialWindowMetrics
} from "react-native-safe-area-context"
import { useFonts } from "expo-font"
import { RootNavigator } from "./src/navigation/RootNavigator"
import { AppKeyboardProvider } from "./src/ui/keyboard"
import { useOtaUpdates } from "./src/features/appUpdates/useOtaUpdates"
import { ErrorBoundary } from "./src/ui/errorBoundary"
import {
  initializeCrashReporting,
  Sentry
} from "./src/observability/crashReporting"
import { hydrateAnalyticsConsent } from "./src/analytics/analyticsConsent"
import { BLUMI_BUILD_PROFILE } from "./src/config/env"
import { getAllLegalContent } from "./src/features/legal/legalCopy"
import { assertLegalReleaseReady } from "./src/features/legal/legalPolicyMetadata"
import { getAppLocale } from "./src/features/session/appLocale"
import { setUiLocaleSource } from "./src/ui/uiLocale"
import { primeReducedMotionPreference } from "./src/ui/animations"
import { primeReduceTransparencyPreference } from "./src/ui/reduceTransparency"

// Start crash reporting first so a failed release legal check is reported
// instead of terminating before Sentry is installed.
initializeCrashReporting()

// Shared UI (toasts, loading surface) speaks the app language.
setUiLocaleSource(getAppLocale)
// Ask the OS once at launch; surfaces mounting later never flash.
primeReducedMotionPreference()
primeReduceTransparencyPreference()

assertLegalReleaseReady({
  buildProfile: BLUMI_BUILD_PROFILE,
  serializedDocuments: JSON.stringify(getAllLegalContent())
})

function App() {
  useOtaUpdates()
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false
      }
    }
  }))
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void hydrateAnalyticsConsent()
    })
    return () => {
      task.cancel()
    }
  }, [])
  // Native builds embed these fonts at build time (expo-font plugin in
  // app.json), so useFonts finds them already registered and does nothing.
  // It still loads them at runtime where nothing is embedded: Expo Go, web,
  // and a dev client built before the fonts were embedded.
  useFonts(RUNTIME_FONT_FALLBACK)

  return (
    <ErrorBoundary>
      {/* Required for Gesture Handler gestures (the main-page pager). */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <AppKeyboardProvider>
            <QueryClientProvider client={queryClient}>
              <RootNavigator />
            </QueryClientProvider>
          </AppKeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  )
}

// Same files as the embedded fonts, under the same names.
const RUNTIME_FONT_FALLBACK = {
  Inter_400Regular: require("./assets/fonts/Inter_400Regular.ttf"),
  Inter_500Medium: require("./assets/fonts/Inter_500Medium.ttf"),
  Inter_600SemiBold: require("./assets/fonts/Inter_600SemiBold.ttf"),
  Inter_700Bold: require("./assets/fonts/Inter_700Bold.ttf"),
  Inter_800ExtraBold: require("./assets/fonts/Inter_800ExtraBold.ttf"),
  Inter_900Black: require("./assets/fonts/Inter_900Black.ttf")
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1
  }
})

export default Sentry.wrap(App)
