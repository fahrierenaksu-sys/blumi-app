import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { InteractionManager } from "react-native"
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
import { ErrorBoundary } from "./src/ui/errorBoundary"
import {
  initializeCrashReporting,
  Sentry
} from "./src/observability/crashReporting"
import { hydrateAnalyticsConsent } from "./src/analytics/analyticsConsent"
import { BLUMI_BUILD_PROFILE } from "./src/config/env"
import { getAllLegalContent } from "./src/features/legal/legalCopy"
import { assertLegalReleaseReady } from "./src/features/legal/legalPolicyMetadata"

assertLegalReleaseReady({
  buildProfile: BLUMI_BUILD_PROFILE,
  serializedDocuments: JSON.stringify(getAllLegalContent())
})

initializeCrashReporting()

function App() {
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
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <RootNavigator fontsReady={fontsLoaded} />
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  )
}

export default Sentry.wrap(App)
