import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { InteractionManager, StyleSheet } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import {
  SafeAreaProvider,
  initialWindowMetrics
} from "react-native-safe-area-context"
import { useFonts } from "expo-font"
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular"
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium"
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold"
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold"
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold"
import { Inter_900Black } from "@expo-google-fonts/inter/900Black"
import { RootNavigator } from "./src/navigation/RootNavigator"
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
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black
  })

  return (
    <ErrorBoundary>
      {/* Required for Gesture Handler gestures (the main-page pager). */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <QueryClientProvider client={queryClient}>
            <RootNavigator fontsReady={fontsLoaded} />
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1
  }
})

export default Sentry.wrap(App)
