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

const client = BLUMI_POSTHOG_API_KEY
  ? new PostHog(BLUMI_POSTHOG_API_KEY, {
      host: BLUMI_POSTHOG_HOST,
      defaultOptIn: false,
      captureAppLifecycleEvents: false,
      enableSessionReplay: false,
      setDefaultPersonProperties: false,
      errorTracking: { autocapture: false }
    })
  : null

let captureEnabled = false

export function getProductAnalyticsClient(): PostHog | null {
  return client
}

export function setProductAnalyticsCaptureEnabled(enabled: boolean): void {
  captureEnabled = enabled
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
