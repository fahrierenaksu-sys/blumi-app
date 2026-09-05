import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

test("product analytics is explicit-consent, minimal, and replay-free", () => {
  const analytics = read("src/analytics/productAnalytics.ts")
  const policy = read("src/analytics/productAnalyticsPolicy.ts")
  const linking = read("src/navigation/RootNavigator.tsx")
  const session = read("src/features/session/useSessionState.ts")
  const consent = read("src/analytics/analyticsConsent.ts")
  const settings = read("src/screens/SettingsScreen.tsx")
  const settingsCopy = read("src/features/settings/settingsCopy.ts")

  assert.match(analytics, /defaultOptIn:\s*false/)
  assert.match(analytics, /captureAppLifecycleEvents:\s*false/)
  assert.match(analytics, /enableSessionReplay:\s*false/)
  assert.doesNotMatch(analytics, /identify\(/)
  assert.match(analytics, /sanitizeNamedProductEventProperties\(event, properties\)/)
  assert.match(policy, /SENSITIVE_PROPERTY_KEY/)
  assert.match(linking, /capturePendingReferral/)
  assert.match(session, /subscribeToPendingReferralCapture/)
  assert.match(consent, /"unknown"\s*\|\s*"granted"\s*\|\s*"denied"/)
  assert.match(consent, /optOut\(\)/)
  assert.match(consent, /reset\(\)/)
  assert.match(consent, /hydrationPromise/)
  assert.match(settings, /label=\{copy\.analytics\}/)
  assert.match(settingsCopy, /analytics:\s*"Product analytics"/)
  assert.match(settings, /accessibilityRole="switch"/)
  assert.match(settings, /title:\s*copy\.privacyNotSaved/)
  assert.match(settingsCopy, /privacyNotSaved:\s*"Privacy setting not saved"/)
})

test("critical product funnels emit only named analytics events", () => {
  const files = [
    "src/screens/AuthEntryScreen.tsx",
    "src/features/session/useSessionState.ts",
    "src/screens/LobbyScreen.tsx",
    "src/navigation/RootNavigator.tsx",
    "src/screens/ChatThreadScreen.tsx",
    "src/components/ReportModal.tsx",
    "src/screens/CosmeticShopScreen.tsx",
    "src/features/shop/shopPurchaseCoordinator.ts",
    "src/screens/WardrobeV2Screen.tsx",
    "src/screens/MyRoomScreen.tsx"
  ].map(read).join("\n")

  for (const eventName of [
    "onboarding_step_viewed",
    "onboarding_step_completed",
    "discovery_decision",
    "match_created",
    "chat_message_sent",
    "safety_action_completed",
    "purchase_completed",
    "wardrobe_item_equipped",
    "activation_session_started",
    "engagement_app_foregrounded",
    "referral_link_opened",
    "referral_attribution_submitted"
  ]) {
    assert.match(files, new RegExp(`captureProductEvent\\(\\s*[\"']${eventName}[\"']`))
  }
})

function read(path) {
  return readFileSync(resolve(mobileRoot, path), "utf8")
}
