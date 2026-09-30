import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  captureProductEvent,
  isProductAnalyticsCaptureEnabled
} from "../../analytics/productAnalytics"
import {
  createDiscoveryMatchCreatedReporter,
  type DiscoveryMatchCreatedInput
} from "./discoveryMatchCreatedReporter"

const reporter = createDiscoveryMatchCreatedReporter({
  storage: AsyncStorage,
  isCaptureEnabled: isProductAnalyticsCaptureEnabled,
  captureMatchCreated: (properties) => {
    captureProductEvent("match_created", properties)
  }
})

/** App-wide discovery `match_created` reporter; see discoveryMatchCreatedReporter. */
export function reportDiscoveryMatchCreated(input: DiscoveryMatchCreatedInput): Promise<boolean> {
  return reporter.report(input)
}
