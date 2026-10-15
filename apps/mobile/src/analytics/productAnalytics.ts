import PostHog from "posthog-react-native"
import {
  BLUMI_BUILD_PROFILE,
  BLUMI_POSTHOG_API_KEY,
  BLUMI_POSTHOG_HOST
} from "../config/env"
import {
  sanitizeNamedProductEventProperties,
  type ProductEventProperties
} from "./productAnalyticsPolicy"

export type ProductEventName =
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_intro_performance"
  | "activation_session_started"
  | "engagement_app_foregrounded"
  | "activation_first_discovery_decision"
  | "activation_first_room_change"
  | "discovery_decision"
  | "match_created"
  | "chat_message_sent"
  | "room_invite_sent"
  | "room_invite_accepted"
  | "room_invite_declined"
  | "room_invite_cancelled"
  | "room_joined"
  | "safety_action_completed"
  | "purchase_completed"
  | "purchase_failed"
  | "wardrobe_item_equipped"
  | "referral_link_opened"
  | "referral_share_sheet_opened"
  | "referral_share_sheet_resolved"
  | "referral_attribution_submitted"

let client: PostHog | null = null
let captureEnabled = false

/**
 * The SDK is created only once the user grants consent, so first launch and a
 * refusal make no telemetry request at all. Remote feature flags are never
 * loaded (the app uses none): reset() after a withdrawal would otherwise
 * request /flags.
 */
function createProductAnalyticsClient(): PostHog | null {
  if (!BLUMI_POSTHOG_API_KEY) return null
  return new PostHog(BLUMI_POSTHOG_API_KEY, {
    host: BLUMI_POSTHOG_HOST,
    defaultOptIn: false,
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    setDefaultPersonProperties: false,
    disableRemoteFeatureFlags: true,
    preloadFeatureFlags: false,
    errorTracking: { autocapture: false }
  })
}

/** The client if consent ever created one; never creates it. */
export function getProductAnalyticsClient(): PostHog | null {
  return client
}

/** Creates the client on first consent grant. */
export function ensureProductAnalyticsClient(): PostHog | null {
  if (!client) client = createProductAnalyticsClient()
  return client
}

export function setProductAnalyticsCaptureEnabled(enabled: boolean): void {
  captureEnabled = enabled
}

/** Whether consented capture is active: the same gate captureProductEvent applies. */
export function isProductAnalyticsCaptureEnabled(): boolean {
  return captureEnabled && client !== null
}

export function captureProductEvent(
  event: ProductEventName,
  properties: ProductEventProperties = {}
): void {
  if (!captureEnabled || !client) return
  const safeProperties = sanitizeNamedProductEventProperties(event, properties)
  client.capture(event, {
    ...safeProperties,
    build_profile: BLUMI_BUILD_PROFILE
  })
}
